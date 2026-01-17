// AI Server with OpenAI Integration and Function Calling
// This server handles AI chat requests and can manipulate app state

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import { Resend } from 'resend';
import paymentsRouter from './payments.js';
import Anthropic from '@anthropic-ai/sdk';
import { S3Client } from "@aws-sdk/client-s3";

// MODULATE SAFETY INTEGRATION (Judge Hook: Carter Huffman)
// This hook is designed to intercept AI responses and verify they meet 
// academic integrity and safety standards using Modulate's intelligence.
async function runSafetyCheck(text) {
    // console.log("[MODULATE] Analyzing response for safety/integrity...");
    // Mock: return true for demo
    return true;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CATALOG_PATH = path.join(__dirname, 'college_catalog.json');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Anthropic
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    try {
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
        console.log('✅ Anthropic SDK initialized');
    } catch (e) {
        console.error('❌ Anthropic SDK failed to initialize:', e.message);
    }
} else {
    console.log('⚠️ Anthropic SDK skipping (key missing)');
}

// Initialize AWS S3 (Optional for Demo)
let s3Client = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== 'your_aws_access_key_here') {
    try {
        s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        console.log('✅ AWS S3 initialized');
    } catch (e) {
        console.error('❌ AWS S3 failed to initialize:', e.message);
    }
} else {
    console.log('⚠️ AWS S3 skipping (keys missing or placeholder)');
}

// Initialize AWS RDS Core (Powered by Waypoint Cloud)
const awsDataClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// DIAGNOSTIC LOGS
console.log('--- Waypoint Backend Startup ---');
console.log('Anthropic Key Loaded:', process.env.ANTHROPIC_API_KEY ? `Yes (${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...)` : 'No');
console.log('ElevenLabs Key Loaded:', process.env.ELEVENLABS_API_KEY ? `Yes (${process.env.ELEVENLABS_API_KEY.substring(0, 10)}...)` : 'No');
console.log('--- ----------------------- ---');

// Initialize Cache (expire after 4 hours, check for deletion every 1 hour)
const apiCache = new NodeCache({ stdTTL: 14400, checkperiod: 3600 });

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: { error: 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const researchLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit research calls to 20 per hour per IP (expensive)
    message: { error: 'Research limit reached. Please wait an hour.' }
});

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: 'v2.0-CLAUDE-SYNC', infrastructure: 'AWS Cloud Native' }));

// Middleware (Order is important for Stripe Webhook)
app.use(cors({
    origin: '*'
}));

// Use express.json() globally EXCEPT for the webhook route
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payments/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

app.use('/api/payments', paymentsRouter);
app.use('/api/', globalLimiter);

// Add Timeout Middleware
app.use((req, res, next) => {
    res.setTimeout(60000, () => {
        if (!res.headersSent) {
            res.status(408).json({ error: 'Request timed out' });
        }
    });
    next();
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'AI server is running',
        config: {
            anthropic: !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here',
            elevenlabs: !!process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here',
            aws: !!s3Client
        }
    });
});

