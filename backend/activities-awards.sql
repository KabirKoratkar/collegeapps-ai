-- Activities and Awards/Honors Schema for Waypoint

-- Activities Table
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    organization TEXT,
    description TEXT,
    years_active INTEGER[] DEFAULT '{}', -- [9, 10, 11, 12]
    hours_per_week INTEGER,
    weeks_per_year INTEGER,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own activities"
    ON public.activities FOR ALL
    USING (auth.uid() = user_id);

-- Awards Table
CREATE TABLE IF NOT EXISTS public.awards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    level TEXT, -- "School", "Regional", "State", "National", "International"
    years_received INTEGER[] DEFAULT '{}', -- [9, 10, 11, 12]
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own awards"
    ON public.awards FOR ALL
    USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_awards_user_id ON public.awards(user_id);
