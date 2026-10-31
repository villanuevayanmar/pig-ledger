-- Multi-farm hardening and compatibility follow-up.
-- Source-controlled only; do not apply to production without explicit approval.
-- This migration must run after 20261031_phase4_multi_farm_memberships.sql.

-- Preserve creator/audit identity when another authorized farm member edits a row.
create or replace function private.prevent_creator_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'The original record creator cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_creator_change() from public, anon, authenticated;

drop trigger if exists preserve_creator_batches on public.batches;
create trigger preserve_creator_batches before update of user_id on public.batches for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_expenses on public.expenses;
create trigger preserve_creator_expenses before update of user_id on public.expenses for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_sales on public.sales;
create trigger preserve_creator_sales before update of user_id on public.sales for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_population_movements on public.population_movements;
create trigger preserve_creator_population_movements before update of user_id on public.population_movements for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_feed_products on public.feed_products;
create trigger preserve_creator_feed_products before update of user_id on public.feed_products for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_feed_inventory_movements on public.feed_inventory_movements;
create trigger preserve_creator_feed_inventory_movements before update of user_id on public.feed_inventory_movements for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_feed_consumption on public.feed_consumption;
create trigger preserve_creator_feed_consumption before update of user_id on public.feed_consumption for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_weight_records on public.weight_records;
create trigger preserve_creator_weight_records before update of user_id on public.weight_records for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_health_records on public.health_records;
create trigger preserve_creator_health_records before update of user_id on public.health_records for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_customers on public.customers;
create trigger preserve_creator_customers before update of user_id on public.customers for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_suppliers on public.suppliers;
create trigger preserve_creator_suppliers before update of user_id on public.suppliers for each row execute function private.prevent_creator_change();
drop trigger if exists preserve_creator_sale_payments on public.sale_payments;
create trigger preserve_creator_sale_payments before update of user_id on public.sale_payments for each row execute function private.prevent_creator_change();

-- Permit the one-time adoption of a truly unowned legacy farm. On adoption,
-- the new user is added as its owner member. Farms that already have owners
-- cannot be claimed by another user.
drop policy if exists farms_legacy_claim on public.farms;
create policy farms_legacy_claim on public.farms
  for update to authenticated
  using (farms.user_id is null)
  with check (farms.user_id = (select auth.uid()));

create or replace function private.add_legacy_farm_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is null and new.user_id is not null then
    insert into public.farm_memberships (farm_id, user_id, role, invited_by)
    values (new.id, new.user_id, 'owner', new.user_id)
    on conflict (farm_id, user_id) do update set role = 'owner';
  end if;
  return new;
end;
$$;
revoke all on function private.add_legacy_farm_owner_membership() from public, anon, authenticated;
drop trigger if exists add_legacy_farm_owner_membership on public.farms;
create trigger add_legacy_farm_owner_membership
  after update of user_id on public.farms
  for each row execute function private.add_legacy_farm_owner_membership();

-- Public RPC wrappers are required for the Supabase client Data API. The
-- privileged implementation remains in the private schema.
create or replace function public.accept_farm_invitation(p_invite_code uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_farm_invitation(p_invite_code);
$$;
create or replace function public.update_farm_member_role(p_farm_id uuid, p_member_user_id uuid, p_role text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_farm_member_role(p_farm_id, p_member_user_id, p_role);
$$;
create or replace function public.remove_farm_member(p_farm_id uuid, p_member_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_farm_member(p_farm_id, p_member_user_id);
$$;
revoke all on function public.accept_farm_invitation(uuid) from public, anon;
revoke all on function public.update_farm_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_farm_member(uuid, uuid) from public, anon;
grant execute on function public.accept_farm_invitation(uuid) to authenticated;
grant execute on function public.update_farm_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_farm_member(uuid, uuid) to authenticated;

-- Inserts must record the authenticated actor, while updates preserve the
-- creator via the trigger above. Related records must remain in the same farm.
drop policy if exists batches_staff_insert on public.batches;
create policy batches_staff_insert on public.batches
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_write_farm(batches.farm_id));

drop policy if exists expenses_staff_insert on public.expenses;
create policy expenses_staff_insert on public.expenses
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(expenses.farm_id)
    and (
      expenses.batch_id is null
      or exists (select 1 from public.batches b where b.id = expenses.batch_id and b.farm_id = expenses.farm_id)
    )
  );

drop policy if exists sales_staff_insert on public.sales;
create policy sales_staff_insert on public.sales
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(sales.farm_id)
    and (
      sales.batch_id is null
      or exists (select 1 from public.batches b where b.id = sales.batch_id and b.farm_id = sales.farm_id)
    )
  );

