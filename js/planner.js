
import { supabase } from './supabase-config.js';

/**
 * Intelligent Schedule Generaton & Synchronization
 * Analyzes the user's colleges, essays, and profile to generate (and update) a comprehensive
 * Plan of Attack with specific actionable tasks.
 */
export async function syncSmartSchedule(userId) {
    try {
        console.log('🔄 syncing smart schedule...');

        // 1. Fetch all context
        const [collegesRes, essaysRes, tasksRes] = await Promise.all([
            supabase.from('colleges').select('*').eq('user_id', userId),
            supabase.from('essays').select('*, colleges(name, deadline)').eq('user_id', userId),
            supabase.from('tasks').select('*').eq('user_id', userId)
        ]);

        const colleges = collegesRes.data || [];
        const essays = essaysRes.data || [];
        const existingTasks = tasksRes.data || [];

        const newTasks = [];
        const updates = [];

        // Helper to find existing task
        const findTask = (title, collegeId = null) => {
            // Check DB tasks
            return existingTasks.find(t =>
                t.title === title &&
                (collegeId ? t.college_id === collegeId : true)
            );
        };

        // Helper: Schedule or Update
        const scheduleTask = (title, idealDate, desc, category, priority, collegeId = null) => {
            const existing = findTask(title, collegeId);
            const dateStr = idealDate.toISOString().split('T')[0];

            if (existing) {
                // If exists but not completed, and date is different, update it
                if (!existing.completed && existing.due_date !== dateStr) {
                    updates.push({
                        id: existing.id,
                        due_date: dateStr
                    });
                }
            } else {
                // Create new
                // Check if we already staged it (avoid dupes in loop)
                const isStaged = newTasks.some(t => t.title === title && t.college_id === collegeId);
                if (!isStaged) {
                    newTasks.push({
                        user_id: userId,
                        college_id: collegeId,
                        title: title,
                        description: desc,
                        due_date: dateStr,
                        category: category,
                        priority: priority
                    });
                }
            }
        };

        // Helper to find earliest deadline
        const earliestDeadline = colleges
            .map(c => c.deadline)
            .filter(d => d)
            .sort()[0];

        const baseDate = earliestDeadline ? new Date(earliestDeadline) : new Date();
        const today = new Date();

        // ==========================================
        // 1. TRANSCRIPTS (Global)
        // ==========================================
        {
            // Due 45 days before earliest deadline, or 1 week from now if late
            let dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() - 45);
            if (dueDate < today) dueDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

            scheduleTask(
                'Request High School Transcripts',
                dueDate,
                'Contact your school counselor to send official transcripts to all your colleges.',
                'Document',
                'High'
            );
        }

        // ==========================================
        // 2. TEST SCORES (Conditional)
        // ==========================================
        const testsRequired = colleges.some(c => c.test_policy === 'Required');
        if (testsRequired) {
            let dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() - 30);
            if (dueDate < today) dueDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

            scheduleTask(
                'Send Official Test Scores',
                dueDate,
                'Login to CollegeBoard/ACT.org and send score reports to colleges that require them.',
                'Document',
                'High'
            );
        }

        // ==========================================
        // 3. FAFSA / FINANCIAL AID
        // ==========================================
        {
            // Usually opens Oct 1
            let dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() - 45);
            if (dueDate < today) dueDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

            scheduleTask(
                'Submit FAFSA & CSS Profile',
                dueDate,
                'Complete federal and private financial aid applications.',
                'General',
                'High'
            );
        }

        // ==========================================
        // 4. LORs (Per College or Global)
        // ==========================================
        {
            let dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() - 60);
            if (dueDate < today) dueDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

            scheduleTask(
                'Confirm Recommenders (Teachers & Counselor)',
                dueDate,
                'Ask 2 core subject teachers and your counselor if they can write strong letters for you.',
                'LOR',
                'High'
            );
        }

        // Check per-college LOR requirements
        colleges.forEach(college => {
            if (college.lors_required > 0 && college.deadline) {
                let date = new Date(college.deadline);
                date.setDate(date.getDate() - 30); // 1 month before

                scheduleTask(
                    `Assign Recommenders for ${college.name}`,
                    date,
                    `Ensure your letters of recommendation are assigned to ${college.name} in the portal.`,
                    'LOR',
                    'Medium',
                    college.id
                );
            }
        });

        // ==========================================
        // 5. ESSAYS (Drafts & Polish)
        // ==========================================
        essays.forEach(essay => {
            if (!essay.colleges?.deadline) return;

            const deadline = new Date(essay.colleges.deadline);
            const title = essay.title.length > 30 ? essay.title.substring(0, 30) + '...' : essay.title;

            // 1. First Draft (3 weeks before)
            let draftDate = new Date(deadline);
            draftDate.setDate(draftDate.getDate() - 21);

            scheduleTask(
                `Draft: ${title}`,
                draftDate,
                `Complete a rough draft for ${essay.title} (${essay.word_limit || '?'} words).`,
                'Essay',
                'Medium',
                essay.college_id
            );

            // 2. Final Polish (5 days before)
            let polishDate = new Date(deadline);
            polishDate.setDate(polishDate.getDate() - 5);

            scheduleTask(
                `Polish & Finalize: ${title}`,
                polishDate,
                `Final review for grammar, tone, and clarity for ${essay.title}.`,
                'Essay',
                'High',
                essay.college_id
            );
        });

        // ==========================================
        // EXECUTE UPDATES & INSERTS
        // ==========================================
        let successCount = 0;

        if (newTasks.length > 0) {
            console.log(`Creating ${newTasks.length} smart tasks...`);
            const { error } = await supabase.from('tasks').insert(newTasks);
            if (error) throw error;
            successCount += newTasks.length;
        }

        if (updates.length > 0) {
            console.log(`Updating ${updates.length} tasks with new deadlines...`);
            // Supabase doesn't support bulk update easily without rpc, so we loop parallel
            // Or typically we use upsert if we have comprehensive data, but we only have partial here.
            // Safe bet: Promise.all updates
            await Promise.all(updates.map(u =>
                supabase.from('tasks').update({ due_date: u.due_date }).eq('id', u.id)
            ));
            successCount += updates.length;
        }

        return { success: true, count: successCount };

    } catch (error) {
        console.error('Smart Schedule Error:', error);
        return { success: false, error };
    }
}
