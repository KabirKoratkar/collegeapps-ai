// AI Server for Waypoint
// Handles AI chat, college research, and application management

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CATALOG_PATH = path.join(__dirname, 'college_catalog.json');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
let openai = null;
try {
    if (process.env.OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        console.log('✅ OpenAI initialized');
    } else {
        console.warn('⚠️ OPENAI_API_KEY missing - AI features will be disabled');
    }
} catch (e) {
    console.warn('⚠️ OpenAI initialization failed:', e.message);
}

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
}

// Initialize Supabase with service key (for server-side operations)
let supabase = null;
try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
        console.log('✅ Supabase Admin initialized');
    } else {
        console.error('❌ Supabase credentials missing (SUPABASE_URL or SUPABASE_SERVICE_KEY)');
    }
} catch (e) {
    console.error('❌ Supabase initialization failed:', e.message);
}

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Cache
const apiCache = new NodeCache({ stdTTL: 14400, checkperiod: 3600 });

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please slow down.' }
});

const researchLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: { error: 'Research limit reached. Please wait an hour.' }
});

// Health Checks (MUST BE TOP LEVEL - Before CORS/JSON/RateLimits)
app.get('/', (req, res) => res.status(200).send('Waypoint AI Server is running.'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', infrastructure: 'Supabase Native' }));

app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
    if (req.originalUrl === '/api/payments/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

app.use('/api/payments', paymentsRouter);
app.use('/api/', globalLimiter);

// Additional routes...

// Feedback and Tickets
app.post('/api/feedback', async (req, res) => {
    try {
        const { userId, email, subject, message, type } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const { data, error } = await supabase
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

        if (resend) {
            await resend.emails.send({
                from: 'Waypoint <onboarding@resend.dev>',
                to: ['kabirvideo@gmail.com'],
                subject: `[Waypoint Beta] ${type || 'Feedback'}: ${subject || 'No Subject'}`,
                html: `<p><strong>From:</strong> ${email || 'Anonymous'}</p><p>${message}</p>`
            }).catch(e => console.error('Email failed:', e));
        }

        res.json({ success: true, ticketId: data?.[0]?.id });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// College Research Endpoint
app.get('/api/colleges/research', researchLimiter, async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return res.status(400).json({ error: 'College name is required' });

        const cacheKey = `research_${name.toLowerCase().trim()}`;
        const cached = apiCache.get(cacheKey);
        if (cached) return res.json(cached);

        const research = await handleResearchCollege(name);
        apiCache.set(cacheKey, research);
        res.json(research);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Handle Claude Chat (Claude 3.5 Sonnet)
 */
app.post('/api/chat/claude', async (req, res) => {
    try {
        const { message, userId, conversationHistory = [], saveToHistory = true, sessionId, category } = req.body;
        if (!anthropic) return res.status(503).json({ error: 'Claude service not configured' });
        if (!message || !userId) return res.status(400).json({ error: 'Message and userId are required' });

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();

        const systemPrompt = `You are the Claude-powered Intelligence Command Center for ${profile?.full_name || 'this student'}.
        Your goal is to provide high-level strategic reasoning and deep essay analysis.
        Be sophisticated, insightful, and proactive.
        
        Student Context:
        Name: ${profile?.full_name || 'Unknown'}
        Major: ${profile?.intended_major || 'Undecided'}
        Grad Year: ${profile?.graduation_year || 'Unknown'}`;

        const messages = conversationHistory
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            }));
        messages.push({ role: 'user', content: message });

        const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1536,
            system: systemPrompt,
            messages: messages,
        });

        const aiResponse = response.content[0].text;
        await saveConversation(userId, message, aiResponse, { model: 'claude-3.5-sonnet', sessionId, category });

        res.json({ response: aiResponse });
    } catch (error) {
        console.error('Claude error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/colleges/add', async (req, res) => {
    try {
        const { userId, collegeName, type } = req.body;
        if (!userId || !collegeName) return res.status(400).json({ error: 'userId and collegeName are required' });
        const result = await handleAddCollege(userId, collegeName, type);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/essays/sync', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const { data: colleges } = await supabase.from('colleges').select('*').eq('user_id', userId);
        if (!colleges) return res.json({ success: true, count: 0 });

        let totalCreated = 0;
        for (const college of colleges) {
            const result = await handleCreateEssays(userId, college.name);
            if (result.success) totalCreated += (result.count || 0);
        }

        res.json({ success: true, count: totalCreated });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/colleges/research-deep', researchLimiter, async (req, res) => {
    try {
        const { userId, collegeName } = req.body;
        if (!collegeName) return res.status(400).json({ error: 'collegeName is required' });

        console.log(`[DEEP RESEARCH] Generating Intelligence Report for ${collegeName}`);

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `Generate a comprehensive "Intelligence Report" for ${collegeName}. 
                You are a senior admissions insider with specialized knowledge of this specific university.

                Format the response as a JSON object with this exact structure:
                {
                  "college": "${collegeName}",
                  "summary": "A 1-2 sentence high-level executive summary.",
                  "modules": {
                    "academics": {
                      "headline": "Intellectual Climate",
                      "items": [
                        { "title": "Academic Rigor", "content": "..." },
                        { "title": "Unique Programs", "content": "..." }
                      ]
                    },
                    "culture": {
                      "headline": "Campus Life & Values",
                      "items": [
                        { "title": "Student Vibe", "content": "..." },
                        { "title": "Core Values", "content": "..." }
                      ]
                    },
                    "career": {
                      "headline": "Post-Grad Intelligence",
                      "items": [
                        { "title": "Industry Pipelines", "content": "..." },
                        { "title": "Network Strength", "content": "..." }
                      ]
                    },
                    "admissions": {
                      "headline": "Admissions Insider",
                      "items": [
                        { "title": "What They Look For", "content": "..." },
                        { "title": "Essay Strategy", "content": "..." }
                      ]
                    },
                    "edge": {
                      "content": "Specific actionable advice to win."
                    }
                  }
                }`
            }],
            response_format: { type: "json_object" }
        });

        const findings = JSON.parse(completion.choices[0].message.content);
        res.json({ success: true, findings });
    } catch (error) {
        console.error('Deep Research Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Handle Main AI Chat (GPT-4o)
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId, conversationHistory = [] } = req.body;
        if (!message || !userId) return res.status(400).json({ error: 'Message and userId are required' });

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        const { data: colleges } = await supabase.from('colleges').select('*').eq('user_id', userId);

        const profileContext = profile ? `Student: ${profile.full_name}, Major: ${profile.intended_major}, GPA: ${profile.unweighted_gpa}` : '';
        const appStateContext = `Colleges: ${colleges?.map(c => c.name).join(', ') || 'None'}`;

        const messages = [
            {
                role: 'system',
                content: `You are the Admissions Intelligence Command Center for ${profileContext}.
                Manage their application ecosystem using tools. Be concise.
                
                ${appStateContext}`
            },
            ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        const functions = [
            {
                name: "researchCollege",
                description: "Get detailed statistics/requirements for a college",
                parameters: {
                    type: "object",
                    properties: { collegeName: { type: "string" } },
                    required: ["collegeName"]
                }
            },
            {
                name: "addCollege",
                description: "Add a college to the user's list",
                parameters: {
                    type: "object",
                    properties: {
                        collegeName: { type: "string" },
                        type: { type: "string", enum: ["Reach", "Target", "Safety"] }
                    },
                    required: ["collegeName"]
                }
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

        // Save to conversation history if requested
        if (saveToHistory) {
            await saveConversation(userId, message, aiResponse, functionCalled ? {
                model: 'claude-3.5-sonnet',
                tool: functionCalled,
                result: functionResult,
                sessionId,
                category
            } : { model: 'claude-3.5-sonnet', sessionId, category });
        }

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
        const { message, userId, conversationHistory = [], saveToHistory = true, sessionId, category } = req.body;

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
            function_call: 'auto'
        });

        const responseMessage = completion.choices[0].message;

        if (responseMessage.function_call) {
            const { name: functionName, arguments: functionArgsRaw } = responseMessage.function_call;
            const functionArgs = JSON.parse(functionArgsRaw);
            let result;

            if (functionName === 'researchCollege') {
                result = await handleResearchCollege(functionArgs.collegeName);
            } else if (functionName === 'addCollege') {
                result = await handleAddCollege(userId, functionArgs.collegeName, functionArgs.type);
            }

            const secondCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    ...messages,
                    responseMessage,
                    { role: 'function', name: functionName, content: JSON.stringify(result) }
                ]
            });

            const finalResponse = secondCompletion.choices[0].message.content;
            await saveConversation(userId, message, finalResponse, { function: functionName, result });
            return res.json({ response: finalResponse, functionCalled: functionName });
        }

        const aiResponse = responseMessage.content;
        // Save to conversation history if requested
        if (saveToHistory) {
            await saveConversation(userId, message, aiResponse);
        }
        res.json({ response: aiResponse });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper Functions
async function handleResearchCollege(collegeName) {
    try {
        console.log(`Searching catalog for: ${collegeName}`);

        // Try precise match first
        let { data: college } = await supabase
            .from('college_catalog')
            .select('*')
            .eq('name', collegeName)
            .maybeSingle();

        // Try loose match if not found
        if (!college) {
            const { data: fuzzyMatches } = await supabase
                .from('college_catalog')
                .select('*')
                .ilike('name', `%${collegeName}%`)
                .limit(1);

            if (fuzzyMatches && fuzzyMatches.length > 0) {
                college = fuzzyMatches[0];
            }
        }

        if (college && college.description) {
            return { success: true, college };
        }

        // Use AI if not in DB
        console.log(`Researching ${collegeName} via AI...`);
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `Provide accurate 2024-2025 admissions data for ${collegeName} in JSON. 
                Include description, location, median_sat, acceptance_rate, application_platform, and essays required (array of title, prompt, word_limit).`
            }],
            response_format: { type: "json_object" }
        });

        const data = JSON.parse(completion.choices[0].message.content);

        // Catalog it
        await supabase.from('college_catalog').upsert({
            name: data.name || collegeName,
            ...data,
            last_updated: new Date().toISOString()
        }, { onConflict: 'name' });

        return { success: true, college: data };
    } catch (e) {
        console.error('Research error:', e);
        return { success: false, error: e.message };
    }
}

