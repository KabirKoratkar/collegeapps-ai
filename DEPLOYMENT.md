# Deployment Guide

Follow these steps to deploy your CollegeApps.ai application:

## Step 1: Deploy Backend to Railway

### Option A: Using Railway Web Interface (Recommended)

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account and select your repo
   - Railway will auto-detect the Node.js app

3. **Configure Build Settings**
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`

4. **Set Environment Variables**
   - Go to Variables tab
   - Add these variables:
     ```
     SUPABASE_URL=your_supabase_url
     SUPABASE_SERVICE_KEY=your_supabase_service_key
     OPENAI_API_KEY=your_openai_key
     PORT=3001
     ```

5. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Copy the generated URL (e.g., `https://your-app.railway.app`)

### Option B: Using Railway CLI

```bash
# Install Railway CLI (requires sudo)
sudo npm install -g @railway/cli

# Login
railway login

# Navigate to backend
cd backend

# Initialize and deploy
railway init
railway up

# Set environment variables
railway variables set SUPABASE_URL=your_url
railway variables set SUPABASE_SERVICE_KEY=your_key
railway variables set OPENAI_API_KEY=your_key
```

## Step 2: Update Frontend Config

1. Open `js/config.js`
2. Replace `'https://your-railway-app.railway.app'` with your actual Railway URL
3. Save the file

## Step 3: Deploy Frontend to Vercel

### Option A: Using Vercel Web Interface (Recommended)

1. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub

2. **Import Project**
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect it as a static site

3. **Configure Project**
   - Framework Preset: Other
   - Root Directory: `./`
   - Build Command: (leave empty)
   - Output Directory: (leave empty)

4. **Deploy**
   - Click "Deploy"
   - Wait for deployment
   - Your site will be live at `https://your-project.vercel.app`

### Option B: Using Vercel CLI

```bash
# Install Vercel CLI (requires sudo)
sudo npm install -g vercel

# Login
vercel login

# Deploy from root directory
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? collegeapps-ai
# - Directory? ./
# - Override settings? No
```

## Step 4: Test Your Deployment

1. Visit your Vercel URL
2. Try signing up/logging in
3. Test the AI counselor chat
4. Verify database connections work

## Troubleshooting

### Backend Issues
- Check Railway logs for errors
- Verify all environment variables are set
- Ensure Supabase keys are correct

### Frontend Issues
- Check browser console for errors
- Verify `config.js` has correct Railway URL
- Check CORS settings in backend

### CORS Errors
- Make sure backend CORS allows your Vercel domain
- Backend should already be configured to allow `*.vercel.app`

## Next Steps

After successful deployment:
- Share your Vercel URL with friends!
- Monitor Railway usage (free tier has limits)
- Consider adding a custom domain
