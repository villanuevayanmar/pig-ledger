import SetupGuide from '@/components/SetupGuide';
import SettingsClient from '@/components/SettingsClient';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <SettingsClient />;
}

