-- Waypoint Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    graduation_year INTEGER,
    intended_major TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Colleges table
CREATE TABLE public.colleges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    application_platform TEXT, -- "Common App", "UC App", "Coalition"
    deadline DATE,
    deadline_type TEXT, -- "ED", "EA", "RD", "UC"
    essays_required JSONB DEFAULT '[]'::jsonb,
    test_policy TEXT, -- "Required", "Optional", "Test Blind", "Test Flexible"
    lors_required INTEGER DEFAULT 0,
    portfolio_required BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'Not Started', -- "Not Started", "In Progress", "Completed"
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own colleges"
    ON public.colleges FOR ALL
    USING (auth.uid() = user_id);

-- Essays table
CREATE TABLE public.essays (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    essay_type TEXT, -- "Common App", "UC PIQ", "Supplement"
    prompt TEXT,
    content TEXT DEFAULT '',
    word_limit INTEGER,
    word_count INTEGER DEFAULT 0,
    char_count INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    is_completed BOOLEAN DEFAULT false,
    last_saved TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.essays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own essays"
    ON public.essays FOR ALL
    USING (auth.uid() = user_id);

-- Tasks table
CREATE TABLE public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    college_id UUID REFERENCES public.colleges(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    category TEXT, -- "Essay", "Document", "LOR", "General"
    priority TEXT DEFAULT 'Medium', -- "High", "Medium", "Low"
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tasks"
    ON public.tasks FOR ALL
    USING (auth.uid() = user_id);

-- Documents table
CREATE TABLE public.documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Supabase storage path
    file_type TEXT,
    file_size INTEGER,
    category TEXT, -- "Transcript", "Resume", "Award", "Certificate", "Test Score", "Essay Draft", "Portfolio", "Other"
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own documents"
    ON public.documents FOR ALL
    USING (auth.uid() = user_id);

-- Conversations table (for AI chat history)
CREATE TABLE public.conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL, -- "user" or "assistant"
    content TEXT NOT NULL,
    function_call JSONB, -- For AI function calls
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversations"
    ON public.conversations FOR ALL
    USING (auth.uid() = user_id);

-- Essay versions (for version control)
CREATE TABLE public.essay_versions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    essay_id UUID REFERENCES public.essays(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.essay_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own essay versions"
    ON public.essay_versions FOR ALL
    USING (auth.uid() = user_id);

-- Functions

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_colleges_updated_at
    BEFORE UPDATE ON public.colleges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update word count automatically
CREATE OR REPLACE FUNCTION update_essay_word_count()
RETURNS TRIGGER AS $$
BEGIN
    NEW.word_count = array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1);
    NEW.char_count = length(NEW.content);
    NEW.last_saved = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_essay_counts
    BEFORE INSERT OR UPDATE OF content ON public.essays
    FOR EACH ROW
    EXECUTE FUNCTION update_essay_word_count();

-- Create storage bucket for documents (run this separately in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies (run after creating bucket)
-- CREATE POLICY "Users can upload own documents"
--     ON storage.objects FOR INSERT
--     WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can read own documents"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes for performance
CREATE INDEX idx_colleges_user_id ON public.colleges(user_id);
CREATE INDEX idx_essays_user_id ON public.essays(user_id);
CREATE INDEX idx_essays_college_id ON public.essays(college_id);
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);

-- Global College Catalog (Reference data for all users)
CREATE TABLE public.college_catalog (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    application_platform TEXT,
    deadline_date DATE,
    deadline_type TEXT,
    test_policy TEXT,
    lors_required INTEGER,
    portfolio_required BOOLEAN DEFAULT false,
    essays JSONB DEFAULT '[]'::jsonb,
    verified BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Read-only for public)
ALTER TABLE public.college_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view college catalog"
    ON public.college_catalog FOR SELECT
    USING (true);

-- Indexes
CREATE INDEX idx_college_catalog_name ON public.college_catalog(name);
