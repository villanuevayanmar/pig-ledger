import FatteningClient from '@/components/FatteningClient';
import SetupGuide from '@/components/SetupGuide';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fattening Computation | Pig Farm Ledger',
};

export default function FatteningPage({ searchParams }: { searchParams: { next?: string } }) {
  if (!supabaseConfigured) return <SetupGuide />;
  return <FatteningClient next={searchParams.next ?? null} />;
}