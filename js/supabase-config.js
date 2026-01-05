import config from './config.js';

const SUPABASE_URL = config.supabaseUrl;
const SUPABASE_ANON_KEY = config.supabaseKey;

// Import Supabase client from CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper Functions

// Get current user
async function getCurrentUser() {
    // 1. Try to get real Supabase user first
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user) {
        return user;
    }

    // 2. Fallback to mock dev session if no real user found
    const devUser = localStorage.getItem('dev_user');
    if (devUser) {
        console.log('[DEV MODE] Using mock user session');
        return JSON.parse(devUser);
    }

    return null;
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
        throw new Error(`Database error: ${error.message} (${error.hint || 'no hint'})`);
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

async function addCollege(userIdOrObject, name = null, type = null) {
    // If it's a smart addition (userId and name provided)
    if (name && typeof userIdOrObject === 'string') {
        try {
            console.log(`Attempting smart college add for: ${name}`);
            const response = await fetch(`${config.apiUrl}/api/colleges/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userIdOrObject, collegeName: name, type })
            });
            if (response.ok) {
                const result = await response.json();
                console.log('Smart college add success:', result);
                return result.collegeId ? { id: result.collegeId, ...result.college } : result;
            }
        } catch (e) {
            console.warn('AI Server add college failed, falling back to direct Supabase insert:', e);
        }
    }

    // Fallback/Manual: Direct Supabase insert
    let college;
    if (typeof userIdOrObject === 'object' && !name) {
        college = userIdOrObject;
    } else {
        college = {
            user_id: userIdOrObject,
            name: name,
            type: type || 'Target',
            status: 'Not Started'
        };
    }

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
            },
            emailRedirectTo: `${window.location.origin}/verify-success.html`
        }
    });

    if (error) {
        console.error('Error signing up:', error);
        throw new Error(`Signup error: ${error.message}`);
    }

    // Create profile
    if (data.user) {
        try {
            await upsertProfile({
                id: data.user.id,
                email,
                full_name: fullName
            });
        } catch (profileError) {
            console.error('Profile creation failed after signup:', profileError);
            // We don't throw here because the user IS created in Auth, 
            // but we should probably warn about the profile.
        }
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
        throw new Error(`Login error: ${error.message}`);
    }

    return data;
}

async function resendConfirmationEmail(email) {
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
    });

    if (error) {
        console.error('Error resending confirmation:', error);
        throw new Error(`Resend error: ${error.message}`);
    }

    return true;
}

async function resetPasswordForEmail(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password.html`,
    });

    if (error) {
        console.error('Error sending reset email:', error);
        throw new Error(`Reset error: ${error.message}`);
    }

    return data;
}

async function updateUserPassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (error) {
        console.error('Error updating password:', error);
        throw new Error(`Update password error: ${error.message}`);
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

// Sharing
async function shareEssay(essayId, sharedBy, sharedWithEmail, permission = 'view') {
    const { data, error } = await supabase
        .from('essay_shares')
        .insert({
            essay_id: essayId,
            shared_by: sharedBy,
            shared_with_email: sharedWithEmail,
            permission
        })
        .select()
        .single();

    if (error) {
        console.error('Error sharing essay:', error);
        return null;
    }
    return data;
}

async function getSharedEssays(userEmail) {
    const { data, error } = await supabase
        .from('essay_shares')
        .select(`
            *,
            essays (
                *,
                profiles:user_id (full_name, email)
            )
        `)
        .eq('shared_with_email', userEmail);

    if (error) {
        console.error('Error fetching shared essays:', error);
        return [];
    }
    // Filter out shares where the original essay was deleted
    return (data || []).filter(item => item.essays !== null);
}

// Comments
async function addComment(essayId, userId, content) {
    const { data, error } = await supabase
        .from('essay_comments')
        .insert({ essay_id: essayId, user_id: userId, content })
        .select()
        .single();

    if (error) {
        console.error('Error adding comment:', error);
        return null;
    }
    return data;
}

async function getEssayComments(essayId) {
    const { data, error } = await supabase
        .from('essay_comments')
        .select(`
            *,
            profiles:user_id (full_name, email)
        `)
        .eq('essay_id', essayId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching comments:', error);
        return [];
    }
    return data;
}

async function deleteDocument(docId, filePath) {
    // Delete from storage
    const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([filePath]);

    if (storageError) {
        console.error('Error deleting file from storage:', storageError);
    }

    // Delete from database
    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

    if (error) {
        console.error('Error deleting document record:', error);
        return false;
    }

    return true;
}

async function linkDocumentToEssay(essayId, documentId) {
    const { data, error } = await supabase
        .from('essay_documents')
        .insert({ essay_id: essayId, document_id: documentId })
        .select()
        .single();

    if (error) {
        console.error('Error linking document to essay:', error);
        return null;
    }
    return data;
}

async function unlinkDocumentFromEssay(essayId, documentId) {
    const { error } = await supabase
        .from('essay_documents')
        .delete()
        .eq('essay_id', essayId)
        .eq('document_id', documentId);

    if (error) {
        console.error('Error unlinking document from essay:', error);
        return false;
    }
    return true;
}

async function getEssayDocuments(essayId) {
    const { data, error } = await supabase
        .from('essay_documents')
        .select(`
            document_id,
            documents:document_id (*)
        `)
        .eq('essay_id', essayId);

    if (error) {
        console.error('Error fetching essay documents:', error);
        return [];
    }
    // Filter out links where the document was deleted
    return (data || [])
        .filter(item => item.documents !== null)
        .map(item => item.documents);
}

async function signInWithGoogle(nextPath = 'dashboard.html') {
    // Robustly construct redirect URL from current origin and pathname
    // We use the folder path of the current page to ensure we stay in the correct subdirectory
    // Example: http://localhost:8000/collegeapps-ai/login.html -> http://localhost:8000/collegeapps-ai/dashboard.html
    const folderPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const redirectUrl = window.location.origin + folderPath + nextPath;

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });

    if (error) {
        console.error('Error signing in with Google:', error);
        return null;
    }
    return data;
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
    deleteDocument,
    linkDocumentToEssay,
    unlinkDocumentFromEssay,
    getEssayDocuments,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    resendConfirmationEmail,
    shareEssay,
    getSharedEssays,
    addComment,
    getEssayComments,
    syncEssays,
    searchCollegeCatalog,
    getCollegeFromCatalog,
    resetPasswordForEmail,
    updateUserPassword
};

