import OperationsClient from '@/components/OperationsClient';
import SetupGuide from '@/components/SetupGuide';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function OperationsPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <OperationsClient />;
}
