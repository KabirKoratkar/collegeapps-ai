// College Requirements Database
// This contains actual college requirements for the AI to reference

const collegeDatabase = {
    "Stanford University": {
        name: "Stanford University",
        application_platform: "Common App",
        deadline: "2025-01-05",
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
            },
            {
                title: "Short Answer 1",
                essay_type: "Supplement",
                prompt: "What is the most significant challenge that society faces today?",
                word_limit: 50
            },
            {
                title: "Short Answer 2",
                essay_type: "Supplement",
                prompt: "How did you spend your last two summers?",
                word_limit: 50
            },
            {
                title: "Short Answer 3",
                essay_type: "Supplement",
                prompt: "What historical moment or event do you wish you could have witnessed?",
                word_limit: 50
            },
            {
                title: "What Matters to You",
                essay_type: "Supplement",
                prompt: "The Stanford community is deeply curious and driven to learn in and out of the classroom. Reflect on an idea or experience that makes you genuinely excited about learning.",
                word_limit: 250
            },
            {
                title: "Why Stanford",
                essay_type: "Supplement",
                prompt: "Virtually all of Stanford's undergraduates live on campus. Write a note to your future roommate that reveals something about you or that will help your roommate—and us—get to know you better.",
                word_limit: 250
            },
            {
                title: "Roommate Letter",
                essay_type: "Supplement",
                prompt: "Tell us about something that is meaningful to you and why.",
                word_limit: 250
            }
        ]
    },

    "MIT": {
        name: "Massachusetts Institute of Technology",
        application_platform: "Common App",
        deadline: "2025-01-01",
        deadline_type: "RD",
        test_policy: "Test Flexible",
        lors_required: 2,
        portfolio_required: false,
        essays_required: [
            {
                title: "Common App Personal Statement",
                essay_type: "Common App",
                prompt: "Choose one of the 7 Common App prompts",
                word_limit: 650
            },
            {
                title: "Alignment with MIT",
                essay_type: "Supplement",
                prompt: "We know you lead a busy life, full of activities, many of which are required of you. Tell us about something you do simply for the pleasure of it.",
                word_limit: 200
            },
            {
                title: "Community Essay",
                essay_type: "Supplement",
                prompt: "Although you may not yet know what you want to major in, which department or program at MIT appeals to you and why?",
                word_limit: 100
            },
            {
                title: "Why MIT",
                essay_type: "Supplement",
                prompt: "At MIT, we bring people together to better the lives of others. MIT students work to improve their communities in different ways, from tackling the world's biggest challenges to being a good friend. Describe one way in which you have contributed to your community, whether in your family, the classroom, your neighborhood, etc.",
                word_limit: 200
            },
            {
                title: "Challenge/Setback",
                essay_type: "Supplement",
                prompt: "Describe the world you come from; for example, your family, clubs, school, community, city, or town. How has that world shaped your dreams and aspirations?",
                word_limit: 225
            },
            {
                title: "Curiosity Essay",
                essay_type: "Supplement",
                prompt: "Tell us about the most significant challenge you've faced or something important that didn't go according to plan. How did you manage the situation?",
                word_limit: 225
            }
        ]
    },

    "USC": {
        name: "University of Southern California",
        application_platform: "Common App",
        deadline: "2025-01-15",
        deadline_type: "RD",
        test_policy: "Test Optional",
        lors_required: 1,
        portfolio_required: false,
        essays_required: [
            {
                title: "Common App Personal Statement",
                essay_type: "Common App",
                prompt: "Choose one of the 7 Common App prompts",
                word_limit: 650
            },
            {
                title: "USC Short Answer 1",
                essay_type: "Supplement",
                prompt: "Describe how you plan to pursue your academic interests and why you want to explore them at USC specifically.",
                word_limit: 250
            },
            {
                title: "USC Short Answer 2",
                essay_type: "Supplement",
                prompt: "Describe yourself in three words.",
                word_limit: 100
            },
            {
                title: "USC Short Answer 3",
                essay_type: "Supplement",
                prompt: "What is something about yourself that is essential to understanding you?",
                word_limit: 250
            }
        ]
    },

    "UC Berkeley": {
        name: "University of California, Berkeley",
        application_platform: "UC Application",
        deadline: "2024-11-30",
        deadline_type: "UC",
        test_policy: "Test Blind",
        lors_required: 0,
        portfolio_required: false,
        essays_required: [
            {
                title: "PIQ #1",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            },
            {
                title: "PIQ #2",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            },
            {
                title: "PIQ #3",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 PersonalInsight Questions to answer.",
                word_limit: 350
            },
            {
                title: "PIQ #4",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            }
        ]
    },

    "UCLA": {
        name: "University of California, Los Angeles",
        application_platform: "UC Application",
        deadline: "2024-11-30",
        deadline_type: "UC",
        test_policy: "Test Blind",
        lors_required: 0,
        portfolio_required: false,
        essays_required: [
            {
                title: "PIQ #1",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            },
            {
                title: "PIQ #2",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            },
            {
                title: "PIQ #3",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            },
            {
                title: "PIQ #4",
                essay_type: "UC PIQ",
                prompt: "Choose 4 of 8 Personal Insight Questions to answer.",
                word_limit: 350
            }
        ]
    },

    "Carnegie Mellon University": {
        name: "Carnegie Mellon University",
        application_platform: "Common App",
        deadline: "2025-01-03",
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
            },
            {
                title: "Why CMU",
                essay_type: "Supplement",
                prompt: "Why Carnegie Mellon?",
                word_limit: 300
            }
        ]
    },

    "Georgia Tech": {
        name: "Georgia Institute of Technology",
        application_platform: "Common App",
        deadline: "2025-01-04",
        deadline_type: "RD",
        test_policy: "Test Optional",
        lors_required: 1,
        portfolio_required: false,
        essays_required: [
            {
                title: "Common App Personal Statement",
                essay_type: "Common App",
                prompt: "Choose one of the 7 Common App prompts",
                word_limit: 650
            },
            {
                title: "Why Georgia Tech",
                essay_type: "Supplement",
                prompt: "Why do you want to study your chosen major specifically at Georgia Tech?",
                word_limit: 300
            },
            {
                title: "Diversity Essay",
                essay_type: "Supplement",
                prompt: "Georgia Tech's motto is Progress and Service. We find that students who ultimately have a broad impact first had a significant one at home. What is your role in your family, and how have you helped or impacted those around you?",
                word_limit: 300
            }
        ]
    },

    "University of Michigan": {
        name: "University of Michigan",
        application_platform: "Common App",
        deadline: "2025-02-01",
        deadline_type: "RD",
        test_policy: "Test Optional",
        lors_required: 1,
        portfolio_required: false,
        essays_required: [
            {
                title: "Common App Personal Statement",
                essay_type: "Common App",
                prompt: "Choose one of the 7 Common App prompts",
                word_limit: 650
            },
            {
                title: "Why Michigan",
                essay_type: "Supplement",
                prompt: "Everyone belongs to many different communities and/or groups defined by (among other things) shared geography, religion, ethnicity, income, cuisine, interest, race, ideology, or intellectual heritage. Choose one of the communities to which you belong, and describe that community and your place within it.",
                word_limit: 300
            },
            {
                title: "Community Essay",
                essay_type: "Supplement",
                prompt: "Describe the unique qualities that attract you to the specific undergraduate College or School to which you are applying at the University of Michigan. How would that curriculum support your interests?",
                word_limit: 550
            }
        ]
    }
};

// Function to find college by name (case-insensitive, partial match)
function findCollege(searchName) {
    const lowerSearch = searchName.toLowerCase();

    // Exact match first
    for (const [key, college] of Object.entries(collegeDatabase)) {
        if (key.toLowerCase() === lowerSearch) {
            return college;
        }
    }

    // Partial match
    for (const [key, college] of Object.entries(collegeDatabase)) {
        if (key.toLowerCase().includes(lowerSearch) || lowerSearch.includes(key.toLowerCase())) {
            return college;
        }
    }

    return null;
}

// Export for ES6 modules
export { collegeDatabase, findCollege };

