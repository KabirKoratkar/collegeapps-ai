// AI Server with OpenAI Integration and Function Calling
// This server handles AI chat requests and can manipulate app state

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { collegeDatabase, findCollege } from './college-data.js';

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
        /\.vercel\.app$/  // Allow any Vercel deployment
    ],
    credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'AI server is running' });
});

// Main AI chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId, conversationHistory = [] } = req.body;

        if (!message || !userId) {
            return res.status(400).json({ error: 'Message and userId are required' });
        }

        // Build conversation messages for OpenAI
        const messages = [
            {
                role: 'system',
                content: `You are an expert college application counselor helping high school students with their college applications. You have access to detailed information about college requirements, deadlines, essays, and test policies.

When users mention they are applying to colleges, you should:
1. Use the addCollege function to add the college to their list
2. Use the createEssays function to create all required essay tasks
3. Use the createTasks function to create important tasks and deadlines
4. Provide helpful, encouraging guidance

When users ask for help with essays:
1. Use the brainstormEssay function to generate creative ideas for specific prompts
2. Use the reviewEssay function to provide constructive feedback on drafts
3. Focus on unique personal stories, showing rather than telling, and authentic voice

Be conversational, supportive, and specific. When you add colleges or create tasks, let the user know what you've done.

Available colleges in database: Stanford, MIT, USC, UC Berkeley, UCLA, Carnegie Mellon, Georgia Tech, University of Michigan.

When discussing essays, be specific about word limits and requirements. When users ask questions, provide accurate, helpful information.`
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
            }
        ];

        // Call OpenAI with function calling
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
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
                    functionResult = await handleAddCollege(userId, functionArgs.collegeName);
                    break;
                case 'createEssays':
                    functionResult = await handleCreateEssays(userId, functionArgs.collegeName);
                    break;
                case 'createTasks':
                    functionResult = await handleCreateTasks(userId, functionArgs.tasks);
                    break;
                case 'getCollegeRequirements':
                    functionResult = handleGetCollegeRequirements(functionArgs.collegeName);
                    break;
                case 'brainstormEssay':
                    functionResult = handleBrainstormEssay(functionArgs.prompt, functionArgs.context);
                    break;
                case 'reviewEssay':
                    functionResult = handleReviewEssay(functionArgs.essayContent, functionArgs.focusArea);
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
                model: 'gpt-4-turbo-preview',
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

// Function handlers

async function handleAddCollege(userId, collegeName) {
    const collegeData = findCollege(collegeName);

    if (!collegeData) {
        return { success: false, error: 'College not found in database' };
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
            essays_required: collegeData.essays_required,
            test_policy: collegeData.test_policy,
            lors_required: collegeData.lors_required,
            portfolio_required: collegeData.portfolio_required,
            status: 'Not Started'
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding college:', error);
        return { success: false, error: error.message };
    }

    return {
        success: true,
        message: `Added ${collegeData.name} to your college list`,
        collegeId: data.id,
        college: collegeData
    };
}

async function handleCreateEssays(userId, collegeName) {
    const collegeData = findCollege(collegeName);

    if (!collegeData) {
        return { success: false, error: 'College not found in database' };
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

function handleGetCollegeRequirements(collegeName) {
    const collegeData = findCollege(collegeName);

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

// Start server
app.listen(PORT, () => {
    console.log(`🤖 AI Server running on http://localhost:${PORT}`);
    console.log(`📚 College database loaded with ${Object.keys(collegeDatabase).length} colleges`);
});
