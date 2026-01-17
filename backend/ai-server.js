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
}

// Initialize Supabase with service key (for server-side operations)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

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

// Health Check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: 'v3.0', infrastructure: 'Supabase Native' }));
app.get('/health', (req, res) => res.json({ status: 'ok', message: 'AI server is running' }));

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
        const { message, userId, conversationHistory = [] } = req.body;
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
        await saveConversation(userId, message, aiResponse, { model: 'claude-3.5-sonnet' });

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
        await saveConversation(userId, message, aiResponse);
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

        if (!catalogEntry || !catalogEntry.essays) return { success: true, count: 0 };

        let count = 0;
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

        return { success: true, count };
    } catch (e) {
        console.error('Error creating essays:', e);
        return { success: false, error: e.message };
    }
}

async function saveConversation(userId, userMessage, aiResponse, metadata = {}) {
    await supabase.from('conversations').insert([
        { user_id: userId, role: 'user', content: userMessage },
        { user_id: userId, role: 'assistant', content: aiResponse, metadata }
    ]);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 AI Server running on http://0.0.0.0:${PORT}`);
});
