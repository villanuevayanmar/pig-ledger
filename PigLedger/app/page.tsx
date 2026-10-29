import SetupGuide from '@/components/SetupGuide';
import HomeClient from '@/components/HomeClient';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Home renders offline-first: the client loads the phone copy
 * instantly, then syncs with Supabase when online.
 */
export default function HomePage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <HomeClient />;
}

