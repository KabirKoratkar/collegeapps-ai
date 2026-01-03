const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY (ideally Service Role) are required in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
    console.log('Reading college catalog...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../backend/college_catalog.json'), 'utf8'));

    console.log(`Found ${Object.keys(data).length} colleges. Seeding to Supabase...`);

    for (const [key, college] of Object.entries(data)) {
        console.log(`Seeding ${college.name}...`);

        const { error } = await supabase
            .from('college_catalog')
            .upsert({
                name: college.name,
                application_platform: college.application_platform,
                deadline_date: college.deadline,
                deadline_type: college.deadline_type,
                test_policy: college.test_policy,
                lors_required: college.lors_required,
                portfolio_required: college.portfolio_required,
                essays: college.essays_required,
                verified: true
            }, { onConflict: 'name' });

        if (error) {
            console.error(`Error seeding ${college.name}:`, error.message);
        }
    }

    console.log('Seeding complete!');
}

seed();
