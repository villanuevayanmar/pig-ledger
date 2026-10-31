-- Phase 2 foundation: population and feed ledgers.
-- Source-controlled migration only. Do not apply to production without explicit approval.
-- Inventory is movement-based: purchases/adjustments are stock-in; consumption/waste are stock-out.
-- Sales remain in the sales ledger and must not be counted again as population movements.

-- Required as the referenced key for farm-consistent foreign keys.
create unique index if not exists batches_id_farm_unique on public.batches(id, farm_id);

create table if not exists public.population_movements (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  movement_date date not null default current_date,
  movement_type text not null check (movement_type in ('opening', 'purchase', 'mortality', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out')),
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

-- Movement ledgers are append-only. Correct errors with counter-movements
-- so stock and herd history remains auditable.
drop policy if exists population_movements_farm_owner on public.population_movements;
drop policy if exists population_movements_select_owner on public.population_movements;
drop policy if exists population_movements_insert_owner on public.population_movements;
create policy population_movements_select_owner on public.population_movements
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = population_movements.farm_id
        and f.user_id = (select auth.uid())
    )
  );
create policy population_movements_insert_owner on public.population_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = population_movements.farm_id
        and f.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.batches b
      where b.id = population_movements.batch_id
        and b.farm_id = population_movements.farm_id
        and b.user_id = (select auth.uid())
    )
  );

drop policy if exists feed_products_farm_owner on public.feed_products;
drop policy if exists feed_products_owner on public.feed_products;
create policy feed_products_owner on public.feed_products
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = feed_products.farm_id
        and f.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = feed_products.farm_id
        and f.user_id = (select auth.uid())
    )
  );

drop policy if exists feed_inventory_farm_owner on public.feed_inventory_movements;
drop policy if exists feed_inventory_select_owner on public.feed_inventory_movements;
drop policy if exists feed_inventory_insert_owner on public.feed_inventory_movements;
create policy feed_inventory_select_owner on public.feed_inventory_movements
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = feed_inventory_movements.farm_id
        and f.user_id = (select auth.uid())
    )
  );
create policy feed_inventory_insert_owner on public.feed_inventory_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = feed_inventory_movements.farm_id
        and f.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.feed_products p
      where p.id = feed_inventory_movements.product_id
        and p.farm_id = feed_inventory_movements.farm_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists feed_consumption_farm_owner on public.feed_consumption;
drop policy if exists feed_consumption_select_owner on public.feed_consumption;
drop policy if exists feed_consumption_insert_owner on public.feed_consumption;
create policy feed_consumption_select_owner on public.feed_consumption
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = feed_consumption.farm_id
        and f.user_id = (select auth.uid())
    )
  );
create policy feed_consumption_insert_owner on public.feed_consumption
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = feed_consumption.farm_id
        and f.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.batches b
      where b.id = feed_consumption.batch_id
        and b.farm_id = feed_consumption.farm_id
        and b.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.feed_products p
      where p.id = feed_consumption.product_id
        and p.farm_id = feed_consumption.farm_id
        and p.user_id = (select auth.uid())
    )
  );

comment on table public.population_movements is
  'Append-only population event ledger; sales are accounted for in the sales table to prevent double counting.';
comment on table public.feed_inventory_movements is
  'Feed stock-in and stock-out adjustments; purchase rows represent purchased inventory, not consumed feed.';
comment on table public.feed_consumption is
  'Feed actually issued/consumed by a batch; kg is quantity_units multiplied by kg_per_unit_snapshot.';

