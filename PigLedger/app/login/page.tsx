import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';
import SetupGuide from '@/components/SetupGuide';
import { supabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign In | Pig Farm Ledger'
};

/**
 * Single entry point for Email + Password authentication.
 * Unauthenticated visitors are redirected here by middleware.
 */
export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  if (!supabaseConfigured) return <SetupGuide />;
  return <AuthForm next={searchParams.next ?? null} />;
}
