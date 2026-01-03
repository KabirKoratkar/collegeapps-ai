# CollegeApps.ai - The Master Guide

This document is the single source of truth for the CollegeApps.ai project. It contains the project overview, setup guides, technical architecture, and a complete history of every feature and fix implemented.

---

## 🎯 What is CollegeApps.ai?

CollegeApps.ai is a unified "Command Center" for high school students navigating the college application process. It organizes deadlines, essays, and tasks into a single platform, supported by an intelligent AI Counselor.

### Core Features
- **Daily Task Dashboard**: Priority-based tasks, weekly goals, and deadline countdowns.
- **AI Counselor (GPT-4)**: Automated college list management, requirement lookups, and essay brainstorming.
- **Smart Calendar View**: Interactive monthly grid with color-coded events (Deadlines, Essays, Tasks).
- **Essay Workspace**: Notion-like editor with real-time autosave, version control, and word counting.
- **Analytics Dashboard**: Visual progress tracking via rings, status charts, and activity heatmaps.
- **Document Vault**: Secure storage for transcripts, resumes, and recommendation letters.

---

## �️ Technical Stack

- **Frontend**: Vanilla HTML5, CSS3 (Custom Design System), and ES6+ JavaScript.
- **Backend**: Node.js & Express.
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS).
- **AI**: OpenAI GPT-4 Turbo with Function Calling.
- **Hosting**: Railway (Backend) & Vercel (Frontend).
- **Architecture**: Monorepo using **npm workspaces**.

---

## 🚀 Setup & Local Development

### 1. Prerequisites
- **Node.js**: v20.x recommended.
- **Supabase**: Access to a project with the SQL schema applied.
- **OpenAI**: API Key with billing enabled for GPT-4 access.

### 2. Environment Configuration
Create a `backend/.env` file:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
PORT=3001
```

### 3. Database Initialization
1.  **Initial Schema**: Run `backend/supabase-schema.sql`.
2.  **Profile Extensions**: Run `backend/profile-extension.sql` (Adds `location`, `birth_date`, etc.).
3.  **Sample Data**: Run `backend/add-sample-colleges.sql` (Optional).

### 4. Running the App
```bash
# Install everything
npm install

# Start Backend + AI Counselor
npm start

# For Frontend
# Simply open index.html or use a static server like Live Server (VSC)
```

---

## 🤖 AI Counselor Deep-Dive

The AI Counselor is not just a chatbot; it is integrated directly into the application state via **Function Calling**.

### Automated Actions
- **`addCollege(name)`**: Automatically look up requirements and add to database.
- **`createEssays(college)`**: Generate all supplemental essay tasks with word limits.
- **`createTasks(title, date)`**: Add reminders directly to the user's calendar.
- **`getCollegeRequirements(college)`**: Instantly fetch deadlines, LOR requirements, and test policies.

---

## � Complete Project History

### Phase 1: Foundation & UI (Dec 2025)
- **Design System**: Created a premium "Apple-style" UI with vibrant gradients and Inter/Outfit typography.
- **Landing Page**: Built a high-conversion marketing site.
- **Dashboard**: Designed the main grid layout for tasks and goals.
- **Auth Flow**: Implemented Sign Up, Login, and a 3-step Onboarding flow.
- **Calendar**: Built a custom 7-column calendar grid from scratch with event filtering.
- **Essay Editor**: Created the cleaner editor interface with a sidebar for multiple drafts.

### Phase 2: Intelligence & Backend (Dec 2024 - Jan 2025)
- **Supabase Integration**: Migrated from placeholder data to a real PostgreSQL database.
- **AI Counselor**: Integrated GPT-4 and built the "Function Calling" bridge between chat and the database.
- **Essay Persistence**: Implemented **3-second autosave** and version history using Supabase triggers.
- **Analytics**: Built the charts engine using Canvas API for progress rings and dynamic bars for status tracking.
- **Document Management**: Fixed module-loading and permission issues to enable file uploads to Supabase Storage.

### Phase 3: Infrastructure & Stability (Jan 2026)
- **Scalability Check**: Verified architecture can handle 100+ users on Supabase, Vercel, and Railway.
- **Railway Build Fixes**: Migrated to **npm workspaces** to fix deployment failures. Optimized `railway.json` for Nixpacks.
- **Onboarding Fixes**: Resolved critical "failed to create profile" bugs by extending the SQL schema.
- **Release Readiness**: Updated copyright years, secured developer shortcuts, and polished marketing copy for launch.
- **Error Handling**: Improved the frontend to catch and display detailed Supabase and AI errors instead of generic failures.

---

## 🌐 Deployment Links

- **Frontend**: [collegeapps-ai.vercel.app](https://collegeapps-ai.vercel.app)
- **Backend API**: `https://collegeapps-ai-production-28c4.up.railway.app`
- **GitHub**: [github.com/KabirKoratkar/collegeapps-ai](https://github.com/KabirKoratkar/collegeapps-ai)

---

*Built with ❤️ for students navigating the college application journey.*