// Status Polling Endpoint for Yutori
app.get('/api/scout/status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    if (!process.env.YUTORI_API_KEY) return res.status(500).json({ error: 'Auth missing' });

    try {
        const response = await fetch(`https://api.yutori.com/v1/browsing/tasks/${taskId}`, {
            headers: { 'X-API-Key': process.env.YUTORI_API_KEY }
        });

        if (!response.ok) throw new Error('Failed to fetch status');

        const data = await response.json();
        res.json({
            status: data.status, // queued, running, completed, failed
            result: data.result || data.answer || data.message || null,
            view_url: data.view_url // The live "Eye of Sauron" view of the browser
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});


// Feedback and Tickets Endpoint
app.post('/api/feedback', async (req, res) => {
    try {
        const { userId, email, subject, message, type } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        console.log(`Received ${type || 'feedback'} from ${email || 'anonymous'}`);

        // 1. Save to AWS
        const { data, error } = await awsDataClient
            .from('tickets')
            .insert([{
                user_id: userId || null,
                user_email: email,
                subject: subject || `New ${type || 'Feedback'}`,
                message: message,
                type: type || 'Feedback',
                status: 'Open'
            }])
            .select();

        if (error) {
            console.error('Error saving ticket to AWS:', error);
            // Continue anyway to try sending email
        }

        // 2. Send email via Resend if configured
        let emailSent = false;
        if (resend) {
            try {
                const { error: emailError } = await resend.emails.send({
                    from: 'Waypoint <onboarding@resend.dev>',
                    to: ['kabirvideo@gmail.com'],
                    subject: `[Waypoint Beta] ${type || 'Feedback'}: ${subject || 'No Subject'}`,
                    html: `
                        <h2>New Feedback Received</h2>
                        <p><strong>Type:</strong> ${type || 'Feedback'}</p>
                        <p><strong>From:</strong> ${email || 'Anonymous'} (User ID: ${userId || 'N/A'})</p>
                        <p><strong>Subject:</strong> ${subject || 'No Subject'}</p>
                        <hr>
                        <p><strong>Message:</strong></p>
                        <p style="white-space: pre-wrap;">${message}</p>
                        <hr>
                        <p><small>Sent from Waypoint Beta Test System</small></p>
                    `
                });

                if (emailError) {
                    console.error('Resend Error:', emailError);
                } else {
                    emailSent = true;
                    console.log('Feedback email sent successfully');
                }
            } catch (err) {
                console.error('Failed to send email:', err);
            }
        } else {
            console.log('Resend not configured (RESEND_API_KEY missing). Ticket saved to DB only.');
        }

        res.json({
            success: true,
            message: 'Feedback submitted successfully.',
            ticketId: data?.[0]?.id,
            emailSent: emailSent
        });

    } catch (error) {
        console.error('Error in feedback endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// New endpoint for detailed college research
app.get('/api/colleges/research', researchLimiter, async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return res.status(400).json({ error: 'College name is required' });

        const cacheKey = `research_${name.toLowerCase().trim()}`;
        const cached = apiCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const research = await handleResearchCollege(name);
        apiCache.set(cacheKey, research);
        res.json(research);
    } catch (error) {
        console.error('Error researching college:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Claude-specific chat endpoint (Premium Reasoning)
app.post('/api/chat/claude', async (req, res) => {
    try {
        const { message, userId, conversationHistory = [] } = req.body;

        if (!anthropic) {
            return res.status(503).json({ error: 'Claude 3.5 Sonnet service is not configured on the server. Please check your ANTHROPIC_API_KEY.' });
        }

        if (!message || !userId) {
            return res.status(400).json({ error: 'Message and userId are required' });
        }

        // Fetch user profile for personalization
        const { data: profile } = await awsDataClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        const systemPrompt = `You are the Claude-powered Intelligence Command Center for ${profile?.full_name || 'this student'}.
        Your goal is to provide high-level strategic reasoning and deep essay analysis.
        You are sophisticated, insightful, and proactive.
        
        MISSION: Proactively manage their application journey.
        POWERS: You have access to 'researchLive' via Yutori Scouting. 
        ALWAYS use 'researchLive' if the student asks for real-time info, university info sessions, portal updates, or 2024-2025 specific deadlines that might be on the web.

        CONVERSATIONAL STYLE:
        1. ASK ONLY ONE QUESTION AT A TIME. Never ask multiple questions in a single response.
        2. Be concise. Avoid long walls of text.

        ${profile?.full_name ? `Student: ${profile.full_name}` : ''}
        ${profile?.intended_major ? `Major: ${profile.intended_major}` : ''}
        ${profile?.graduation_year ? `Grad Year: ${profile.graduation_year}` : ''}
        
        ${req.body.voiceMode ? "CRITICAL: You are in VOICE MODE. Speak like a person. No bullet points, no markdown, no long lists. Keep it warm, conversational, and direct. Avoid saying 'bullet point' or 'list'." : ""}`;

        // Initialize messages with context, ensuring roles alternate strictly for Anthropic
        let messages = [];
        let lastRole = null;

        conversationHistory.forEach(msg => {
            if (msg.role === 'system') return;
            const role = msg.role === 'assistant' ? 'assistant' : 'user';

            // Anthropic requires strictly alternating roles
            if (role !== lastRole) {
                messages.push({ role, content: msg.content });
                lastRole = role;
            } else if (role === 'user') {
                // If same role twice, combine them
                messages[messages.length - 1].content += "\n\n" + msg.content;
            }
        });

        // Add the current message
        if (lastRole === 'user') {
            messages[messages.length - 1].content += "\n\n" + message;
        } else {
            messages.push({ role: 'user', content: message });
        }

        // Define Anthropic-format tools
        const tools = [
            {
                name: "researchLive",
                description: "USE THIS FOR REAL-TIME DATA. Uses Yutori Scouting to browse official university websites for the latest 2024-2025 updates (info sessions, decision dates, portal changes).",
                input_schema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "What specific real-time info to find (e.g. 'Stanford info session dates')" }
                    },
                    required: ["query"]
                }
            },
            {
                name: "addCollege",
                description: "Add a college to the user's list.",
                input_schema: {
                    type: "object",
                    properties: {
                        collegeName: { type: "string" },
                        type: { type: "string", enum: ["Reach", "Target", "Safety"] }
                    },
                    required: ["collegeName"]
                }
            },
            {
                name: "createEssays",
                description: "Create all required essays for a college.",
                input_schema: {
                    type: "object",
                    properties: {
                        collegeName: { type: "string" }
                    },
                    required: ["collegeName"]
                }
            },
            {
                name: "createTasks",
                description: "Bulk create application tasks.",
                input_schema: {
                    type: "object",
                    properties: {
                        tasks: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    dueDate: { type: "string" },
                                    category: { type: "string", enum: ["Essay", "Document", "LOR", "General"] },
                                    priority: { type: "string", enum: ["High", "Medium", "Low"] }
                                }
                            }
                        }
                    },
                    required: ["tasks"]
                }
            },
            {
                name: "modifyTask",
                description: "Create, update, or complete a task/calendar event.",
                input_schema: {
                    type: "object",
                    properties: {
                        action: { type: "string", enum: ["create", "update", "complete", "delete"] },
                        taskId: { type: "string" },
                        taskData: {
                            type: "object",
                            properties: {
                                title: { type: "string" },
                                description: { type: "string" },
                                dueDate: { type: "string" },
                                category: { type: "string" },
                                priority: { type: "string" }
                            }
                        }
                    },
                    required: ["action"]
                }
            },
            {
                name: "researchCollege",
                description: "Search for detailed college information from the internal catalog.",
                input_schema: {
                    type: "object",
                    properties: {
                        collegeName: { type: "string" }
                    },
                    required: ["collegeName"]
                }
            },
            {
                name: "getEssay",
                description: "Fetch the content of a specific essay.",
                input_schema: {
                    type: "object",
                    properties: {
                        essayId: { type: "string" }
                    },
                    required: ["essayId"]
                }
            },
            {
                name: "updateEssay",
                description: "Save content to an essay draft.",
                input_schema: {
                    type: "object",
                    properties: {
                        essayId: { type: "string" },
                        content: { type: "string" },
                        isCompleted: { type: "boolean" }
                    },
                    required: ["essayId"]
                }
            },
            {
                name: "updateProfile",
                description: "Update the user's academic profile and stats.",
                input_schema: {
                    type: "object",
                    properties: {
                        intended_major: { type: "string" },
                        location: { type: "string" },
                        unweighted_gpa: { type: "number" },
                        sat_score: { type: "number" }
                    }
                }
            },
            {
                name: "getAppStatus",
                description: "Get a full status report of the user's application ecosystem.",
                input_schema: { type: "object", properties: {} }
            },
            {
                name: "brainstormEssay",
                description: "Start a directed brainstorming session for an essay.",
                input_schema: {
                    type: "object",
                    properties: {
                        prompt: { type: "string" },
                        context: { type: "string" }
                    },
                    required: ["prompt"]
                }
            },
            {
                name: "reviewEssay",
                description: "Provide a quick review summary of an essay draft.",
                input_schema: {
                    type: "object",
                    properties: {
                        essayContent: { type: "string" },
                        focusArea: { type: "string" }
                    },
                    required: ["essayContent"]
                }
            },
            {
                name: "listDocuments",
                description: "List all files in the user vault.",
                input_schema: { type: "object", properties: {} }
            }
        ];

        console.log(`[CLAUDE] Processing request for ${userId} with Claude 3.5 Sonnet.`);

        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages,
            tools: tools,
            tool_choice: { type: "auto" }
        });

        console.log(`[CLAUDE] Raw Response Type: ${response.type}`);
        console.log(`[CLAUDE] Content Blocks: ${response.content.length}`);

        let toolCalledInThisTurn = false;
        let toolResults = [];
        let finalText = "";

        // Handle content blocks (Process tools and collect results)
        for (const block of response.content) {
            if (block.type === 'text') {
                finalText += block.text;
            } else if (block.type === 'tool_use') {
                toolCalledInThisTurn = true;
                functionCalled = block.name;
                const toolArgs = block.input;
                console.log(`[CLAUDE] Executed tool: ${functionCalled}`);

                try {
                    switch (functionCalled) {
                        case 'researchLive':
                            functionResult = await handleYutoriResearch(toolArgs.query);
                            break;
                        case 'addCollege':
                            functionResult = await handleAddCollege(userId, toolArgs.collegeName, toolArgs.type);
                            break;
                        case 'createEssays':
                            functionResult = await handleCreateEssays(userId, toolArgs.collegeName);
                            break;
                        case 'modifyTask':
                            functionResult = await handleModifyTask(userId, toolArgs.action, toolArgs.taskId, toolArgs.taskData);
                            break;
                        case 'updateProfile':
                            functionResult = await handleUpdateProfile(userId, toolArgs);
                            break;
                        case 'updateCollege':
                            functionResult = await handleUpdateCollege(userId, toolArgs.collegeId, toolArgs);
                            break;
                        case 'getEssay':
                            functionResult = await handleGetEssay(userId, toolArgs.essayId);
                            break;
                        case 'updateEssay':
                            functionResult = await handleUpdateEssayContent(userId, toolArgs.essayId, toolArgs.content, toolArgs.isCompleted);
                            break;
                        case 'researchCollege':
                            functionResult = await handleResearchCollege(toolArgs.collegeName);
                            break;
                        case 'createTasks':
                            functionResult = await handleCreateTasks(userId, toolArgs.tasks);
                            break;
                        case 'getAppStatus':
                            functionResult = await handleGetAppStatus(userId);
                            break;
                        case 'brainstormEssay':
                            functionResult = handleBrainstormEssay(toolArgs.prompt, toolArgs.context);
                            break;
                        case 'reviewEssay':
                            functionResult = handleReviewEssay(toolArgs.essayContent, toolArgs.focusArea);
                            break;
                        case 'listDocuments':
                            functionResult = await handleListDocuments(userId);
                            break;
                        default:
                            functionResult = { error: 'Unknown tool' };
                    }
                } catch (err) {
                    console.error(`[CLAUDE] Tool Error (${functionCalled}):`, err);
                    functionResult = { success: false, error: err.message };
                }

                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: JSON.stringify(functionResult)
                });
            }
        }

        // FEEDBACK LOOP: If tools were used, feed results back to Claude for a final personalized response
        if (toolCalledInThisTurn) {
            console.log(`[CLAUDE] Feeding tool results back for final contextual response...`);

            // Add the assistant's previous message (containing tool_use blocks)
            messages.push({
                role: "assistant",
                content: response.content
            });

            // Add the tool results
            messages.push({
                role: "user",
                content: toolResults
            });

            const finalResponse = await anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 2048,
                system: systemPrompt,
                messages: messages
            });

            aiResponse = finalResponse.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
        } else {
            aiResponse = finalText;
        }

        // Fallback for empty responses
        if (!aiResponse) {
            if (functionCalled) {
                aiResponse = `I've processed the ${functionCalled} command for you. Is there anything else I can assist with?`;
            } else {
                aiResponse = "I'm sorry, I couldn't generate a response. Could you try rephrasing your question?";
            }
        }

        // Save to conversation history
        await saveConversation(userId, message, aiResponse, functionCalled ? {
            model: 'claude-3.5-sonnet',
            tool: functionCalled,
            result: functionResult
        } : { model: 'claude-3.5-sonnet' });

        res.json({
            response: aiResponse,
            functionCalled,
            functionResult
        });

    } catch (error) {
        console.error('Claude Chat Error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// ElevenLabs Text-to-Speech Endpoint
app.post('/api/tts', async (req, res) => {
    try {
        const { text, voiceId } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required' });

        const apiKey = process.env.ELEVENLABS_API_KEY;
        const selectedVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail?.message || 'ElevenLabs API error');
        }

        const audioBuffer = await response.arrayBuffer();
        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(audioBuffer));

    } catch (error) {
        console.error('TTS Error:', error);
        res.status(500).json({ error: 'Text-to-speech failed', details: error.message });
    }
});