async function searchCollegeCatalog(query) {
    const abbrevMap = {
        'hmc': 'Harvey Mudd College',
        'mit': 'Massachusetts Institute of Technology',
        'ucla': 'University of California, Los Angeles',
        'berk': 'University of California, Berkeley',
        'cal': 'University of California, Berkeley',
        'nyu': 'New York University',
        'jhu': 'Johns Hopkins University',
        'cmu': 'Carnegie Mellon University',
        'upenn': 'University of Pennsylvania',
        'penn': 'University of Pennsylvania',
        'asu': 'Arizona State University',
        'usc': 'University of Southern California',
        'gt': 'Georgia Institute of Technology',
        'gatech': 'Georgia Institute of Technology',
        'uva': 'University of Virginia',
        'unc': 'University of North Carolina',
        'ut': 'University of Texas',
        'bu': 'Boston University'
    };

    const cleanQuery = query.toLowerCase().trim();
    const mappedName = abbrevMap[cleanQuery];

    let finalQuery = query;
    if (mappedName) {
        finalQuery = mappedName;
    }

    const { data, error } = await supabase
        .from('college_catalog')
        .select('*')
        .or(`name.ilike.%${finalQuery}%,name.ilike.%${query}%`)
        .limit(10);

    if (error) {
        console.error('Error searching catalog:', error);
        return [];
    }
    return data;
}

async function getCollegeFromCatalog(name) {
    const { data, error } = await supabase
        .from('college_catalog')
        .select('*')
        .ilike('name', name)
        .single();

    if (error) {
        console.error('Error fetching from catalog:', error);
        return null;
    }
    return data;
}

async function syncEssays(userId) {
    try {
        const response = await fetch(`${config.apiUrl}/api/essays/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.error('Error syncing essays:', e);
    }
    return null;
}
