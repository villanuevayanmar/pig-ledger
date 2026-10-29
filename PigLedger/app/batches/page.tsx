import BatchClient from '@/components/BatchClient';
import SetupGuide from '@/components/SetupGuide';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function BatchesPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <BatchClient />;
}