drop policy if exists population_movements_staff_insert on public.population_movements;
create policy population_movements_staff_insert on public.population_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(population_movements.farm_id)
    and exists (
      select 1 from public.batches b
      where b.id = population_movements.batch_id and b.farm_id = population_movements.farm_id
    )
  );

drop policy if exists feed_products_staff_insert on public.feed_products;
create policy feed_products_staff_insert on public.feed_products
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_write_farm(feed_products.farm_id));

drop policy if exists feed_inventory_staff_insert on public.feed_inventory_movements;
create policy feed_inventory_staff_insert on public.feed_inventory_movements
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(feed_inventory_movements.farm_id)
    and exists (
      select 1 from public.feed_products p
      where p.id = feed_inventory_movements.product_id and p.farm_id = feed_inventory_movements.farm_id
    )
  );

drop policy if exists feed_consumption_staff_insert on public.feed_consumption;
create policy feed_consumption_staff_insert on public.feed_consumption
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(feed_consumption.farm_id)
    and exists (
      select 1 from public.batches b
      where b.id = feed_consumption.batch_id and b.farm_id = feed_consumption.farm_id
    )
    and exists (
      select 1 from public.feed_products p
      where p.id = feed_consumption.product_id and p.farm_id = feed_consumption.farm_id
    )
  );

drop policy if exists weight_records_staff_insert on public.weight_records;
create policy weight_records_staff_insert on public.weight_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(weight_records.farm_id)
    and exists (
      select 1 from public.batches b where b.id = weight_records.batch_id and b.farm_id = weight_records.farm_id
    )
  );

drop policy if exists health_records_staff_insert on public.health_records;
create policy health_records_staff_insert on public.health_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(health_records.farm_id)
    and exists (
      select 1 from public.batches b where b.id = health_records.batch_id and b.farm_id = health_records.farm_id
    )
    and (
      health_records.expense_id is null
      or exists (
        select 1 from public.expenses e where e.id = health_records.expense_id and e.farm_id = health_records.farm_id
      )
    )
  );

drop policy if exists customers_staff_insert on public.customers;
create policy customers_staff_insert on public.customers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_write_farm(customers.farm_id));

drop policy if exists suppliers_staff_insert on public.suppliers;
create policy suppliers_staff_insert on public.suppliers
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_write_farm(suppliers.farm_id));

