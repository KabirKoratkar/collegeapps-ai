-- Migration to setup Supabase Storage for documents
-- Run this in the Supabase SQL Editor

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (Usually enabled by default, skipping to avoid permission errors)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Delete existing policies if they exist to avoid conflicts during re-run
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

-- 4. Create policies
-- Policy: Allow users to upload to their own folder (folder name matches user ID)
CREATE POLICY "Users can upload own documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'documents' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Allow users to view their own documents
CREATE POLICY "Users can read own documents"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'documents' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy: Allow users to delete their own documents
CREATE POLICY "Users can delete own documents"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'documents' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );
