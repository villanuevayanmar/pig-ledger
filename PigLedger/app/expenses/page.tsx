import SetupGuide from '@/components/SetupGuide';
import ExpensesClient from '@/components/ExpensesClient';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function ExpensesPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <ExpensesClient />;
}

