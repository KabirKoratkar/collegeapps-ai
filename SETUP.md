# CollegeApps.ai Backend Setup Guide

## 🚀 Quick Start

Follow these steps to get the full-stack CollegeApps.ai application running with AI chatbot and database.

---

## Prerequisites

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **Supabase Account** (free tier) - [Sign up here](https://supabase.com)
- **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)

---

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name:** CollegeApps
   - **Database Password:** Choose a strong password (save this!)
   - **Region:** Choose closest to you
4. Click "Create new project" (takes ~2 minutes)

### 1.2 Run Database Schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click "New Query"
3. Copy the entire contents of `backend/supabase-schema.sql`
4. Paste into the SQL editor
5. Click "Run" (bottom right)
6. You should see "Success. No rows returned" - that's good!

### 1.3 Get Your Credentials

1. Click **Settings** (gear icon) in the left sidebar
2. Click **API** in the settings menu
3. Copy these two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
   
Keep these handy, you'll need them in Step 3!

---

## Step 2: OpenAI API Key

### 2.1 Get API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign up or login
3. Click "Create new secret key"
4. Name it "CollegeApps.ai"
5. **Copy the key immediately** (you can't see it again!)
6. Store it somewhere safe

### 2.2 Add Billing (Required)

1. Go to **Settings** > **Billing**
2. Add a payment method
3. Set a monthly limit (e.g., $10/month is plenty for testing)
4. You'll only pay for what you use (~$0.01-0.03 per chat message with GPT-4)

---

## Step 3: Configure Backend

### 3.1 Install Dependencies

Open terminal in the `collegeapps-ai/backend` directory:

```bash
cd collegeapps-ai/backend
npm install
```

This will install Express, OpenAI, Supabase, and other dependencies.

### 3.2 Create Environment File

1. Copy the example file:
```bash
cp .env.example .env
```

2. Edit `.env` and fill in your credentials:
```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# Supabase Configuration  
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key_here

# Server Configuration
PORT=3001
NODE_ENV=development
```

**Where to find Supabase Service Key:**
1. In Supabase dashboard, go to **Settings** > **API**
2. Scroll down to "Project API keys"
3. Copy the **`service_role`** key (NOT the anon key)
4. ⚠️ **IMPORTANT:** Keep this secret! Never commit to git!

---

## Step 4: Configure Frontend

Edit `js/supabase-config.js` and update line 12-13:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co'; // Your Project URL
const SUPABASE_ANON_KEY = 'eyJxxx...'; // Your anon public key
```

---

## Step 5: Run the Application

You need to run TWO servers:

### Terminal 1: Frontend (Static Server)

```bash
cd collegeapps-ai
python3 -m http.server 8000
```

Frontend now running at: http://localhost:8000

### Terminal 2: Backend (AI Server)

```bash
cd collegeapps-ai/backend
npm start
```

Backend now running at: http://localhost:3001

---

## Step 6: Test Everything!

### Test 1: Sign Up

1. Go to http://localhost:8000
2. Click "Get Started" or "Sign Up"
3. Create an account with your email
4. Complete the onboarding flow

### Test 2: AI Chatbot

1. Navigate to AI Counselor page
2. Type: "I'm applying to Stanford and MIT"
3. The AI should:
   - Add both colleges to your list
   - Create all required essay tasks
   - Show detailed requirements
4. Check your college list to verify they were added!

### Test 3: Essay Editor

1. Navigate to Essays page
2. Start typing in an essay
3. Wait 3 seconds - you should see "Saved" indicator
4. Refresh the page - your content should persist!

---

## Troubleshooting

### "Failed to connect to AI"

**Problem:** AI counselor shows connection error

**Solutions:**
1. Make sure backend server is running (`npm start` in backend folder)
2. Check terminal for errors
3. Verify `.env` has correct OpenAI API key
4. Check OpenAI account has billing enabled

### "Supabase error: Invalid API key"

**Problem:** Frontend can't connect to Supabase

**Solutions:**
1. Check `js/supabase-config.js` has correct URL and anon key
2. Verify you're using the **anon/public** key, not service_role
3. Make sure you copied the entire key (they're very long!)

### "Database error" or "Row Level Security"

**Problem:** Can't save data to database

**Solutions:**
1. Make sure you ran the entire `supabase-schema.sql` file
2. Check Supabase dashboard > Table Editor to verify tables exist
3. Try logging out and back in

### Backend crashes with "MODULE_NOT_FOUND"

**Problem:** Node.js can't find packages

**Solution:**
```bash
cd backend
rm -rf  node_modules package-lock.json
npm install
```

---

## Understanding the Architecture

```
┌─────────────────┐
│   Frontend      │  (Port 8000)
│  HTML/CSS/JS    │
│                 │
│  - Landing Page │
│  - Dashboard    │
│  - Essays       │◄─────── Real-time autosave
│  - AI Counselor │
└────────┬────────┘
         │
         │ Supabase Client
         │ (anon key)
         ▼
┌─────────────────┐
│   Supabase      │  (Cloud)
│   PostgreSQL    │
│                 │
│  - Users        │
│  - Colleges     │
│  - Essays       │
│  - Tasks        │
│  - Conversations│
└─────────────────┘
         ▲
         │ Supabase Client
         │ (service key)
         │
┌────────┴────────┐
│   Backend       │  (Port 3001)
│   Node.js       │
│                 │
│  - AI Server    │
│  - OpenAI GPT-4 │
│  - Function     │
│    Calling      │
└─────────────────┘
```

---

## 🎉 You're All Set!

Your full-stack CollegeApps.ai is now running with:
- ✅ Real-time essay autosaving
- ✅ Intelligent AI chatbot
- ✅ Automatic college/essay creation
- ✅ Secure database with Supabase
- ✅ GPT-4 powered assistance

---

## Next Steps

1. **Add more colleges** to `backend/college-data.js`
2. **Customize AI prompts** in `backend/ai-server.js`
3. **Deploy to production:**
   - Frontend: Vercel, Netlify, or GitHub Pages
   - Backend: Railway, Render, or Fly.io
   - Database: Already on Supabase (cloud-hosted)

---

## Cost Breakdown

- **Supabase:** FREE (500MB database, 1GB file storage)
- **OpenAI GPT-4:** ~$0.01-0.03 per message (pay-as-you-go)
- **Frontend Hosting:** FREE (Vercel/Netlify)
- **Backend Hosting:** FREE tier available (Railway/Render)

**Estimated monthly cost for 100 AI conversations:** $2-5

---

## Getting Help

- **Backend Issues:** Check `backend/ai-server.js` logs in terminal
- **Frontend Issues:** Open browser DevTools (F12) > Console
- **Database Issues:** Supabase Dashboard > Logs

Happy building! 🚀
