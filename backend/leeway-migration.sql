-- Migration to add submission_leeway to profiles
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS submission_leeway INTEGER DEFAULT 3;
