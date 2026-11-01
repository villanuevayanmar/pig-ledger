import BusinessClient from '@/components/BusinessClient';
import SetupGuide from '@/components/SetupGuide';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default function BusinessPage() {
  if (!supabaseConfigured) return <SetupGuide />;
  return <BusinessClient />;
}