async function handleAddCollege(userId, collegeName, type) {
    const research = await handleResearchCollege(collegeName);
    const collegeData = research.college || { name: collegeName };

    const { data: existing } = await supabase
        .from('colleges')
        .select('id')
        .eq('user_id', userId)
        .eq('name', collegeData.name)
        .maybeSingle();

    if (existing) {
        await handleCreateEssays(userId, collegeData.name); // Ensure essays are synced
        return { success: true, message: 'Already in list' };
    }

    const { data, error } = await supabase
        .from('colleges')
        .insert({
            user_id: userId,
            name: collegeData.name,
            application_platform: collegeData.application_platform || 'Common App',
            type: type || 'Target',
            status: 'Not Started'
        })
        .select()
        .single();

    if (data) {
        await handleCreateEssays(userId, collegeData.name);
    }

    return { success: true, collegeId: data?.id };
}

async function handleCreateEssays(userId, collegeName) {
    try {
        const { data: collegeEntry } = await supabase
            .from('colleges')
            .select('id, name')
            .eq('user_id', userId)
            .eq('name', collegeName)
            .single();

        if (!collegeEntry) return { success: false, error: 'College not found in user list' };

        const research = await handleResearchCollege(collegeName);
        const catalogEntry = research.college;

        if (!catalogEntry) return { success: true, count: 0 };

        let count = 0;
        // 1. Create Essays
        if (catalogEntry.essays) {
            for (const essay of catalogEntry.essays) {
                const { data: existing } = await supabase
                    .from('essays')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('college_id', collegeEntry.id)
                    .eq('title', `${collegeEntry.name} - ${essay.title}`)
                    .maybeSingle();

                if (!existing) {
                    await supabase.from('essays').insert({
                        user_id: userId,
                        college_id: collegeEntry.id,
                        title: `${collegeEntry.name} - ${essay.title}`,
                        prompt: essay.prompt,
                        word_limit: essay.word_limit,
                        essay_type: essay.essay_type || 'Supplemental',
                        status: 'Not Started',
                        content: ''
                    });
                    count++;
                }
            }
        }

        // 2. Create Default Tasks
        const defaultTasks = [
            { title: `Draft Supplemental Essays for ${collegeEntry.name}`, priority: 'High' },
            { title: `Request Transcripts for ${collegeEntry.name}`, priority: 'Medium' },
            { title: `Finalize LORs for ${collegeEntry.name}`, priority: 'Medium' }
        ];

        for (const task of defaultTasks) {
            const { data: existingTask } = await supabase
                .from('tasks')
                .select('id')
                .eq('user_id', userId)
                .eq('college_id', collegeEntry.id)
                .eq('title', task.title)
                .maybeSingle();

            if (!existingTask) {
                await supabase.from('tasks').insert({
                    user_id: userId,
                    college_id: collegeEntry.id,
                    title: task.title,
                    priority: task.priority,
                    completed: false,
                    status: 'Todo'
                });
            }
        }

        return { success: true, count };
    } catch (e) {
        console.error('Error creating essays:', e);
        return { success: false, error: e.message };
    }
}

async function saveConversation(userId, userMessage, aiResponse, metadata = {}) {
    await supabase.from('conversations').insert([
        { user_id: userId, role: 'user', content: userMessage, metadata },
        { user_id: userId, role: 'assistant', content: aiResponse, metadata }
    ]);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 AI Server running on http://0.0.0.0:${PORT}`);
});
