alter table public.expenses
  add column if not exists kg_per_unit numeric not null default 0;

alter table public.batches
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_kg_per_unit_nonnegative'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_kg_per_unit_nonnegative
      check (kg_per_unit >= 0);
  end if;
end $$;

create index if not exists batches_visible_farm_start_idx
  on public.batches (farm_id, start_date desc)
  where deleted_at is null and status <> 'archived';

comment on column public.expenses.kg_per_unit is
  'Kilograms represented by one entered unit, such as one sack of feed.';
comment on column public.batches.deleted_at is
  'Soft-delete timestamp; deleted batches are excluded from normal ledger views.';
