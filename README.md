# CollegeApps.ai - MVP Website

A unified dashboard that organizes the entire college application process for high school students.

## 🎯 What is CollegeApps.ai?

CollegeApps.ai is a command center for college applications. Instead of juggling five portals (Common App, UC App, Coalition, Naviance, school portals, email), students use one app that tells them exactly what to do each day.

**Note:** This does NOT replace Common App — it organizes everything around it.

## ✨ Features

- **Daily Task Dashboard** - Know exactly what to work on today
- **Essay Workspace** - Notion-like editor for all your college essays
- **AI Counselor** - 24/7 expert guidance on requirements and deadlines
- **College Requirement Loader** - Automatic loading of requirements, essays, and deadlines
- **Document Vault** - Secure storage for transcripts, resumes, awards, and more
- **Progress Tracker** - Visual progress bars for essays, tasks, and documents

## 📁 Project Structure

```
collegeapps-ai/
├── index.html              # Landing page (marketing site)
├── login.html              # Login page
├── signup.html             # Sign up page
├── onboarding.html         # Multi-step onboarding flow
├── dashboard.html          # Main dashboard
├── colleges.html           # College list management
├── essays.html             # Essay workspace
├── documents.html          # Document vault
├── ai-counselor.html       # AI chat interface
├── css/
│   ├── design-system.css   # Design tokens and utilities
│   ├── components.css      # Reusable components
│   └── pages.css           # Page-specific styles
├── js/
│   ├── main.js             # Global functionality
│   ├── auth.js             # Authentication
│   ├── onboarding.js       # Onboarding flow
│   ├── essays.js           # Essay editor
│   ├── colleges.js         # College list
│   ├── documents.js        # Document vault
│   └── ai-counselor.js     # AI chat
└── assets/
    └── icons/              # Icon assets
```

## 🚀 Getting Started

### Running Locally

This is a static website built with vanilla HTML, CSS, and JavaScript. No build process required!

1. **Open the website:**
   - Simply open `index.html` in your web browser
   - Or use a local server:
     ```bash
     # Python 3
     python3 -m http.server 8000
     
     # PHP
     php -S localhost:8000
     ```

2. **Navigate to:** `http://localhost:8000`

### User Flow

1. **Landing Page** (`index.html`) - Marketing site with features, pricing, FAQ
2. **Sign Up** (`signup.html`) - Create account with Google or email
3. **Onboarding** (`onboarding.html`) - 3-step setup: graduation year, major, college list, deadlines
4. **Dashboard** (`dashboard.html`) - See today's tasks, weekly goals, and progress
5. **Explore Features:**
   - **Colleges** - Manage your college list and view requirements
   - **Essays** - Write and organize all your application essays
   - **Documents** - Upload and manage transcripts, resumes, etc.
   - **AI Counselor** - Ask questions about requirements and get help

## 🎨 Design System

### Colors
- **Primary:** Soft blues (#5B8DEE) and purples (#8B7BF7)
- **Gradients:** Used throughout for modern, premium feel
- **Semantic:** Success, warning, error, info colors

### Typography
- **Fonts:** Inter (body), Outfit (headings)
- **Scales:** Responsive text sizing from 12px to 60px

### Spacing
- **Apple-style spacing:** Consistent 4px/8px/16px/24px/32px scale
- **Generous whitespace** for breathing room

### Components
- Buttons (primary, secondary, ghost)
- Cards with hover effects
- Badges and tags
- Progress bars
- Input fields
- Navigation and footer

## 📱 Responsive Design

The website is fully responsive and works on:
- **Desktop** (1280px+)
- **Tablet** (768px - 1024px)
- **Mobile** (320px - 767px)

## 🎯 Key Pages Overview

### Landing Page
- Hero section with clear value proposition
- Features grid (6 features)
- How it works (3 steps)
- Testimonials
- FAQ section
- Pricing (Free + Premium tiers)

### Dashboard
- Today's tasks with priority indicators
- Weekly goals with progress bars
- Deadline countdowns
- Quick links to other sections

### Essay Workspace
- Sidebar navigation for all essays
- Clean editor with word/character count
- AI assistance buttons (brainstorm, outline, rewrite, improve)
- Save functionality

### College List
- Table view with all requirements
- Filterable by application platform
- Shows essays, test policies, LOR requirements, deadlines

### Document Vault
- Drag-and-drop upload zone
- Organized by tags (transcript, resume, awards, etc.)
- File preview and management
- Storage usage indicator

### AI Counselor
- Chat interface with conversation history
- Suggestion chips for common questions
- Instant responses about requirements, deadlines, essays

## 🔄 What's NOT Included (MVP Scope)

- Common App submission integration
- Real transcript requests
- Letter of recommendation requests
- Payment processing
- Admin portal
- Real backend/database (uses placeholder data)

## 🚀 Next Steps for Production

To make this production-ready, you'll need:

1. **Backend Integration**
   - Database (Supabase, Firebase, or custom)
   - User authentication (Google OAuth, email/password)
   - File storage for document uploads
   - API for college data

2. **Data Models**
   - Users (profile, settings, preferences)
   - Colleges (requirements, deadlines, essays)
   - Essays (content, versions, status)
   - Documents (files, tags, metadata)
   - Tasks (assignments, deadlines, completion)

3. **Additional Features**
   - Real-time AI counselor integration (OpenAI, Anthropic)
   - Email notifications for deadlines
   - Calendar integration
   - Collaboration features (share essays with counselors)

## 📝 License

This is an MVP demonstration project for CollegeApps.ai.

---

**Built with ❤️ for high school students navigating the college application process**
