-- Phase 1 security hardening.
-- This migration is source-controlled only; do not apply it to production
-- until the user has reviewed and explicitly approved the database change.

-- The function is intended to run only as the trigger attached to farms.
-- Clients do not need direct EXECUTE permission on a SECURITY DEFINER function.
revoke all on function public.link_farm_records() from public, anon, authenticated;

-- Support the ownership predicate used by batches RLS policies.
create index if not exists batches_user_id_idx
  on public.batches (user_id);

comment on index public.batches_user_id_idx is
  'Supports owner-scoped batch queries and row-level security checks.';
