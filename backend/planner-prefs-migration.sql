-- Migration to add planner preferences to profiles
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_weekends BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_word_goal INTEGER DEFAULT 300;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS intensity_level TEXT DEFAULT 'Balanced'; -- 'Chill', 'Balanced', 'Grind'