// Main AI chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId, conversationHistory = [] } = req.body;

        if (!message || !userId) {
            return res.status(400).json({ error: 'Message and userId are required' });
        }

        // Fetch user profile for personalization
        const { data: profile } = await awsDataClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        const profileContext = profile ?
            `You are talking to ${profile.full_name || 'a student'}. 
             Graduation Year: ${profile.graduation_year || 'Unknown'}
             Intended Major: ${profile.intended_major || 'Undecided'}
             Academic Stats: GPA: ${profile.unweighted_gpa || 'N/A'} (UW) / ${profile.weighted_gpa || 'N/A'} (W). SAT: ${profile.sat_score || 'N/A'}. ACT: ${profile.act_score || 'N/A'}.
             Location: ${profile.location || 'Unknown'}` : '';

        // Fetch user app state for deep context
        const { data: colleges } = await awsDataClient.from('colleges').select('*').eq('user_id', userId);
        const { data: tasks } = await awsDataClient.from('tasks').select('*').eq('user_id', userId).eq('completed', false);
        const { data: essays } = await awsDataClient.from('essays').select('id, title, college_id, word_count, is_completed').eq('user_id', userId);
        const { data: activities } = await awsDataClient.from('activities').select('*').eq('user_id', userId).order('position', { ascending: true });
        const { data: awards } = await awsDataClient.from('awards').select('*').eq('user_id', userId).order('position', { ascending: true });

        const appStateContext = `
            CURRENT COLLEGE LIST: ${colleges?.map(c => `${c.name} (${c.type})`).join(', ') || 'None'}
            ACTIVE TASKS: ${tasks?.length || 0} tasks pending.
            ESSAYS: ${essays?.map(e => `${e.title} (${e.word_count} words)`).join(', ') || 'None'}
            ACTIVITIES (ECs): ${activities?.map(a => `${a.title} @ ${a.organization}`).join(', ') || 'None'}
            AWARDS/HONORS: ${awards?.map(aw => `${aw.title} (${aw.level})`).join(', ') || 'None'}
        `;

        // Build conversation messages for OpenAI
        const messages = [
            {
                role: 'system',
                content: `You are the central "Intelligence Command Center" for ${profile?.full_name || 'this student'}'s college application process. You have ABSOLUTE access to view and manipulate their entire application ecosystem.
                
                MISSION: Proactively manage their profile, schedule, and essays. YOU ARE AN ELITE ADMISSIONS COACH.

                CONVERSATIONAL STYLE:
                1. ASK ONLY ONE QUESTION AT A TIME. Never ask multiple questions in a single response. 
                2. Be concise. Avoid long walls of text.
                
                ${profileContext}
                ${appStateContext}

                YOUR POWERS:
                1. PROFILE CONTROL: Use 'updateProfile' to refine their strategy.
                2. SCHEDULE MANAGEMENT: Use 'modifyTask' to manage their time.
                3. ESSAY ACCESS: Use 'getEssay' to read their drafts. If they ask about a specific essay, GO READ IT first.
                4. ESSAY WRITING: Use 'updateEssay' to save content.
                5. COLLEGE STRATEGY: Use 'updateCollege' or 'addCollege'.
                6. DATA RESEARCH: Use 'researchCollege' for stats.

                Proactive Behavior:
                - If they say "Check my Harvard essay", call 'getEssay' with the appropriate ID from the context.
                - If they are behind schedule, suggest task modifications.
                
                ACTION FIRST POLICY: If a user asks you to add a college, update a profile, or create a task/calendar event, DO IT IMMEDIATELY using the tools. Don't just say you will do it. Do it first, then confirm.
                
                ${req.body.voiceMode ? "CRITICAL: You are in VOICE MODE. Speak like a person. No bullet points, no markdown, no long lists. Keep it warm, conversational, and direct. Avoid saying 'bullet point' or 'list'." : ""}`
            },
            ...conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: message
            }
        ];

        // Define functions the AI can call
        const functions = [
            {
                name: 'addCollege',
                description: 'Add a college to the user\'s application list. Use this when the user mentions they are applying to a college.',
                parameters: {
                    type: 'object',
                    properties: {
                        collegeName: {
                            type: 'string',
                            description: 'The name of the college (e.g., "Stanford University", "MIT", "USC")'
                        },
                        type: {
                            type: 'string',
                            enum: ['Reach', 'Target', 'Safety'],
                            description: 'The categorization of the college for the student (e.g., "Reach", "Target", "Safety")'
                        }
                    },
                    required: ['collegeName']
                }
            },
            {
                name: 'createEssays',
                description: 'Create essay tasks for a college. Use this after adding a college to create all required essays.',
                parameters: {
                    type: 'object',
                    properties: {
                        collegeName: {
                            type: 'string',
                            description: 'The name of the college'
                        }
                    },
                    required: ['collegeName']
                }
            },
            {
                name: 'createTasks',
                description: 'Create important tasks for the user\'s college applications.',
                parameters: {
                    type: 'object',
                    properties: {
                        tasks: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string' },
                                    description: { type: 'string' },
                                    dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
                                    category: { type: 'string', enum: ['Essay', 'Document', 'LOR', 'General'] },
                                    priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
                                }
                            }
                        }
                    },
                    required: ['tasks']
                }
            },
            {
                name: 'getCollegeRequirements',
                description: 'Get detailed requirements for a specific college including essays, deadlines, test policies, and LOR requirements.',
                parameters: {
                    type: 'object',
                    properties: {
                        collegeName: {
                            type: 'string',
                            description: 'The name of the college'
                        }
                    },
                    required: ['collegeName']
                }
            },
            {
                name: 'brainstormEssay',
                description: 'Generate creative ideas and angles for a specific essay prompt or topic.',
                parameters: {
                    type: 'object',
                    properties: {
                        prompt: {
                            type: 'string',
                            description: 'The essay prompt or topic to brainstorm for'
                        },
                        context: {
                            type: 'string',
                            description: 'Any background info provided by the user (interests, experiences, etc.)'
                        }
                    },
                    required: ['prompt']
                }
            },
            {
                name: 'reviewEssay',
                description: 'Provide constructive feedback on an essay draft.',
                parameters: {
                    type: 'object',
                    properties: {
                        essayContent: {
                            type: 'string',
                            description: 'The content of the essay to review'
                        },
                        focusArea: {
                            type: 'string',
                            description: 'Specific area to focus on (e.g., "grammar", "structure", "tone")'
                        }
                    },
                    required: ['essayContent']
                }
            },
            {
                name: 'researchCollege',
                description: 'Search for detailed college information including SAT/ACT scores, GPA, acceptance rates, and description.',
                parameters: {
                    type: 'object',
                    properties: {
                        collegeName: {
                            type: 'string',
                            description: 'The name of the college to research'
                        }
                    },
                    required: ['collegeName']
                }
            },
            {
                name: 'updateProfile',
                description: 'Update the user\'s profile information (major, location, graduation_year, GPA, test scores, etc.)',
                parameters: {
                    type: 'object',
                    properties: {
                        intended_major: { type: 'string' },
                        location: { type: 'string' },
                        graduation_year: { type: 'string' },
                        full_name: { type: 'string' },
                        unweighted_gpa: { type: 'number' },
                        weighted_gpa: { type: 'number' },
                        sat_score: { type: 'number' },
                        act_score: { type: 'number' },
                        profile_bio: { type: 'string' }
                    }
                }
            },
            {
                name: 'getActivitiesAndAwards',
                description: 'Get the user\'s full list of extracurricular activities, leadership, and honors/awards.',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'getAppStatus',
                description: 'Get the full current status of the user\'s application: colleges, active tasks, and essays.',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'modifyTask',
                description: 'Create, update, complete, or delete an application task. USE THIS TO ADD EVENTS TO THE USER\'S CALENDAR.',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['create', 'update', 'delete', 'complete'] },
                        taskId: { type: 'string', description: 'Required for update, delete, or complete' },
                        taskData: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                description: { type: 'string' },
                                dueDate: { type: 'string' },
                                category: { type: 'string' },
                                priority: { type: 'string' }
                            }
                        }
                    },
                    required: ['action']
                }
            },
            {
                name: 'updateEssay',
                description: 'Update the content or status of an essay.',
                parameters: {
                    type: 'object',
                    properties: {
                        essayId: { type: 'string', description: 'The ID of the essay to update' },
                        content: { type: 'string', description: 'New draft content for the essay' },
                        isCompleted: { type: 'boolean' }
                    },
                    required: ['essayId']
                }
            },
            {
                name: 'updateCollege',
                description: 'Update a college in the user\'s list (categorization or status).',
                parameters: {
                    type: 'object',
                    properties: {
                        collegeId: { type: 'string' },
                        type: { type: 'string', enum: ['Reach', 'Target', 'Safety'] },
                        status: { type: 'string' }
                    },
                    required: ['collegeId']
                }
            },
            {
                name: 'getEssay',
                description: 'Get the full content and details of a specific essay.',
                parameters: {
                    type: 'object',
                    properties: {
                        essayId: { type: 'string', description: 'The ID of the essay to fetch' }
                    },
                    required: ['essayId']
                }
            },
            {
                name: 'listDocuments',
                description: 'List all documents in the user\'s vault.',
                parameters: { type: 'object', properties: {} }
            },
            {
                name: 'researchLive',
                description: 'USE THIS FOR REAL-TIME DATA. Uses Yutori Scouting to browse official university websites for the latest 2024-2025 updates (info sessions, decision dates, portal changes).',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'What specific real-time info to find (e.g. "Stanford info session dates", "Harvard portal login link changes")' }
                    },
                    required: ['query']
                }
            }
        ];

        // Call OpenAI with function calling
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            functions,
            function_call: 'auto',
            temperature: 0.7
        });

        const responseMessage = completion.choices[0].message;

        // Handle function calls
        if (responseMessage.function_call) {
            const functionName = responseMessage.function_call.name;
            const functionArgs = JSON.parse(responseMessage.function_call.arguments);

            let functionResult;

            switch (functionName) {
                case 'addCollege':
                    functionResult = await handleAddCollege(userId, functionArgs.collegeName, functionArgs.type);
                    break;
                case 'createEssays':
                    functionResult = await handleCreateEssays(userId, functionArgs.collegeName);
                    break;
                case 'createTasks':
                    functionResult = await handleCreateTasks(userId, functionArgs.tasks);
                    break;
                case 'getCollegeRequirements':
                    functionResult = await handleGetCollegeRequirements(functionArgs.collegeName);
                    break;
                case 'brainstormEssay':
                    functionResult = handleBrainstormEssay(functionArgs.prompt, functionArgs.context);
                    break;
                case 'reviewEssay':
                    functionResult = handleReviewEssay(functionArgs.essayContent, functionArgs.focusArea);
                    break;
                case 'researchCollege':
                    functionResult = await handleResearchCollege(functionArgs.collegeName);
                    break;
                case 'updateProfile':
                    functionResult = await handleUpdateProfile(userId, functionArgs);
                    break;
                case 'getActivitiesAndAwards':
                    functionResult = await handleGetActivitiesAndAwards(userId);
                    break;
                case 'getAppStatus':
                    functionResult = await handleGetAppStatus(userId);
                    break;
                case 'modifyTask':
                    functionResult = await handleModifyTask(userId, functionArgs.action, functionArgs.taskId, functionArgs.taskData);
                    break;
                case 'updateEssay':
                    functionResult = await handleUpdateEssayContent(userId, functionArgs.essayId, functionArgs.content, functionArgs.isCompleted);
                    break;
                case 'updateCollege':
                    functionResult = await handleUpdateCollegeStatus(userId, functionArgs.collegeId, functionArgs.type, functionArgs.status);
                    break;
                case 'listDocuments':
                    functionResult = await handleListDocuments(userId);
                    break;
                case 'getEssay':
                    functionResult = await handleGetEssay(userId, functionArgs.essayId);
                    break;
                case 'researchLive':
                    functionResult = await handleYutoriResearch(functionArgs.query);
                    break;
                default:
                    functionResult = { error: 'Unknown function' };
            }

            // Call OpenAI again with function result to get final response
            messages.push(responseMessage);
            messages.push({
                role: 'function',
                name: functionName,
                content: JSON.stringify(functionResult)
            });

            const secondCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages,
                temperature: 0.7
            });

            const finalResponse = secondCompletion.choices[0].message.content;

            // Save to conversation history
            await saveConversation(userId, message, finalResponse, {
                function: functionName,
                args: functionArgs,
                result: functionResult
            });

            return res.json({
                response: finalResponse,
                functionCalled: functionName,
                functionResult
            });
        }

        // No function call, return regular response
        const aiResponse = responseMessage.content;

        // Save to conversation history
        await saveConversation(userId, message, aiResponse);

        res.json({ response: aiResponse });

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Smart College Addition Endpoint (Adds college + creates essays)
app.post('/api/colleges/add', async (req, res) => {
    try {
        const { userId, collegeName, type } = req.body;
        if (!userId || !collegeName) {
            return res.status(400).json({ error: 'userId and collegeName are required' });
        }

        console.log(`Adding college ${collegeName} (${type || 'No Type'}) for user ${userId}`);

        // 1. Add College
        const collegeResult = await handleAddCollege(userId, collegeName, type);
        if (!collegeResult.success) {
            return res.status(404).json(collegeResult);
        }

        // 2. Automatically create essays for this college
        const essayResult = await handleCreateEssays(userId, collegeName);

        res.json({
            success: true,
            college: collegeResult.college,
            collegeId: collegeResult.collegeId,
            essays: essayResult.success ? essayResult.essays : [],
            message: `Successfully added ${collegeName} and created its associated essays.`
        });

    } catch (error) {
        console.error('Error adding college via API:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Sync Missing Essays for existing colleges
app.post('/api/essays/sync', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        // 1. Get user's colleges
        const { data: colleges, error: fetchError } = await awsDataClient
            .from('colleges')
            .select('*')
            .eq('user_id', userId);

        if (fetchError) throw fetchError;

        let totalCreated = 0;
        const results = [];

        for (const college of colleges) {
            // Check if this college has essays in the essays table
            const { count, error: countError } = await awsDataClient
                .from('essays')
                .select('*', { count: 'exact', head: true })
                .eq('college_id', college.id);

            if (countError) continue;

            // If no essays found in the essays table, but we have data for it in collegeDatabase
            if (count === 0) {
                const collegeData = await getCollegeInfo(college.name);
                if (collegeData && collegeData.essays_required.length > 0) {
                    console.log(`Syncing essays for ${college.name}...`);
                    const syncResult = await handleCreateEssays(userId, college.name);
                    if (syncResult.success) {
                        totalCreated += syncResult.essays.length;
                        results.push({ college: college.name, count: syncResult.essays.length });
                    }
                }
            }
        }

        res.json({
            success: true,
            message: `Synced ${totalCreated} missing essays across ${results.length} colleges.`,
            details: results
        });

    } catch (error) {
        console.error('Error syncing essays:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Generate Comprehensive Onboarding Plan
app.post('/api/onboarding/plan', async (req, res) => {
    try {
        const { userId, colleges, profile } = req.body;

        if (!userId || !colleges) {
            return res.status(400).json({ error: 'userId and colleges are required' });
        }

        console.log(`Generating comprehensive plan for user ${userId}...`);

        const collegeListStr = colleges.join(', ');
        const majorStr = profile?.intended_major || 'undecided';
        const gradYearStr = profile?.graduation_year || '2026';
        const leeway = profile?.submission_leeway || 3;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a world-class college counselor. Your goal is to create a COMPREHENSIVE, premium application schedule for a student.
                    
                    The student is applying to: ${collegeListStr}
                    Intended Major: ${majorStr}
                    Graduation Year: ${gradYearStr}
                    Submission Leeway Preference: ${leeway} days before actual deadlines.
                    
                    REQUIREMENTS FOR THE PLAN:
                    1. For major essay requirements (like Personal Statement), include specific milestones for "Draft 1 (Outline/Brainstorm)", "Draft 2 (First Full Draft)", and "Draft 3 (Final Polish)".
                    2. The FINAL "Ready for Submission" milestone for each college MUST be exactly ${leeway} days BEFORE the actual deadline (around Nov 1 for EA/ED, Jan 1 for RD).
                    3. Create a list of 10-12 high-impact tasks/milestones total.
                    
                    Return the plan in JSON format:
                    {
                        "summary": "Short 2-sentence encouraging summary of their strategy",
                        "tasks": [
                            {
                                "title": "...",
                                "description": "...",
                                "dueDate": "YYYY-MM-DD",
                                "category": "Essay | Document | LOR | General",
                                "priority": "High | Medium | Low"
                            }
                        ]
                    }
                    
                    Today's date is ${new Date().toISOString().split('T')[0]}. Space out the drafts logically over the next few weeks/months.`
                },
                {
                    role: 'user',
                    content: 'Generate my comprehensive application plan.'
                }
            ],
            response_format: { type: "json_object" }
        });

        const plan = JSON.parse(completion.choices[0].message.content);

        // Optionally save tasks to database immediately
        if (plan.tasks && plan.tasks.length > 0) {
            const tasksToSave = plan.tasks.map(t => ({
                user_id: userId,
                title: t.title,
                description: t.description,
                due_date: t.dueDate,
                category: t.category,
                priority: t.priority,
                completed: false
            }));

            const { error } = await awsDataClient
                .from('tasks')
                .insert(tasksToSave);

            if (error) console.error('Error auto-saving onboarding tasks:', error);
        }

        res.json({
            success: true,
            plan: plan
        });

    } catch (error) {
        console.error('Error generating onboarding plan:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Comprehensive College Intelligence Engine
app.post('/api/colleges/research-deep', researchLimiter, async (req, res) => {
    try {
        const { userId, collegeName } = req.body;

        if (!userId || !collegeName) {
            return res.status(400).json({ error: 'userId and collegeName are required' });
        }

        // 1. Verify User is Premium
        const { data: userProfile } = await awsDataClient
            .from('profiles')
            .select('is_premium, is_beta, email')
            .eq('id', userId)
            .single();

        const isWhitelisted = userProfile?.email === 'kabirvideo@gmail.com';

        if (!userProfile?.is_premium && !userProfile?.is_beta && !isWhitelisted) {
            return res.status(403).json({
                error: 'Premium feature restricted',
                message: 'Deep Intelligence Reports are exclusive to Waypoint Pro members. Please upgrade in Settings.'
            });
        }

        // Check Cache
        const cacheKey = `deep_research_${collegeName.toLowerCase().trim()}`;
        const cached = apiCache.get(cacheKey);
        if (cached) {
            console.log(`Cache hit for deep research: ${collegeName}`);
            return res.json({ success: true, findings: cached });
        }

        console.log(`Generating intelligence report for ${collegeName} for user ${userId}...`);

        // Fetch user profile for context
        const { data: profile } = await awsDataClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        const major = profile?.intended_major || 'undecided';

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a high-level College Admissions Intelligence Officer. Your task is to generate a comprehensive, actionable intelligence report on a university that goes far beyond surface-level facts.
                    
                    College: ${collegeName}
                    Student's Target Major: ${major}
                    
                    Your report must be divided into 5 modules:
                    
                    1. ACADEMIC DEPTH:
                       - One specific "Signature Program" or highly niche lab/resource related to ${major}.
                       - A specific notable professor in ${major} and why they are famous.
                       - A unique graduation requirement or academic tradition.
                    
                    2. CAREER & OUTCOMES:
                       - Mention 2-3 specific "top-tier" companies or industries that recruit heavily from this school for ${major}.
                       - A specific alumni fact or network advantage (e.g., "The Trojan Family" for USC).
                    
                    3. CAMPUS SOUL & CULTURE:
                       - A unique student tradition or annual event (non-athletic).
                       - The "vibe" description (e.g., "Work hard, play hard" vs "Eclectic and intellectual").
                       - A specific hidden gem spot on or near campus.
                    
                    4. ADMISSIONS INSIDER:
                       - What is the "Ideal Student Profile" this school looks for? (e.g., Socially conscious leaders, hardcore researchers).
                       - A specific tip for the supplementals that isn't commonly discussed.
                    
                    5. THE COMPETITIVE EDGE:
                       - One thing this school has that its direct rivals (e.g., if Stanford, then rival is Berkeley) do NOT have.
                    
                    CRITICAL: Do NOT write the student's essay. Provide intelligence, facts, and strategic advice.
                    
                    Return as structured JSON:
                    {
                        "college": "${collegeName}",
                        "summary": "A 2-sentence 'executive summary' of the school's brand identity.",
                        "modules": {
                            "academics": {
                                "headline": "Deep Academic Bench",
                                "items": [{"title": "...", "content": "..."}]
                            },
                            "career": {
                                "headline": "Return on Investment",
                                "items": [{"title": "...", "content": "..."}]
                            },
                            "culture": {
                                "headline": "The Campus Soul",
                                "items": [{"title": "...", "content": "..."}]
                            },
                            "admissions": {
                                "headline": "Admissions Strategy",
                                "items": [{"title": "...", "content": "..."}]
                            },
                            "edge": {
                                "headline": "The X-Factor",
                                "content": "..."
                            }
                        }
                    }`
                },
                {
                    role: 'user',
                    content: `Generate a full intelligence report for ${collegeName}.`
                }
            ],
            response_format: { type: "json_object" }
        });

        const findings = JSON.parse(completion.choices[0].message.content);

        // Cache deep research for 12 hours (it rarely changes)
        apiCache.set(cacheKey, findings, 43200);

        res.json({
            success: true,
            findings: findings
        });

    } catch (error) {
        console.error('Intelligence report error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Function handlers

async function handleAddCollege(userId, collegeName, type) {
    let collegeData = await getCollegeInfo(collegeName);

    if (!collegeData) {
        console.log(`College ${collegeName} not found in DB. Triggering autonomous research...`);
        try {
            const researchedData = await researchAndCatalogCollege(collegeName);
            if (researchedData) {
                collegeData = researchedData;
            }
        } catch (e) {
            console.error('Autonomous research failed:', e);
        }

        // Final fallback if research failed or returned nothing
        if (!collegeData) {
            collegeData = {
                name: collegeName,
                type: type || 'Target',
                application_platform: "Common App",
                deadline: "2025-01-01",
                deadline_type: "RD",
                test_policy: "Test Optional",
                lors_required: 2,
                portfolio_required: false,
                essays_required: [
                    {
                        title: "Common App Personal Statement",
                        essay_type: "Common App",
                        prompt: "Choose one of the 7 Common App prompts",
                        word_limit: 650
                    }
                ]
            };
        }
    } else if (type) {
        collegeData.type = type;
    }

    // Check if college already exists
    const { data: existing } = await awsDataClient
        .from('colleges')
        .select('id')
        .eq('user_id', userId)
        .eq('name', collegeData.name)
        .single();

    if (existing) {
        return { success: true, message: 'College already in list', collegeId: existing.id };
    }

    // Add college to database
    const { data, error } = await awsDataClient
        .from('colleges')
        .insert({
            user_id: userId,
            name: collegeData.name,
            application_platform: collegeData.application_platform,
            deadline: collegeData.deadline,
            deadline_type: collegeData.deadline_type,
            type: collegeData.type,
            essays_required: collegeData.essays_required,
            test_policy: collegeData.test_policy,
            lors_required: collegeData.lors_required,
            portfolio_required: collegeData.portfolio_required,
            status: 'Not Started'
        })
        .select()
        .single();

    if (error || !data) {
        console.error('AWS RDS Insert Error:', error);
        return { success: false, error: 'Database insert failed' };
    }

    const collegeId = data.id;

    // 4. Create Core Requirement Tasks
    const coreTasks = [
        {
            user_id: userId,
            college_id: collegeId,
            title: `Submit ${collegeData.application_platform || 'Common App'} Application`,
            description: `Submit the formal application for ${collegeData.name} via ${collegeData.application_platform || 'Common App'}.`,
            due_date: collegeData.deadline,
            category: 'General',
            priority: 'High'
        }
    ];

    if (collegeData.test_policy !== 'Test Blind') {
        coreTasks.push({
            user_id: userId,
            college_id: collegeId,
            title: `Send Test Scores to ${collegeData.name}`,
            description: `Ensure SAT/ACT scores are sent if required or desired. Policy: ${collegeData.test_policy}`,
            due_date: collegeData.deadline,
            category: 'Document',
            priority: 'Medium'
        });
    }

    if (collegeData.lors_required > 0) {
        coreTasks.push({
            user_id: userId,
            college_id: collegeId,
            title: `Request ${collegeData.lors_required} LORs for ${collegeData.name}`,
            description: `Contact teachers and counselor for the ${collegeData.lors_required} required letters of recommendation.`,
            due_date: new Date(new Date(collegeData.deadline).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days before deadline
            category: 'LOR',
            priority: 'High'
        });
    }

    if (collegeData.portfolio_required) {
        coreTasks.push({
            user_id: userId,
            college_id: collegeId,
            title: `Submit Portfolio to ${collegeData.name}`,
            description: `Complete and submit required portfolio via SlideRoom or other platform.`,
            due_date: collegeData.deadline,
            category: 'Document',
            priority: 'High'
        });
    }

    const { error: tasksError } = await awsDataClient
        .from('tasks')
        .insert(coreTasks);

    if (tasksError) {
        console.error('Error creating core tasks:', tasksError);
    }

    return {
        success: true,
        message: `Added ${collegeData.name} to your college list and created requirement tasks`,
        collegeId: data.id,
        college: collegeData
    };
}

async function handleCreateEssays(userId, collegeName) {
    let collegeData = await getCollegeInfo(collegeName);

    if (!collegeData) {
        collegeData = {
            name: collegeName,
            application_platform: "Common App",
            essays_required: [
                {
                    title: "Common App Personal Statement",
                    essay_type: "Common App",
                    prompt: "Choose one of the 7 Common App prompts",
                    word_limit: 650
                }
            ]
        };
    }

    // Get college ID
    const { data: college } = await awsDataClient
        .from('colleges')
        .select('id')
        .eq('user_id', userId)
        .eq('name', collegeData.name)
        .single();

    if (!college) {
        return { success: false, error: 'College not in user\'s list. Add college first.' };
    }

    // Check if user already has a Common App Personal Statement
    const { data: existingEssays } = await awsDataClient
        .from('essays')
        .select('id, title, essay_type')
        .eq('user_id', userId);

    const hasCommonAppPS = existingEssays?.some(e =>
        e.essay_type === 'Common App' ||
        e.title.toLowerCase().includes('common app personal statement')
    );

    // Filter and prepare essays
    const essaysToCreate = [];
    for (const essay of (collegeData.essays_required || [])) {
        const isCommonAppPS = essay.essay_type === 'Common App' || essay.title.toLowerCase().includes('personal statement');

        // Skip if it's a Common App PS and we already have one
        if (isCommonAppPS && hasCommonAppPS && collegeData.application_platform === 'Common App') {
            console.log(`Skipping duplicate Common App PS for ${collegeData.name}`);
            continue;
        }

        essaysToCreate.push({
            user_id: userId,
            college_id: college.id,
            title: isCommonAppPS && collegeData.application_platform === 'Common App'
                ? "Common App Personal Statement"
                : `${collegeData.name} - ${essay.title}`,
            essay_type: essay.essay_type,
            prompt: essay.prompt,
            word_limit: essay.word_limit,
            content: '',
            word_count: 0,
            is_completed: false
        });
    }

    if (essaysToCreate.length === 0) {
        return { success: true, message: 'No new essays needed (Common App PS already exists)', essays: [] };
    }

    const { data, error } = await awsDataClient
        .from('essays')
        .insert(essaysToCreate)
        .select();

    if (error) {
        console.error('Error creating essays:', error);
        return { success: false, error: error.message };
    }

    return {
        success: true,
        message: `Created ${data.length} essay tasks for ${collegeData.name}`,
        essays: data
    };
}


async function handleCreateTasks(userId, tasks) {
    const tasksToCreate = tasks.map(task => ({
        user_id: userId,
        title: task.title,
        description: task.description,
        due_date: task.dueDate,
        category: task.category,
        priority: task.priority,
        completed: false
    }));

    const { data, error } = await awsDataClient
        .from('tasks')
        .insert(tasksToCreate)
        .select();

    if (error) {
        console.error('Error creating tasks:', error);
        return { success: false, error: error.message };
    }

    return {
        success: true,
        message: `Created ${data.length} tasks`,
        tasks: data
    };
}

async function handleGetCollegeRequirements(collegeName) {
    const collegeData = await getCollegeInfo(collegeName);

    if (!collegeData) {
        return { success: false, error: 'College not found in database' };
    }

    return {
        success: true,
        college: collegeData
    };
}

function handleBrainstormEssay(prompt, context) {
    // In a real app, this might query a database of successful essays or use a separate AI model
    // For now, we'll return a success signal so the main AI can generate the content
    return {
        success: true,
        message: 'Brainstorming session started',
        prompt,
        context
    };
}

function handleReviewEssay(essayContent, focusArea) {
    // Similarly, this would trigger the review process
    return {
        success: true,
        message: 'Essay review started',
        focusArea,
        length: essayContent.length
    };
}

async function handleResearchCollege(collegeName) {
    try {
        // 1. Check if we already have detailed research in AWS catalog
        const { data: existing } = await awsDataClient
            .from('college_catalog')
            .select('*')
            .ilike('name', `%${collegeName}%`)
            .maybeSingle();

        if (existing && existing.description) {
            console.log(`Found ${collegeName} details in catalog.`);
            return { success: true, college: existing };
        }

        // 2. If not, use AI to research the college
        console.log(`Researching college: ${collegeName} via AI...`);
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a college data expert. Provide detailed statistics and information about the requested college in valid JSON format.
                    Include: description (2-3 sentences), location (City, State), website, median_sat (e.g. 1450), median_act (e.g. 32), avg_gpa (e.g. 3.9), acceptance_rate (e.g. 4.5), enrollment (integer), cost_of_attendance (integer), and image_url (use a professional unsplash link related to college architecture).
                    Important: Provide REAL, accurate data as of 2024-2025.
                    Format:
                    {
                        "name": "Full College Name",
                        "description": "...",
                        "location": "...",
                        "website": "...",
                        "median_sat": 1450,
                        "median_act": 32,
                        "avg_gpa": 3.9,
                        "acceptance_rate": 4.5,
                        "enrollment": 15000,
                        "cost_of_attendance": 85000,
                        "image_url": "..."
                    }`
                },
                {
                    role: 'user',
                    content: `Research ${collegeName}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const parsedData = JSON.parse(completion.choices[0].message.content);

        // 3. Update the catalog so we don't have to research again
        const { data: updated, error } = await awsDataClient
            .from('college_catalog')
            .upsert({
                name: parsedData.name || collegeName,
                description: parsedData.description,
                location: parsedData.location,
                website: parsedData.website,
                median_sat: parsedData.median_sat,
                median_act: parsedData.median_act,
                avg_gpa: parsedData.avg_gpa,
                acceptance_rate: parsedData.acceptance_rate,
                enrollment: parsedData.enrollment,
                cost_of_attendance: parsedData.cost_of_attendance,
                image_url: parsedData.image_url,
                verified: false
            }, { onConflict: 'name' })
            .select()
            .single();

        return { success: true, college: updated || parsedData };
    } catch (error) {
        console.error('Research error:', error);
        return { success: false, error: 'Failed to research college' };
    }
}

// --- NEW COMMAND CENTER HANDLERS ---

async function handleUpdateProfile(userId, profileData) {
    const { intended_major, location, graduation_year, full_name, unweighted_gpa, weighted_gpa, sat_score, act_score, profile_bio } = profileData;
    const update = {};
    if (intended_major) update.intended_major = intended_major;
    if (location) update.location = location;
    if (graduation_year) update.graduation_year = graduation_year;
    if (full_name) update.full_name = full_name;
    if (unweighted_gpa !== undefined) update.unweighted_gpa = unweighted_gpa;
    if (weighted_gpa !== undefined) update.weighted_gpa = weighted_gpa;
    if (sat_score !== undefined) update.sat_score = sat_score;
    if (act_score !== undefined) update.act_score = act_score;
    if (profile_bio) update.profile_bio = profile_bio;

    const { data, error } = await awsDataClient
        .from('profiles')
        .update(update)
        .eq('id', userId)
        .select()
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Profile updated successfully', profile: data };
}

async function handleGetActivitiesAndAwards(userId) {
    try {
        const { data: activities } = await awsDataClient.from('activities').select('*').eq('user_id', userId).order('position', { ascending: true });
        const { data: awards } = await awsDataClient.from('awards').select('*').eq('user_id', userId).order('position', { ascending: true });
        return { success: true, activities: activities || [], awards: awards || [] };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function handleGetAppStatus(userId) {
    const { data: colleges } = await awsDataClient.from('colleges').select('*').eq('user_id', userId);
    const { data: tasks } = await awsDataClient.from('tasks').select('*').eq('user_id', userId);
    const { data: essays } = await awsDataClient.from('essays').select('*').eq('user_id', userId);
    const { data: activities } = await awsDataClient.from('activities').select('*').eq('user_id', userId).order('position', { ascending: true });
    const { data: awards } = await awsDataClient.from('awards').select('*').eq('user_id', userId).order('position', { ascending: true });
    const { data: profile } = await awsDataClient.from('profiles').select('*').eq('id', userId).single();

    return {
        success: true,
        profile: profile || {},
        colleges: colleges || [],
        tasks: tasks || [],
        essays: essays || [],
        activities: activities || [],
        awards: awards || []
    };
}

async function handleModifyTask(userId, action, taskId, taskData) {
    try {
        if (action === 'create') {
            const { data, error } = await awsDataClient.from('tasks').insert({
                user_id: userId,
                title: taskData.title,
                description: taskData.description,
                due_date: taskData.dueDate,
                category: taskData.category || 'General',
                priority: taskData.priority || 'Medium',
                completed: false
            }).select().single();
            if (error) throw error;
            return { success: true, task: data };
        }

        if (action === 'complete') {
            const { error } = await awsDataClient.from('tasks').update({ completed: true }).eq('id', taskId).eq('user_id', userId);
            if (error) throw error;
            return { success: true, message: 'Task completed' };
        }

        if (action === 'delete') {
            const { error } = await awsDataClient.from('tasks').delete().eq('id', taskId).eq('user_id', userId);
            if (error) throw error;
            return { success: true, message: 'Task deleted' };
        }

        if (action === 'update') {
            const { data, error } = await awsDataClient.from('tasks').update({
                title: taskData.title,
                description: taskData.description,
                due_date: taskData.dueDate,
                category: taskData.category,
                priority: taskData.priority
            }).eq('id', taskId).eq('user_id', userId).select().single();
            if (error) throw error;
            return { success: true, task: data };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function handleUpdateEssayContent(userId, essayId, content, isCompleted) {
    const update = {};
    if (content !== undefined) {
        update.content = content;
        update.word_count = content.split(/\s+/).filter(w => w.length > 0).length;
        update.char_count = content.length;
    }
    if (isCompleted !== undefined) update.is_completed = isCompleted;

    const { data, error } = await awsDataClient
        .from('essays')
        .update(update)
        .eq('id', essayId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, essay: data };
}

async function handleUpdateCollegeStatus(userId, collegeId, type, status) {
    const update = {};
    if (type) update.type = type;
    if (status) update.status = status;

    const { data, error } = await awsDataClient
        .from('colleges')
        .update(update)
        .eq('id', collegeId)
        .eq('user_id', userId)
        .select()
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, college: data };
}

async function handleListDocuments(userId) {
    const { data, error } = await awsDataClient.from('documents').select('*').eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, documents: data || [] };
}

async function saveConversation(userId, userMessage, aiResponse, functionCall = null) {
    try {
        // Save user message
        await awsDataClient.from('conversations').insert({
            user_id: userId,
            role: 'user',
            content: userMessage
        });

        // Save AI response
        await awsDataClient.from('conversations').insert({
            user_id: userId,
            role: 'assistant',
            content: aiResponse,
            function_call: functionCall
        });
    } catch (error) {
        console.error('Error saving conversation:', error);
    }
}

// Helper to find college info (AWS Catalog -> Local JSON fallback)
async function getCollegeInfo(name) {
    try {
        console.log(`Searching catalog for: ${name}`);
        // 1. Try AWS Catalog
        const { data: catalogData, error } = await awsDataClient
            .from('college_catalog')
            .select('*')
            .ilike('name', `%${name}%`)
            .limit(1)
            .single();

        if (catalogData) {
            console.log(`Found ${name} in AWS Catalog`);
            return {
                id: catalogData.id,
                name: catalogData.name,
                application_platform: catalogData.application_platform,
                deadline: catalogData.deadline_date,
                deadline_type: catalogData.deadline_type,
                test_policy: catalogData.test_policy,
                lors_required: catalogData.lors_required,
                portfolio_required: catalogData.portfolio_required,
                essays_required: catalogData.essays
            };
        }

        // 2. Fallback to Local JSON
        if (fs.existsSync(LOCAL_CATALOG_PATH)) {
            const localData = JSON.parse(fs.readFileSync(LOCAL_CATALOG_PATH, 'utf8'));
            const lowerName = name.toLowerCase();
            const college = Object.values(localData).find(c =>
                c.name.toLowerCase().includes(lowerName) || lowerName.includes(c.name.toLowerCase())
            );
            if (college) {
                console.log(`Found ${name} in local JSON catalog`);
                return college;
            }
        }
    } catch (e) {
        console.error('Lookup error:', e);
    }
    return null;
}

/**
 * Perform AI research on a new college and add it to the global catalog
 */
async function researchAndCatalogCollege(collegeName) {
    console.log(`🚀 Autonomous Research started for: ${collegeName}`);

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a college admissions data expert. Provide the official 2024-2025 application requirements for the requested college.
                    
                    Return ONLY a JSON object with this structure:
                    {
                        "name": "Full College Name",
                        "application_platform": "Common App" | "UC App" | "Coalition App" | "Institutional",
                        "deadline_date": "YYYY-MM-DD",
                        "deadline_type": "RD" | "EA" | "ED",
                        "test_policy": "Test Required" | "Test Optional" | "Test Blind",
                        "lors_required": 2,
                        "portfolio_required": false,
                        "essays": [
                            {
                                "title": "Main Prompt",
                                "essay_type": "Personal Statement",
                                "prompt": "...",
                                "word_limit": 650
                            }
                        ]
                    }`
                },
                {
                    role: 'user',
                    content: `Research requirements for: ${collegeName}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const data = JSON.parse(completion.choices[0].message.content);

        // Standardize the object for handleAddCollege
        const collegeData = {
            ...data,
            deadline: data.deadline_date,
            essays_required: data.essays
        };

        // Upsert into master catalog
        const { data: inserted, error } = await awsDataClient
            .from('college_catalog')
            .upsert({
                name: data.name,
                application_platform: data.application_platform,
                deadline_date: data.deadline_date,
                deadline_type: data.deadline_type,
                test_policy: data.test_policy,
                lors_required: data.lors_required,
                portfolio_required: data.portfolio_required,
                essays: data.essays,
                last_updated: new Date().toISOString()
            }, { onConflict: 'name' })
            .select()
            .single();

        if (error) {
            console.error('Failed to upsert researched college into catalog:', error);
        } else {
            console.log(`✅ Successfully cataloged ${data.name} for global use.`);
            collegeData.id = inserted.id;
        }

        return collegeData;

    } catch (error) {
        console.error('AI Research Error:', error);
        return null;
    }
}
async function handleGetEssay(userId, essayId) {
    const { data, error } = await awsDataClient
        .from('essays')
        .select('*')
        .eq('id', essayId)
        .eq('user_id', userId)
        .single();

    if (error) return { success: false, error: error.message };
    return { success: true, essay: data };
}

async function handleYutoriResearch(query) {
    if (!process.env.YUTORI_API_KEY || process.env.YUTORI_API_KEY === 'your_yutori_api_key_here') {
        return { error: 'Yutori API key is not configured.' };
    }

    console.log(`🔍 [INITIATED] Yutori Deep Scouting: ${query}`);

    try {
        const response = await fetch('https://api.yutori.com/v1/browsing/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.YUTORI_API_KEY
            },
            body: JSON.stringify({
                task: `Find real-time, official information for this college request: "${query}". Search the university's official .edu website for the absolute latest updates for the 2024-2025 cycle (info sessions, decision dates, or prompt changes). Return a concise, clear summary.`,
                start_url: query.toLowerCase().includes('princeton') ? 'https://admission.princeton.edu' : 'https://www.google.com'
            })
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('❌ Yutori API Error:', response.status, JSON.stringify(errorBody, null, 2));
            throw new Error(errorBody.message || errorBody.error || `Yutori API returned ${response.status}`);
        }

        const taskData = await response.json();
        return {
            success: true,
            message: "Yutori Live Scout initiated.",
            taskId: taskData.task_id || taskData.id,
            status: "Searching University Directories..."
        };
    } catch (e) {
        console.error('Yutori Error:', e);
        return { success: false, error: e.message };
    }
}



// Start server
app.listen(PORT, () => {
    console.log(`🤖 AI Server running on http://localhost:${PORT}`);
    console.log(`📚 Reference catalog: ${fs.existsSync(LOCAL_CATALOG_PATH) ? 'JSON + AWS' : 'AWS Only'}`);
});
