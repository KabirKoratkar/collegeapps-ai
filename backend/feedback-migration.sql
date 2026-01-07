-- Tickets/Feedback Table
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'Feedback', -- 'Feedback', 'Bug', 'Recommendation', 'Issue'
    status TEXT DEFAULT 'Open', -- 'Open', 'In Progress', 'Closed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create a ticket (for beta testing)
CREATE POLICY "Anyone can create tickets"
    ON public.tickets FOR INSERT
    WITH CHECK (true);

-- Allow users to view their own tickets
CREATE POLICY "Users can view own tickets"
    ON public.tickets FOR SELECT
    USING (auth.uid() = user_id);

-- Optional: Allow admin viewing (you'll need to handle this via your Supabase dashboard)
