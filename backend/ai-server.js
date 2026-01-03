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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CATALOG_PATH = path.join(__dirname, 'college_catalog.json');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Supabase with service key (for server-side operations)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:8000',
        /\.vercel\.app$/  // Allow any Vercel deployment
    ],
    credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'AI server is running' });
});

// New endpoint for detailed college research
app.get('/api/colleges/research', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name) return res.status(400).json({ error: 'College name is required' });

        const research = await handleResearchCollege(name);
        res.json(research);
    } catch (error) {
        console.error('Error researching college:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        const profileContext = profile ?
            `You are talking to ${profile.full_name || 'a student'}. 
             Graduation Year: ${profile.graduation_year || 'Unknown'}
             Intended Major: ${profile.intended_major || 'Undecided'}
             Location: ${profile.location || 'Unknown'}` : '';

        // Build conversation messages for OpenAI
        const messages = [
            {
                role: 'system',
                content: `You are an expert college application counselor helping high school students with their college applications. You have access to detailed information about college requirements, deadlines, essays, and test policies.

${profileContext}

When users mention they are applying to colleges, you should:
1. Use the addCollege function to add the college to their list. Suggest if it should be a "Reach", "Target", or "Safety" based on their profile if possible.
2. Use the createEssays function to create all required essay tasks
3. Use the createTasks function to create important tasks and deadlines
4. Provide helpful, encouraging guidance

When users ask for "How to Apply" or "Strategy" for a college:
1. Provide a detailed, step-by-step application guide.
2. Analyze what that specific college values (e.g., "Stanford values intellectual vitality", "UCLA values community service").
3. Give specific advice on how to "Maximize Chances" (e.g., which supplemental prompt to pick, what ECs to highlight).
4. Break it down into: "The Game Plan", "How to Stand Out", and "Critical Deadlines".

When users ask help with essays:
1. Use the brainstormEssay function to generate creative ideas for specific prompts
2. Use the reviewEssay function to provide constructive feedback on drafts
3. Focus on unique personal stories, showing rather than telling, and authentic voice

When recommending colleges or giving advice, consider their major (${profile ? profile.intended_major : 'undecided'}) and location (${profile ? profile.location : 'unknown'}).

Be conversational, supportive, and specific. When you add colleges or create tasks, let the user know what you've done.

Available colleges with detailed data: Stanford, Harvard, Yale, Princeton, MIT, Columbia, UPenn, Brown, Cornell, Dartmouth, NYU, UC Berkeley, UCLA, UMichigan, Duke, Northwestern, JHU, Caltech, Rice, Georgetown, USC, Northeastern, Boston University, Georgia Tech, UT Austin, UNC, UVA, CMU, ASU, and more.

If a college is not in this specific list, you can still add it! The system will default to a standard Common App template, but you should still provide helpful guidance based on your general knowledge. When discussing essays, be specific about word limits and requirements.

Use the researchCollege function to get detailed stats (SAT, GPA, acceptance rates) when users ask about a specific college's profile or if they should apply there based on their stats.
When users ask questions, provide accurate, helpful information.`
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
            }
        ];

        // Call OpenAI with function calling
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
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
        const { data: colleges, error: fetchError } = await supabase
            .from('colleges')
            .select('*')
            .eq('user_id', userId);

        if (fetchError) throw fetchError;

        let totalCreated = 0;
        const results = [];

        for (const college of colleges) {
            // Check if this college has essays in the essays table
            const { count, error: countError } = await supabase
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

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a world-class college counselor. Your goal is to create a COMPREHENSIVE, premium application schedule for a student.
                    
                    The student is applying to: ${collegeListStr}
                    Intended Major: ${majorStr}
                    Graduation Year: ${gradYearStr}
                    
                    Create a list of 8-10 high-impact tasks/milestones for their application journey, spanning from today through their deadlines.
                    
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
                    
                    Be specific to their colleges and major. For example, if they apply to Stanford, include "Intellectual Vitality" essay focus. If CS major, include portfolio/project highlights.`
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

            const { error } = await supabase
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

// Deep "Why Us" Research Engine
app.post('/api/colleges/research-deep', async (req, res) => {
    try {
        const { userId, collegeName } = req.body;

        if (!userId || !collegeName) {
            return res.status(400).json({ error: 'userId and collegeName are required' });
        }

        console.log(`Deep researching ${collegeName} for user ${userId}...`);

        // Fetch user profile for context (major, graduation year, etc.)
        const { data: profile } = await supabase
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
                    content: `You are an expert college admissions researcher. Your task is to find specific, non-obvious "research points" at a university that a student can use to write their own "Why Us" essay.
                    
                    CRITICAL RULE: DO NOT write any draft text, sentences, or copy-pasteable hooks. Your output MUST ONLY consist of facts, program names, and advice on WHAT the student should research and write about in their OWN voice.
                    
                    College: ${collegeName}
                    Student Major: ${major}
                    
                    Find 4 distinct research areas:
                    1. Academics: A specific unique program, lab, or professor related to ${major}.
                    2. Community: A unique student organization or tradition.
                    3. Location/Industry: How the school's location connects to ${major} (e.g., internships, local ecosystem).
                    4. "The X Factor": A quirky or prestigious fact/program that makes ${collegeName} stand out from its peers.
                    
                    Return the data in structured JSON:
                    {
                        "college": "${collegeName}",
                        "opportunities": [
                            {
                                "category": "Academic | Student Life | Career | Unique",
                                "title": "Name of the target (e.g. The Vertigo Lab)",
                                "description": "1-2 sentence factual explanation of what this is.",
                                "advice": "Briefly describe WHAT the student should emphasize about this in their essay (e.g., 'Mention how your interest in X aligns with this lab's focus on Y')."
                            }
                        ],
                        "research_angle": "A one-sentence suggestion for the structural 'angle' or 'theme' the student should research to build their narrative."
                    }`
                },
                {
                    role: 'user',
                    content: `Research ${collegeName} for me.`
                }
            ],
            response_format: { type: "json_object" }
        });

        const findings = JSON.parse(completion.choices[0].message.content);

        res.json({
            success: true,
            findings: findings
        });

    } catch (error) {
        console.error('Deep research error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Function handlers

async function handleAddCollege(userId, collegeName, type) {
    let collegeData = await getCollegeInfo(collegeName);

    if (!collegeData) {
        console.log(`College ${collegeName} not found in DB. Using generic template.`);
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
    } else if (type) {
        collegeData.type = type;
    }

    // Check if college already exists
    const { data: existing } = await supabase
        .from('colleges')
        .select('id')
        .eq('user_id', userId)
        .eq('name', collegeData.name)
        .single();

    if (existing) {
        return { success: true, message: 'College already in list', collegeId: existing.id };
    }

    // Add college to database
    const { data, error } = await supabase
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

    const { error: tasksError } = await supabase
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
    const { data: college } = await supabase
        .from('colleges')
        .select('id')
        .eq('user_id', userId)
        .eq('name', collegeData.name)
        .single();

    if (!college) {
        return { success: false, error: 'College not in user\'s list. Add college first.' };
    }

    // Create essays
    const essaysToCreate = collegeData.essays_required.map(essay => ({
        user_id: userId,
        college_id: college.id,
        title: `${collegeData.name} - ${essay.title}`,
        essay_type: essay.essay_type,
        prompt: essay.prompt,
        word_limit: essay.word_limit,
        content: '',
        word_count: 0,
        is_completed: false
    }));

    const { data, error } = await supabase
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

    const { data, error } = await supabase
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
        // 1. Check if we already have detailed research in Supabase catalog
        const { data: existing } = await supabase
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
        const { data: updated, error } = await supabase
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

async function saveConversation(userId, userMessage, aiResponse, functionCall = null) {
    try {
        // Save user message
        await supabase.from('conversations').insert({
            user_id: userId,
            role: 'user',
            content: userMessage
        });

        // Save AI response
        await supabase.from('conversations').insert({
            user_id: userId,
            role: 'assistant',
            content: aiResponse,
            function_call: functionCall
        });
    } catch (error) {
        console.error('Error saving conversation:', error);
    }
}

// Helper to find college info (Supabase Catalog -> Local JSON fallback)
async function getCollegeInfo(name) {
    try {
        console.log(`Searching catalog for: ${name}`);
        // 1. Try Supabase Catalog
        const { data: catalogData, error } = await supabase
            .from('college_catalog')
            .select('*')
            .ilike('name', `%${name}%`)
            .limit(1)
            .single();

        if (catalogData) {
            console.log(`Found ${name} in Supabase Catalog`);
            return {
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

// Start server
app.listen(PORT, () => {
    console.log(`🤖 AI Server running on http://localhost:${PORT}`);
    console.log(`📚 Reference catalog: ${fs.existsSync(LOCAL_CATALOG_PATH) ? 'JSON + Supabase' : 'Supabase Only'}`);
});
