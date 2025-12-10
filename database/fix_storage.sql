-- Fix storage bucket RLS policies for media uploads

-- First, check if the media bucket exists and create it if not
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Disable RLS on storage.objects for the media bucket (temporary for development)
-- This allows uploads without authentication
CREATE POLICY "Allow public uploads to media bucket" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'media');

CREATE POLICY "Allow public access to media bucket" ON storage.objects
FOR SELECT USING (bucket_id = 'media');

-- Alternative: If you want to completely disable RLS on storage.objects
-- ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Make sure the bucket is public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'media';
