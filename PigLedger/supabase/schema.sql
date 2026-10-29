-- ============================================================
-- Pig Farm Ledger - Supabase schema (Supabase Auth + Row Level Security)
-- Run this ONCE in Supabase Studio > SQL Editor > New query.
-- Safe to re-run: every statement below is idempotent.
-- ============================================================

create table if not exists farms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Piggery',
  pig_count integer not null default 0,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms(id) on delete cascade,
  date date not null default current_date,
  category text not null default 'Booster',
  description text not null default '',
  qty numeric not null default 0,
  unit text not null default 'Sack',
  price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references farms(id) on delete cascade,
  date date not null default current_date,
  buyer text not null default '',
  heads integer not null default 0,
  weight_kg numeric not null default 0,
  price_per_kg numeric not null default 0,
  gross numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Account ownership ----------------------------------------------------
-- Every record is linked to the signed-in account (auth.users).

alter table farms add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table expenses add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table sales add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists farms_user_idx on farms(user_id);
create index if not exists expenses_user_idx on expenses(user_id);
create index if not exists sales_user_idx on sales(user_id);
create index if not exists expenses_farm_idx on expenses(farm_id, date desc);
create index if not exists sales_farm_idx on sales(farm_id, date desc);

-- Attach pre-authentication records to their farm's owner (if set).

update expenses e set user_id = f.user_id
  from farms f where e.farm_id = f.id and e.user_id is null and f.user_id is not null;
update sales s set user_id = f.user_id
  from farms f where s.farm_id = f.id and s.user_id is null and f.user_id is not null;

-- One-time migration support: when an account claims a legacy farm that
-- had no owner (user_id was null), its expenses and sales inherit that
-- account automatically.

create or replace function public.link_farm_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and (old.user_id is null or old.user_id is distinct from new.user_id) then
    update expenses set user_id = new.user_id where farm_id = new.id and user_id is null;
    update sales set user_id = new.user_id where farm_id = new.id and user_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists link_farm_records on farms;
create trigger link_farm_records
  after update of user_id on farms
  for each row execute function public.link_farm_records();

-- Row Level Security ---------------------------------------------------
-- Signed-in accounts only. The anon role (anon key without a session)
-- is denied everywhere: no policy grants it anything.

alter table farms enable row level security;
alter table expenses enable row level security;
alter table sales enable row level security;

-- Remove the legacy open policies from the pre-authentication release.

drop policy if exists "anon select farms" on farms;
drop policy if exists "anon insert farms" on farms;
drop policy if exists "anon update farms" on farms;
drop policy if exists "anon delete farms" on farms;
drop policy if exists "anon select expenses" on expenses;
drop policy if exists "anon insert expenses" on expenses;
drop policy if exists "anon update expenses" on expenses;
drop policy if exists "anon delete expenses" on expenses;
drop policy if exists "anon select sales" on sales;
drop policy if exists "anon insert sales" on sales;
drop policy if exists "anon update sales" on sales;
drop policy if exists "anon delete sales" on sales;

-- Farms: an account sees and manages its own farm. A farm with no owner
-- yet (legacy data) stays visible/updateable so the first signed-in
-- account can claim it; after claiming, only that account can access it.

drop policy if exists "own select farms" on farms;
create policy "own select farms"
  on farms for select to authenticated
  using (auth.uid() = user_id or user_id is null);

drop policy if exists "own insert farms" on farms;
create policy "own insert farms"
  on farms for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own update farms" on farms;
create policy "own update farms"
  on farms for update to authenticated
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id);

drop policy if exists "own delete farms" on farms;
create policy "own delete farms"
  on farms for delete to authenticated
  using (auth.uid() = user_id);

-- Expenses: strictly the signed-in owner (select, insert, update, delete).

drop policy if exists "own select expenses" on expenses;
create policy "own select expenses"
  on expenses for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own insert expenses" on expenses;
create policy "own insert expenses"
  on expenses for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own update expenses" on expenses;
create policy "own update expenses"
  on expenses for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own delete expenses" on expenses;
create policy "own delete expenses"
  on expenses for delete to authenticated
  using (auth.uid() = user_id);

-- Sales: strictly the signed-in owner (select, insert, update, delete).

drop policy if exists "own select sales" on sales;
create policy "own select sales"
  on sales for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own insert sales" on sales;
