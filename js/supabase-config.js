// Supabase Configuration and Client Setup
// Replace with your actual Supabase credentials

// SETUP INSTRUCTIONS:
// 1. Go to https://supabase.com and create a free account
// 2. Create a new project
// 3. Go to Settings > API
// 4. Copy your Project URL and anon/public key
// 5. Replace the values below
// 6. Run the schema SQL in your Supabase SQL Editor

const SUPABASE_URL = 'https://qcwwxiqgylzvvvjoiphq.supabase.co'; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjd3d4aXFneWx6dnZ2am9pcGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNzg0MjIsImV4cCI6MjA3OTg1NDQyMn0.v_70i3s8bOR9uwAi7fVZlXf-i6FeCpEN_-psTciF__4';

// Import Supabase client from CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper Functions

// Get current user
async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        console.error('Error getting user:', error);
        return null;
    }
    return user;
}

// Get user profile
async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }
    return data;
}

// Create or update profile
async function upsertProfile(profile) {
    const { data, error } = await supabase
        .from('profiles')
        .upsert(profile)
        .select()
        .single();

    if (error) {
        console.error('Error upserting profile:', error);
        return null;
    }
    return data;
}

// Colleges

async function getUserColleges(userId) {
    const { data, error } = await supabase
        .from('colleges')
        .select('*')
        .eq('user_id', userId)
        .order('deadline', { ascending: true });

    if (error) {
        console.error('Error fetching colleges:', error);
        return [];
    }
    return data;
}

async function addCollege(college) {
    const { data, error } = await supabase
        .from('colleges')
        .insert(college)
        .select()
        .single();

    if (error) {
        console.error('Error adding college:', error);
        return null;
    }
    return data;
}

async function updateCollege(id, updates) {
    const { data, error } = await supabase
        .from('colleges')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating college:', error);
        return null;
    }
    return data;
}

async function deleteCollege(id) {
    const { error } = await supabase
        .from('colleges')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting college:', error);
        return false;
    }
    return true;
}

// Essays

async function getUserEssays(userId) {
    const { data, error } = await supabase
        .from('essays')
        .select(`
            *,
            colleges(name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching essays:', error);
        return [];
    }
    return data;
}

async function getEssay(id) {
    const { data, error } = await supabase
        .from('essays')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching essay:', error);
        return null;
    }
    return data;
}

async function createEssay(essay) {
    const { data, error } = await supabase
        .from('essays')
        .insert(essay)
        .select()
        .single();

    if (error) {
        console.error('Error creating essay:', error);
        return null;
    }
    return data;
}

async function updateEssay(id, updates) {
    const { data, error } = await supabase
        .from('essays')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating essay:', error);
        return null;
    }
    return data;
}

async function saveEssayVersion(essayId, userId, content, wordCount, version) {
    const { data, error } = await supabase
        .from('essay_versions')
        .insert({
            essay_id: essayId,
            user_id: userId,
            content,
            word_count: wordCount,
            version
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving essay version:', error);
        return null;
    }
    return data;
}

// Tasks

async function getUserTasks(userId, completed = null) {
    let query = supabase
        .from('tasks')
        .select(`
            *,
            colleges(name)
        `)
        .eq('user_id', userId)
        .order('due_date', { ascending: true });

    if (completed !== null) {
        query = query.eq('completed', completed);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }
    return data;
}

async function createTask(task) {
    const { data, error } = await supabase
        .from('tasks')
        .insert(task)
        .select()
        .single();

    if (error) {
        console.error('Error creating task:', error);
        return null;
    }
    return data;
}

async function updateTask(id, updates) {
    const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating task:', error);
        return null;
    }
    return data;
}

async function toggleTaskCompletion(id, completed) {
    const updates = {
        completed,
        completed_at: completed ? new Date().toISOString() : null
    };

    return updateTask(id, updates);
}

// Conversations (AI Chat)

async function getUserConversations(userId, limit = 50) {
    const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Error fetching conversations:', error);
        return [];
    }
    return data;
}

async function saveMessage(userId, role, content, functionCall = null) {
    const { data, error } = await supabase
        .from('conversations')
        .insert({
            user_id: userId,
            role,
            content,
            function_call: functionCall
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving message:', error);
        return null;
    }
    return data;
}

// Documents

async function getUserDocuments(userId) {
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

    if (error) {
        console.error('Error fetching documents:', error);
        return [];
    }
    return data;
}

async function uploadDocument(userId, file, category, tags = []) {
    // Upload file to storage
    const fileName = `${userId}/${Date.now()}_${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

    if (uploadError) {
        console.error('Error uploading file:', uploadError);
        return null;
    }

    // Create document record
    const { data, error } = await supabase
        .from('documents')
        .insert({
            user_id: userId,
            name: file.name,
            file_path: fileName,
            file_type: file.type,
            file_size: file.size,
            category,
            tags
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating document record:', error);
        return null;
    }

    return data;
}

async function getDocumentUrl(filePath) {
    const { data } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

    return data.publicUrl;
}

// Auth helpers

async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName
            }
        }
    });

    if (error) {
        console.error('Error signing up:', error);
        return null;
    }

    // Create profile
    if (data.user) {
        await upsertProfile({
            id: data.user.id,
            email,
            full_name: fullName
        });
    }

    return data;
}

async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        console.error('Error signing in:', error);
        return null;
    }

    return data;
}

async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
        console.error('Error signing out:', error);
        return false;
    }

    return true;
}

// Export all functions
export {
    supabase,
    getCurrentUser,
    getUserProfile,
    upsertProfile,
    getUserColleges,
    addCollege,
    updateCollege,
    deleteCollege,
    getUserEssays,
    getEssay,
    createEssay,
    updateEssay,
    saveEssayVersion,
    getUserTasks,
    createTask,
    updateTask,
    toggleTaskCompletion,
    getUserConversations,
    saveMessage,
    getUserDocuments,
    uploadDocument,
    getDocumentUrl,
    signUp,
    signIn,
    signOut
};
