import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabaseUrl = rawUrl && rawUrl.length > 0
  ? rawUrl
  : 'https://azwhxeavvmequwfteofw.supabase.co';

const supabaseAnonKey = rawKey && rawKey.length > 0
  ? rawKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6d2h4ZWF2dm1lcXV3ZnRlb2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzgxOTQsImV4cCI6MjA5OTI1NDE5NH0.tFRL6SJ7dBv6Q2c9V7MHORWmJdryHnpmXVbT72xS61w';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers);
      if (!headers.has('apikey')) {
        headers.set('apikey', supabaseAnonKey);
      }
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
      }
      return fetch(url, { ...options, headers });
    },
  },
});