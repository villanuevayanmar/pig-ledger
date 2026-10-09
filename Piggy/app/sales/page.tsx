import SetupGuide from '@/components/SetupGuide';
import SalesClient from '@/components/SalesClient';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Offline-first: instant local list, background sync to Supabase. */
export default function SalesPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <SalesClient />;
}

