import SetupGuide from '@/components/SetupGuide';
import ExpensesClient from '@/components/ExpensesClient';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Offline-first: instant local list, background sync to Supabase. */
export default function ExpensesPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <ExpensesClient />;
}

