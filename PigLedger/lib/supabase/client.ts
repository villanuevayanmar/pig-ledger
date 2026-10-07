import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for browser components (backup download/restore). */
export function createBrowserClientApp() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