-- Serialize feed consumption by locking the product row and validate the
-- current stock inside the same database transaction as the consumption insert.
create or replace function public.record_feed_consumption(
  p_id uuid,
  p_farm_id uuid,
  p_batch_id uuid,
  p_product_id uuid,
  p_consumption_date date,
  p_quantity_units numeric,
  p_kg_per_unit_snapshot numeric,
  p_notes text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock_kg numeric := 0;
  v_required_kg numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_quantity_units is null or p_quantity_units <= 0
     or p_kg_per_unit_snapshot is null or p_kg_per_unit_snapshot <= 0 then
    raise exception 'Consumption quantity and kilograms per unit must be greater than zero';
  end if;

  -- A retry after a successful insert must be idempotent.
  if exists (
    select 1 from public.feed_consumption fc
    where fc.id = p_id and fc.user_id = (select auth.uid())
  ) then
    return p_id;
  end if;

  -- All consumption requests for one product serialize on this row.
  perform 1 from public.feed_products fp
  where fp.id = p_product_id
    and fp.farm_id = p_farm_id
    and fp.user_id = (select auth.uid())
    and fp.is_active
  for update;
  if not found then
    raise exception 'Feed product not found or inactive';
  end if;

  if not exists (
    select 1 from public.batches b
    where b.id = p_batch_id
      and b.farm_id = p_farm_id
      and b.user_id = (select auth.uid())
  ) then
    raise exception 'Batch does not belong to this farm';
  end if;

  select
    coalesce(sum(
      case
        when im.movement_type in ('purchase', 'adjustment_in')
          then im.quantity_units * im.kg_per_unit_snapshot
        when im.movement_type in ('adjustment_out', 'waste')
          then -im.quantity_units * im.kg_per_unit_snapshot
        else 0
      end
    ), 0)
    into v_stock_kg
  from public.feed_inventory_movements im
  where im.product_id = p_product_id and im.farm_id = p_farm_id;

  select v_stock_kg - coalesce(sum(fc.quantity_units * fc.kg_per_unit_snapshot), 0)
    into v_stock_kg
  from public.feed_consumption fc
  where fc.product_id = p_product_id and fc.farm_id = p_farm_id;

  v_required_kg := p_quantity_units * p_kg_per_unit_snapshot;
  if v_stock_kg + 0.000001 < v_required_kg then
    raise exception 'Insufficient feed stock. Available: % kg; requested: % kg',
      round(v_stock_kg, 2), round(v_required_kg, 2);
  end if;

  insert into public.feed_consumption (
    id, farm_id, batch_id, product_id, user_id, consumption_date,
    quantity_units, kg_per_unit_snapshot, notes
  ) values (
    p_id, p_farm_id, p_batch_id, p_product_id, (select auth.uid()),
    coalesce(p_consumption_date, current_date), p_quantity_units,
    p_kg_per_unit_snapshot, coalesce(p_notes, '')
  );

  return p_id;
end;
$$;

grant execute on function public.record_feed_consumption(uuid, uuid, uuid, uuid, date, numeric, numeric, text)
  to authenticated;

comment on function public.record_feed_consumption(uuid, uuid, uuid, uuid, date, numeric, numeric, text) is
  'Idempotently records actual feed consumption after locking the product and checking stock.';

-- Explicit least-privilege table grants for the authenticated app.
grant select, insert on public.population_movements to authenticated;
grant select, insert, update on public.feed_products to authenticated;
grant select, insert on public.feed_inventory_movements to authenticated;
grant select, insert on public.feed_consumption to authenticated;

-- Record population events while holding a batch lock. This serializes
-- mortality/transfer-out adjustments and sales for the same batch.
create or replace function public.record_population_movement(
  p_id uuid,
  p_farm_id uuid,
  p_batch_id uuid,
  p_movement_date date,
  p_movement_type text,
  p_heads integer,
  p_notes text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_initial_heads integer;
  v_has_opening boolean;
  v_population numeric := 0;
  v_sold numeric := 0;
  v_current numeric := 0;
  v_delta numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_heads is null or p_heads <= 0 then
    raise exception 'The number of pigs must be a positive whole number';
  end if;
  if p_movement_type not in ('purchase', 'mortality', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out') then
    raise exception 'Unsupported population movement type';
  end if;

  if exists (
    select 1 from public.population_movements pm
    where pm.id = p_id and pm.user_id = (select auth.uid())
  ) then
    return p_id;
  end if;

  select b.initial_heads
    into v_initial_heads
  from public.batches b
  where b.id = p_batch_id
    and b.farm_id = p_farm_id
    and b.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Batch does not belong to this farm';
  end if;

  select exists (
    select 1 from public.population_movements pm
    where pm.batch_id = p_batch_id
      and pm.farm_id = p_farm_id
      and pm.movement_type = 'opening'
  ) into v_has_opening;

  select coalesce(sum(
    case
      when pm.movement_type in ('opening', 'purchase', 'transfer_in', 'adjustment_in') then pm.heads
      when pm.movement_type in ('mortality', 'transfer_out', 'adjustment_out') then -pm.heads
      else 0
    end
  ), 0)
    into v_population
  from public.population_movements pm
  where pm.batch_id = p_batch_id and pm.farm_id = p_farm_id;

  if not v_has_opening then
    v_population := v_population + v_initial_heads;
  end if;

  select coalesce(sum(s.heads), 0)
    into v_sold
  from public.sales s
  where s.batch_id = p_batch_id and s.farm_id = p_farm_id;

  v_current := v_population - v_sold;
  if p_movement_type in ('mortality', 'transfer_out', 'adjustment_out') then
    v_delta := -p_heads;
    if p_heads > v_current then
      raise exception 'This movement exceeds the current recorded batch population (% pigs available)', greatest(v_current, 0);
    end if;
  else
    v_delta := p_heads;
  end if;

  insert into public.population_movements (
    id, farm_id, batch_id, user_id, movement_date, movement_type, heads, notes
  ) values (
    p_id, p_farm_id, p_batch_id, (select auth.uid()),
    coalesce(p_movement_date, current_date), p_movement_type, p_heads, coalesce(p_notes, '')
  );

  return p_id;
end;
$$;

grant execute on function public.record_population_movement(uuid, uuid, uuid, date, text, integer, text)
  to authenticated;

-- Batch-linked sale inserts/edits use the same batch lock as population RPCs,
-- preventing concurrent transactions from selling or removing more pigs than exist.
create or replace function public.validate_batch_sale_population()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_initial_heads integer;
  v_has_opening boolean;
  v_population numeric := 0;
  v_other_sales numeric := 0;
begin
  if new.batch_id is null then
    return new;
  end if;
  if new.heads is null or new.heads <= 0 then
    raise exception 'A batch-linked sale must include at least one pig';
  end if;

  select b.initial_heads
    into v_initial_heads
  from public.batches b
  where b.id = new.batch_id
    and b.farm_id = new.farm_id
    and b.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Batch does not belong to this farm';
  end if;

  select exists (
    select 1 from public.population_movements pm
    where pm.batch_id = new.batch_id
      and pm.farm_id = new.farm_id
      and pm.movement_type = 'opening'
  ) into v_has_opening;

  select coalesce(sum(
    case
      when pm.movement_type in ('opening', 'purchase', 'transfer_in', 'adjustment_in') then pm.heads
      when pm.movement_type in ('mortality', 'transfer_out', 'adjustment_out') then -pm.heads
      else 0
    end
  ), 0)
    into v_population
  from public.population_movements pm
  where pm.batch_id = new.batch_id and pm.farm_id = new.farm_id;

  if not v_has_opening then
    v_population := v_population + v_initial_heads;
  end if;

  select coalesce(sum(s.heads), 0)
    into v_other_sales
  from public.sales s
  where s.batch_id = new.batch_id
    and s.farm_id = new.farm_id
    and s.id <> new.id;

  if new.heads > v_population - v_other_sales then
    raise exception 'Sale exceeds the current recorded batch population (% pigs available)', greatest(v_population - v_other_sales, 0);
  end if;

  return new;
end;
$$;

drop trigger if exists validate_batch_sale_population on public.sales;
create trigger validate_batch_sale_population
  before insert or update of heads, batch_id, farm_id on public.sales
  for each row execute function public.validate_batch_sale_population();

comment on function public.record_population_movement(uuid, uuid, uuid, date, text, integer, text) is
  'Idempotently records batch population changes after locking the batch and checking current head count.';
comment on function public.validate_batch_sale_population() is
  'Prevents batch-linked sales from reducing the recorded batch population below zero.';
