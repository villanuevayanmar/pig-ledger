import MonitoringClient from '@/components/MonitoringClient';
import SetupGuide from '@/components/SetupGuide';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function MonitoringPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <MonitoringClient />;
}