drop policy if exists sale_payments_staff_insert on public.sale_payments;
create policy sale_payments_staff_insert on public.sale_payments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_write_farm(sale_payments.farm_id)
    and exists (
      select 1 from public.sales s where s.id = sale_payments.sale_id and s.farm_id = sale_payments.farm_id
    )
  );

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
security definer
set search_path = public
as $
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
    and fp.is_active
  for update;
  if not found then
    raise exception 'Feed product not found or inactive';
  end if;

  -- Recheck after acquiring the product lock to make retries idempotent under concurrency.
  if exists (
    select 1 from public.feed_consumption fc
    where fc.id = p_id and fc.user_id = (select auth.uid())
  ) then
    return p_id;
  end if;

  if not exists (
    select 1 from public.batches b
    where b.id = p_batch_id
      and b.farm_id = p_farm_id
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

revoke all on function public.record_feed_consumption(uuid, uuid, uuid, uuid, date, numeric, numeric, text)
  from public, anon;
grant execute on function public.record_feed_consumption(uuid, uuid, uuid, uuid, date, numeric, numeric, text)
  to authenticated;

comment on function public.record_feed_consumption(uuid, uuid, uuid, uuid, date, numeric, numeric, text) is
  'Idempotently records actual feed consumption after locking the product and checking stock.';

-- Explicit least-privilege table grants for the authenticated app.
grant select on public.population_movements to authenticated;
grant select, insert, update on public.feed_products to authenticated;
grant select on public.feed_inventory_movements to authenticated;
grant select on public.feed_consumption to authenticated;

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
security definer
set search_path = public
as $
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
  for update;
  if not found then
    raise exception 'Batch does not belong to this farm';
  end if;

  -- Recheck after the batch lock so concurrent retries with the same ID are idempotent.
  if exists (
    select 1 from public.population_movements pm
    where pm.id = p_id and pm.user_id = (select auth.uid())
  ) then
    return p_id;
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

revoke all on function public.record_population_movement(uuid, uuid, uuid, date, text, integer, text)
  from public, anon;
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

-- Safe stock-out corrections share the same per-product lock as feed consumption.
create or replace function public.record_feed_stock_out(
  p_id uuid,
  p_farm_id uuid,
  p_product_id uuid,
  p_movement_date date,
  p_movement_type text,
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
  if p_movement_type not in ('adjustment_out', 'waste') then
    raise exception 'Stock-out movement type is invalid';
  end if;
  if p_quantity_units is null or p_quantity_units <= 0
     or p_kg_per_unit_snapshot is null or p_kg_per_unit_snapshot <= 0 then
    raise exception 'Quantity and kilograms per unit must be greater than zero';
  end if;

  perform 1 from public.feed_products fp
  where fp.id = p_product_id
    and fp.farm_id = p_farm_id
    and fp.is_active
  for update;
  if not found then
    raise exception 'Feed product not found or inactive';
  end if;

  if exists (
    select 1 from public.feed_inventory_movements im
    where im.id = p_id and im.user_id = (select auth.uid())
  ) then
    return p_id;
  end if;

  select coalesce(sum(
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

  insert into public.feed_inventory_movements (
    id, farm_id, product_id, user_id, movement_date, movement_type,
    quantity_units, kg_per_unit_snapshot, unit_cost, notes
  ) values (
    p_id, p_farm_id, p_product_id, (select auth.uid()),
    coalesce(p_movement_date, current_date), p_movement_type,
    p_quantity_units, p_kg_per_unit_snapshot, 0, coalesce(p_notes, '')
  );

  return p_id;
end;
$$;

grant execute on function public.record_feed_stock_out(uuid, uuid, uuid, date, text, numeric, numeric, text)
  to authenticated;

comment on function public.record_feed_stock_out(uuid, uuid, uuid, date, text, numeric, numeric, text) is
  'Records stock reductions or feed waste only when sufficient product stock remains, with per-product locking.';


-- Prevent bypassing stock/population validation with direct Data API inserts.
revoke insert, update, delete on public.population_movements from anon, authenticated;
revoke insert, update, delete on public.feed_inventory_movements from anon, authenticated;
revoke insert, update, delete on public.feed_consumption from anon, authenticated;
create or replace function public.record_sale_payment(
  p_id uuid,
  p_farm_id uuid,
  p_sale_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference text default '',
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_gross numeric := 0;
  v_paid numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'e_wallet', 'check', 'other') then
    raise exception 'Unsupported payment method';
  end if;

  select s.gross
    into v_sale_gross
  from public.sales s
  where s.id = p_sale_id
    and s.farm_id = p_farm_id
  for update;
  if not found then
    raise exception 'Sale does not belong to this farm';
  end if;

  if exists (
    select 1 from public.sale_payments p
    where p.id = p_id and p.user_id = (select auth.uid())
  ) then
    return p_id;
  end if;

  select coalesce(sum(p.amount), 0)
    into v_paid
  from public.sale_payments p
  where p.sale_id = p_sale_id and p.farm_id = p_farm_id;

  if v_paid + p_amount > v_sale_gross + 0.000001 then
    raise exception 'Payment exceeds the outstanding balance (% remaining)',
      round(greatest(v_sale_gross - v_paid, 0), 2);
  end if;

  insert into public.sale_payments (
    id, farm_id, sale_id, user_id, payment_date, amount,
    payment_method, reference, notes
  ) values (
    p_id, p_farm_id, p_sale_id, (select auth.uid()),
    coalesce(p_payment_date, current_date), p_amount,
    p_payment_method, coalesce(p_reference, ''), coalesce(p_notes, '')
  );

  return p_id;
end;
$$;

revoke all on function public.record_sale_payment(uuid, uuid, uuid, date, numeric, text, text, text)
  from public, anon;