create policy "own insert sales"
  on sales for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own update sales" on sales;
create policy "own update sales"
  on sales for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own delete sales" on sales;
create policy "own delete sales"
  on sales for delete to authenticated
  using (auth.uid() = user_id);



-- Batch architecture migration; kept here for fresh project setup.


-- Batch architecture extension for fresh setups.
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null default current_date,
  target_sale_date date,
  initial_heads integer not null default 0 check (initial_heads >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  projection jsonb not null default '{"plannedHeads":0,"expectedAvgSaleWeightKg":0,"expectedPricePerKg":0,"pigletPricePerHead":0,"projectedFeedCost":0,"projectedOtherCosts":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses
  add column if not exists batch_id uuid references public.batches(id) on delete set null,
  add column if not exists expense_type text not null default 'other',
  add column if not exists item_name text not null default '';

alter table public.sales
  add column if not exists batch_id uuid references public.batches(id) on delete set null;

update public.expenses
set expense_type = 'feed', item_name = coalesce(nullif(item_name, ''), description)
where category in ('Booster', 'Pre-Starter', 'Starter', 'Grower', 'Finisher', 'Other Feed')
  and expense_type = 'other';

create index if not exists batches_farm_status_idx on public.batches (farm_id, status);
create index if not exists expenses_batch_date_idx on public.expenses (batch_id, date desc);
create index if not exists sales_batch_date_idx on public.sales (batch_id, date desc);

alter table public.batches enable row level security;

drop policy if exists "own select batches" on public.batches;
create policy "own select batches" on public.batches
  for select to authenticated using (auth.uid() = batches.user_id);

drop policy if exists "own insert batches" on public.batches;
create policy "own insert batches" on public.batches
  for insert to authenticated with check (
    auth.uid() = batches.user_id and exists (
      select 1 from public.farms f where f.id = batches.farm_id and f.user_id = auth.uid()
    )
  );

drop policy if exists "own update batches" on public.batches;
create policy "own update batches" on public.batches
  for update to authenticated using (auth.uid() = batches.user_id)
  with check (
    auth.uid() = batches.user_id and exists (
      select 1 from public.farms f where f.id = batches.farm_id and f.user_id = auth.uid()
    )
  );

drop policy if exists "own delete batches" on public.batches;
create policy "own delete batches" on public.batches
  for delete to authenticated using (auth.uid() = batches.user_id);

drop policy if exists "own select expenses" on public.expenses;
create policy "own select expenses" on public.expenses
  for select to authenticated using (auth.uid() = expenses.user_id);

drop policy if exists "own insert expenses" on public.expenses;
create policy "own insert expenses" on public.expenses
  for insert to authenticated with check (
    auth.uid() = expenses.user_id and (
      expenses.batch_id is null or exists (
        select 1 from public.batches b where b.id = expenses.batch_id
          and b.farm_id = expenses.farm_id and b.user_id = auth.uid()
      )
    )
  );

drop policy if exists "own update expenses" on public.expenses;
create policy "own update expenses" on public.expenses
  for update to authenticated using (auth.uid() = expenses.user_id)
  with check (
    auth.uid() = expenses.user_id and (
      expenses.batch_id is null or exists (
        select 1 from public.batches b where b.id = expenses.batch_id
          and b.farm_id = expenses.farm_id and b.user_id = auth.uid()
      )
    )
  );

drop policy if exists "own select sales" on public.sales;
create policy "own select sales" on public.sales
  for select to authenticated using (auth.uid() = sales.user_id);

drop policy if exists "own insert sales" on public.sales;
create policy "own insert sales" on public.sales
  for insert to authenticated with check (
    auth.uid() = sales.user_id and (
      sales.batch_id is null or exists (
        select 1 from public.batches b where b.id = sales.batch_id
          and b.farm_id = sales.farm_id and b.user_id = auth.uid()
      )
    )
  );

drop policy if exists "own update sales" on public.sales;
create policy "own update sales" on public.sales
  for update to authenticated using (auth.uid() = sales.user_id)
  with check (
    auth.uid() = sales.user_id and (
      sales.batch_id is null or exists (
        select 1 from public.batches b where b.id = sales.batch_id
          and b.farm_id = sales.farm_id and b.user_id = auth.uid()
      )
    )
  );
