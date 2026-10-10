-- ============================================================
-- Pig Farm Ledger - Supabase schema
-- Run this ONCE in Supabase Studio > SQL Editor > New query
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

create index if not exists expenses_farm_idx on expenses(farm_id, date desc);
create index if not exists sales_farm_idx on sales(farm_id, date desc);

-- RLS: single-owner ledger. Policies below allow the public anon key
-- (safe for a private farm app). Tighten later by adding Supabase Auth
-- and swapping `to anon` with `to authenticated` + auth.uid() checks.
alter table farms enable row level security;
alter table expenses enable row level security;
alter table sales enable row level security;

create policy "anon select farms" on farms for select to anon using (true);
create policy "anon insert farms" on farms for insert to anon with check (true);
create policy "anon update farms" on farms for update to anon using (true);
create policy "anon delete farms" on farms for delete to anon using (true);

create policy "anon select expenses" on expenses for select to anon using (true);
create policy "anon insert expenses" on expenses for insert to anon with check (true);
create policy "anon update expenses" on expenses for update to anon using (true);
create policy "anon delete expenses" on expenses for delete to anon using (true);

create policy "anon select sales" on sales for select to anon using (true);
create policy "anon insert sales" on sales for insert to anon with check (true);
create policy "anon update sales" on sales for update to anon using (true);
create policy "anon delete sales" on sales for delete to anon using (true);

-- Seed one farm row so the app always has a record to use.
insert into farms (name, pig_count)
select 'My Piggery', 0
where not exists (select 1 from farms);
