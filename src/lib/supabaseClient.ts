import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl) {
  throw new Error('[Supabase] VITE_SUPABASE_URL is required. Create a .env file from .env.example and set your values.');
}

if (!supabaseAnonKey) {
  throw new Error('[Supabase] VITE_SUPABASE_ANON_KEY is required. Create a .env file from .env.example and set your values.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
