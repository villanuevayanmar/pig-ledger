-- Phase 2 foundation: population and feed ledgers.
-- Source-controlled migration only. Do not apply to production without explicit approval.
-- Inventory is movement-based: purchases/adjustments are stock-in; consumption/waste are stock-out.
-- Sales remain in the sales ledger and must not be counted again as population movements.

create table if not exists public.population_movements (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  movement_date date not null default current_date,
  movement_type text not null check (movement_type in ('opening', 'purchase', 'mortality', 'transfer_in', 'transfer_out', 'adjustment')),
  heads integer not null check (heads > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint population_movement_batch_farm_fk
    foreign key (batch_id, farm_id) references public.batches(id, farm_id)
    on delete restrict
);

create table if not exists public.feed_products (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Other Feed',
  unit text not null default 'Sack',
  kg_per_unit numeric not null check (kg_per_unit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (farm_id, name),
  unique (id, farm_id)
);

create table if not exists public.feed_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  product_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  movement_date date not null default current_date,
  movement_type text not null check (movement_type in ('purchase', 'adjustment_in', 'adjustment_out', 'waste')),
  quantity_units numeric not null check (quantity_units > 0),
  kg_per_unit_snapshot numeric not null check (kg_per_unit_snapshot > 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint feed_movement_product_farm_fk
    foreign key (product_id, farm_id) references public.feed_products(id, farm_id)
    on delete restrict
);

create table if not exists public.feed_consumption (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  batch_id uuid not null,
  product_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  consumption_date date not null default current_date,
  quantity_units numeric not null check (quantity_units > 0),
  kg_per_unit_snapshot numeric not null check (kg_per_unit_snapshot > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint feed_consumption_batch_farm_fk
    foreign key (batch_id, farm_id) references public.batches(id, farm_id)
    on delete restrict,
  constraint feed_consumption_product_farm_fk
    foreign key (product_id, farm_id) references public.feed_products(id, farm_id)
    on delete restrict
);

-- Composite unique keys support farm-consistent foreign keys.
create unique index if not exists batches_id_farm_unique on public.batches(id, farm_id);

create index if not exists population_movements_batch_date_idx
  on public.population_movements(batch_id, movement_date desc);
create index if not exists population_movements_farm_date_idx
  on public.population_movements(farm_id, movement_date desc);
create index if not exists feed_products_farm_active_idx
  on public.feed_products(farm_id, is_active, name);
create index if not exists feed_inventory_product_date_idx
  on public.feed_inventory_movements(product_id, movement_date desc);
create index if not exists feed_consumption_batch_date_idx
  on public.feed_consumption(batch_id, consumption_date desc);
create index if not exists feed_consumption_product_date_idx
  on public.feed_consumption(product_id, consumption_date desc);

alter table public.population_movements enable row level security;
alter table public.feed_products enable row level security;
alter table public.feed_inventory_movements enable row level security;
alter table public.feed_consumption enable row level security;

drop policy if exists population_movements_farm_owner on public.population_movements;
create policy population_movements_farm_owner on public.population_movements
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ));

drop policy if exists feed_products_farm_owner on public.feed_products;
create policy feed_products_farm_owner on public.feed_products
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ));

drop policy if exists feed_inventory_farm_owner on public.feed_inventory_movements;
create policy feed_inventory_farm_owner on public.feed_inventory_movements
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ));

drop policy if exists feed_consumption_farm_owner on public.feed_consumption;
create policy feed_consumption_farm_owner on public.feed_consumption
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())
  ));

comment on table public.population_movements is
  'Append-only population event ledger; sales are accounted for in the sales table to prevent double counting.';
comment on table public.feed_inventory_movements is
  'Feed stock-in and stock-out adjustments; purchase rows represent purchased inventory, not consumed feed.';
comment on table public.feed_consumption is
  'Feed actually issued/consumed by a batch; kg is quantity_units multiplied by kg_per_unit_snapshot.';
