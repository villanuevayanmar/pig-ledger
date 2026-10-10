import SetupGuide from '@/components/SetupGuide';
import HomeClient from '@/components/HomeClient';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <HomeClient />;
}

