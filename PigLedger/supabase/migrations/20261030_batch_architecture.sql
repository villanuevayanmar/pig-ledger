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
