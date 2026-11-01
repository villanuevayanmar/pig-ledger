-- Phase 4 extension: multi-farm memberships and role-based access.
-- Source-controlled only. Do not apply to production without explicit approval.
-- Existing farm owners are backfilled as owner members. Existing row user_id values
-- remain as creator/audit identity; authorization moves to farm membership.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.farm_memberships (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (farm_id, user_id),
  unique (id, farm_id)
);

create table if not exists public.farm_invitations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  invite_email text not null,
  role text not null check (role in ('manager', 'staff', 'viewer')),
  invite_code uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint farm_invitation_email_nonempty check (length(trim(invite_email)) > 3)
);

create index if not exists farm_memberships_user_idx
  on public.farm_memberships(user_id, farm_id);
create index if not exists farm_memberships_farm_role_idx
  on public.farm_memberships(farm_id, role);
create index if not exists farm_invitations_farm_pending_idx
  on public.farm_invitations(farm_id, expires_at)
  where accepted_at is null;

insert into public.farm_memberships (farm_id, user_id, role, invited_by)
select f.id, f.user_id, 'owner', f.user_id
from public.farms f
where f.user_id is not null
on conflict (farm_id, user_id) do nothing;

create or replace function private.has_farm_role(p_farm_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.farm_memberships fm
    where fm.farm_id = p_farm_id
      and fm.user_id = (select auth.uid())
      and fm.role = any(p_roles)
  );
$$;

create or replace function private.can_view_farm(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_farm_role(p_farm_id, array['owner', 'manager', 'staff', 'viewer']);
$$;

create or replace function private.can_write_farm(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_farm_role(p_farm_id, array['owner', 'manager', 'staff']);
$$;

create or replace function private.can_manage_farm(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_farm_role(p_farm_id, array['owner', 'manager']);
$$;

create or replace function private.is_farm_owner(p_farm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_farm_role(p_farm_id, array['owner']);
$$;

revoke all on function private.has_farm_role(uuid, text[]) from public, anon;
revoke all on function private.can_view_farm(uuid) from public, anon;
revoke all on function private.can_write_farm(uuid) from public, anon;
revoke all on function private.can_manage_farm(uuid) from public, anon;
revoke all on function private.is_farm_owner(uuid) from public, anon;
grant execute on function private.has_farm_role(uuid, text[]) to authenticated;
grant execute on function private.can_view_farm(uuid) to authenticated;
grant execute on function private.can_write_farm(uuid) to authenticated;
grant execute on function private.can_manage_farm(uuid) to authenticated;
grant execute on function private.is_farm_owner(uuid) to authenticated;

create or replace function private.add_farm_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    raise exception 'A farm must have an owner';
  end if;

  insert into public.farm_memberships (farm_id, user_id, role, invited_by)
  values (new.id, new.user_id, 'owner', new.user_id)
  on conflict (farm_id, user_id) do update set role = 'owner';

  return new;
end;
$$;

revoke all on function private.add_farm_owner_membership() from public, anon, authenticated;
drop trigger if exists add_farm_owner_membership on public.farms;
create trigger add_farm_owner_membership
  after insert on public.farms
  for each row execute function private.add_farm_owner_membership();

create or replace function private.prevent_farm_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'The farm owner identity cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_farm_owner_change() from public, anon, authenticated;
drop trigger if exists prevent_farm_owner_change on public.farms;
create trigger prevent_farm_owner_change
  before update of user_id on public.farms
  for each row execute function private.prevent_farm_owner_change();

-- Invitation acceptance is the only member self-join path. The email is read
-- from the authenticated JWT, and the invitation is locked and single-use.
create or replace function private.accept_farm_invitation(p_invite_code uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.farm_invitations%rowtype;
  v_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  v_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  select *
    into v_invitation
  from public.farm_invitations fi
  where fi.invite_code = p_invite_code
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception 'Invitation has already been used';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'Invitation has expired';
  end if;
  if lower(trim(v_invitation.invite_email)) <> v_email then
    raise exception 'Sign in with the email address that received this invitation';
  end if;

  insert into public.farm_memberships (farm_id, user_id, role, invited_by)
  values (v_invitation.farm_id, (select auth.uid()), v_invitation.role, v_invitation.invited_by)
  on conflict (farm_id, user_id) do nothing;

  update public.farm_invitations
  set accepted_at = now(), accepted_by = (select auth.uid())
  where id = v_invitation.id;

  return v_invitation.farm_id;
end;
$$;

revoke all on function private.accept_farm_invitation(uuid) from public, anon;
grant execute on function private.accept_farm_invitation(uuid) to authenticated;

create or replace function private.update_farm_member_role(
  p_farm_id uuid,
  p_member_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_farm_owner(p_farm_id) then
    raise exception 'Only a farm owner can change member roles';
  end if;
  if p_role not in ('manager', 'staff', 'viewer') then
    raise exception 'Invalid member role';
  end if;
  update public.farm_memberships
  set role = p_role
  where farm_id = p_farm_id
    and user_id = p_member_user_id
    and role <> 'owner';
  if not found then
    raise exception 'Member not found or owner role cannot be changed';
  end if;
end;
$$;

create or replace function private.remove_farm_member(
  p_farm_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_farm_owner(p_farm_id) then
    raise exception 'Only a farm owner can remove members';
  end if;
  delete from public.farm_memberships
  where farm_id = p_farm_id
    and user_id = p_member_user_id
    and role <> 'owner';
  if not found then
    raise exception 'Member not found or owner membership cannot be removed';
  end if;
end;
$$;

revoke all on function private.update_farm_member_role(uuid, uuid, text) from public, anon;
revoke all on function private.remove_farm_member(uuid, uuid) from public, anon;
grant execute on function private.update_farm_member_role(uuid, uuid, text) to authenticated;
grant execute on function private.remove_farm_member(uuid, uuid) to authenticated;

alter table public.farm_memberships enable row level security;
alter table public.farm_invitations enable row level security;

drop policy if exists farm_memberships_select on public.farm_memberships;
create policy farm_memberships_select on public.farm_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_manage_farm(farm_memberships.farm_id)
  );

drop policy if exists farm_invitations_select on public.farm_invitations;
create policy farm_invitations_select on public.farm_invitations
  for select to authenticated
  using (
    invited_by = (select auth.uid())
    or private.can_manage_farm(farm_invitations.farm_id)
  );

drop policy if exists farm_invitations_insert on public.farm_invitations;
create policy farm_invitations_insert on public.farm_invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and role in ('manager', 'staff', 'viewer')
    and (
      private.is_farm_owner(farm_invitations.farm_id)
      or (
        role in ('staff', 'viewer')
        and private.has_farm_role(farm_invitations.farm_id, array['manager'])
      )
    )
  );

drop policy if exists farm_invitations_update on public.farm_invitations;
create policy farm_invitations_update on public.farm_invitations
  for update to authenticated
  using (private.can_manage_farm(farm_invitations.farm_id))
  with check (private.can_manage_farm(farm_invitations.farm_id));

grant select on public.farm_memberships to authenticated;
grant select, insert, update on public.farm_invitations to authenticated;

-- Farms: all members can read; managers can update profile; only owner can delete.
drop policy if exists "own select farms" on public.farms;
drop policy if exists "own insert farms" on public.farms;
drop policy if exists "own update farms" on public.farms;
drop policy if exists "own delete farms" on public.farms;
drop policy if exists farms_member_select on public.farms;
create policy farms_member_select on public.farms
  for select to authenticated
  using (private.can_view_farm(farms.id) or farms.user_id is null);

drop policy if exists farms_owner_insert on public.farms;
create policy farms_owner_insert on public.farms
  for insert to authenticated
  with check (farms.user_id = (select auth.uid()));

drop policy if exists farms_manager_update on public.farms;
create policy farms_manager_update on public.farms
  for update to authenticated
  using (private.can_manage_farm(farms.id))
  with check (private.can_manage_farm(farms.id));

drop policy if exists farms_owner_delete on public.farms;
create policy farms_owner_delete on public.farms
  for delete to authenticated
  using (private.is_farm_owner(farms.id));

-- Batches.
drop policy if exists "own select batches" on public.batches;
drop policy if exists "own insert batches" on public.batches;
drop policy if exists "own update batches" on public.batches;
drop policy if exists "own delete batches" on public.batches;
create policy batches_member_select on public.batches
  for select to authenticated
  using (private.can_view_farm(batches.farm_id));
create policy batches_staff_insert on public.batches
  for insert to authenticated
  with check (private.can_write_farm(batches.farm_id));
create policy batches_staff_update on public.batches
  for update to authenticated
  using (private.can_write_farm(batches.farm_id))
  with check (private.can_write_farm(batches.farm_id));
create policy batches_manager_delete on public.batches
  for delete to authenticated
  using (private.can_manage_farm(batches.farm_id));

-- Expenses.
drop policy if exists "own select expenses" on public.expenses;
drop policy if exists "own insert expenses" on public.expenses;
drop policy if exists "own update expenses" on public.expenses;
drop policy if exists "own delete expenses" on public.expenses;
create policy expenses_member_select on public.expenses
  for select to authenticated
  using (private.can_view_farm(expenses.farm_id));
create policy expenses_staff_insert on public.expenses
  for insert to authenticated
  with check (private.can_write_farm(expenses.farm_id));
create policy expenses_staff_update on public.expenses
  for update to authenticated
  using (private.can_write_farm(expenses.farm_id))
  with check (private.can_write_farm(expenses.farm_id));
create policy expenses_staff_delete on public.expenses
  for delete to authenticated
  using (private.can_write_farm(expenses.farm_id));

-- Sales.
drop policy if exists "own select sales" on public.sales;
drop policy if exists "own insert sales" on public.sales;
drop policy if exists "own update sales" on public.sales;
drop policy if exists "own delete sales" on public.sales;
create policy sales_member_select on public.sales
  for select to authenticated
  using (private.can_view_farm(sales.farm_id));
create policy sales_staff_insert on public.sales
  for insert to authenticated
  with check (private.can_write_farm(sales.farm_id));
create policy sales_staff_update on public.sales
  for update to authenticated
  using (private.can_write_farm(sales.farm_id))
  with check (private.can_write_farm(sales.farm_id));
create policy sales_staff_delete on public.sales
  for delete to authenticated
  using (private.can_write_farm(sales.farm_id));

-- Population, feed inventory and consumption ledgers are append-only.
drop policy if exists population_movements_select_owner on public.population_movements;
drop policy if exists population_movements_insert_owner on public.population_movements;
create policy population_movements_member_select on public.population_movements
  for select to authenticated
  using (private.can_view_farm(population_movements.farm_id));
create policy population_movements_staff_insert on public.population_movements
  for insert to authenticated
  with check (
    private.can_write_farm(population_movements.farm_id)
    and exists (
      select 1 from public.batches b
      where b.id = population_movements.batch_id
        and b.farm_id = population_movements.farm_id
    )
  );

drop policy if exists feed_products_owner on public.feed_products;
create policy feed_products_member_select on public.feed_products
  for select to authenticated
  using (private.can_view_farm(feed_products.farm_id));
create policy feed_products_staff_insert on public.feed_products
  for insert to authenticated
  with check (private.can_write_farm(feed_products.farm_id));
create policy feed_products_manager_update on public.feed_products
  for update to authenticated
  using (private.can_manage_farm(feed_products.farm_id))
  with check (private.can_manage_farm(feed_products.farm_id));

drop policy if exists feed_inventory_select_owner on public.feed_inventory_movements;
drop policy if exists feed_inventory_insert_owner on public.feed_inventory_movements;
create policy feed_inventory_member_select on public.feed_inventory_movements
  for select to authenticated
  using (private.can_view_farm(feed_inventory_movements.farm_id));
create policy feed_inventory_staff_insert on public.feed_inventory_movements
  for insert to authenticated
  with check (
    private.can_write_farm(feed_inventory_movements.farm_id)
    and exists (
      select 1 from public.feed_products p
      where p.id = feed_inventory_movements.product_id
        and p.farm_id = feed_inventory_movements.farm_id
    )
  );

drop policy if exists feed_consumption_select_owner on public.feed_consumption;
drop policy if exists feed_consumption_insert_owner on public.feed_consumption;
create policy feed_consumption_member_select on public.feed_consumption
  for select to authenticated
  using (private.can_view_farm(feed_consumption.farm_id));
create policy feed_consumption_staff_insert on public.feed_consumption
  for insert to authenticated
  with check (
    private.can_write_farm(feed_consumption.farm_id)
    and exists (
      select 1 from public.batches b
      where b.id = feed_consumption.batch_id
        and b.farm_id = feed_consumption.farm_id
    )
    and exists (
      select 1 from public.feed_products p
      where p.id = feed_consumption.product_id
        and p.farm_id = feed_consumption.farm_id
    )
  );

-- Weights and health history are append-only.
drop policy if exists weight_records_select_owner on public.weight_records;
drop policy if exists weight_records_insert_owner on public.weight_records;
create policy weight_records_member_select on public.weight_records
  for select to authenticated
  using (private.can_view_farm(weight_records.farm_id));
create policy weight_records_staff_insert on public.weight_records
  for insert to authenticated
  with check (
    private.can_write_farm(weight_records.farm_id)
    and exists (
      select 1 from public.batches b
      where b.id = weight_records.batch_id and b.farm_id = weight_records.farm_id
    )
  );

drop policy if exists health_records_select_owner on public.health_records;
drop policy if exists health_records_insert_owner on public.health_records;
create policy health_records_member_select on public.health_records
  for select to authenticated
  using (private.can_view_farm(health_records.farm_id));
create policy health_records_staff_insert on public.health_records
  for insert to authenticated
  with check (
    private.can_write_farm(health_records.farm_id)
    and exists (
      select 1 from public.batches b
      where b.id = health_records.batch_id and b.farm_id = health_records.farm_id
    )
    and (
      health_records.expense_id is null
      or exists (
        select 1 from public.expenses e
        where e.id = health_records.expense_id
          and e.farm_id = health_records.farm_id
      )
    )
  );

-- Contacts.
drop policy if exists customers_select_owner on public.customers;
drop policy if exists customers_insert_owner on public.customers;
drop policy if exists customers_update_owner on public.customers;
create policy customers_member_select on public.customers
  for select to authenticated
  using (private.can_view_farm(customers.farm_id));
create policy customers_staff_insert on public.customers
  for insert to authenticated
  with check (private.can_write_farm(customers.farm_id));
create policy customers_manager_update on public.customers
  for update to authenticated
  using (private.can_manage_farm(customers.farm_id))
  with check (private.can_manage_farm(customers.farm_id));

drop policy if exists suppliers_select_owner on public.suppliers;
drop policy if exists suppliers_insert_owner on public.suppliers;
drop policy if exists suppliers_update_owner on public.suppliers;
create policy suppliers_member_select on public.suppliers
  for select to authenticated
  using (private.can_view_farm(suppliers.farm_id));
create policy suppliers_staff_insert on public.suppliers
  for insert to authenticated
  with check (private.can_write_farm(suppliers.farm_id));
create policy suppliers_manager_update on public.suppliers
  for update to authenticated
  using (private.can_manage_farm(suppliers.farm_id))
  with check (private.can_manage_farm(suppliers.farm_id));

-- Payment events are append-only and only staff-or-higher can record them.
drop policy if exists sale_payments_select_owner on public.sale_payments;
drop policy if exists sale_payments_insert_owner on public.sale_payments;
create policy sale_payments_member_select on public.sale_payments
  for select to authenticated
  using (private.can_view_farm(sale_payments.farm_id));
create policy sale_payments_staff_insert on public.sale_payments
  for insert to authenticated
  with check (
    private.can_write_farm(sale_payments.farm_id)
    and exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id and s.farm_id = sale_payments.farm_id
    )
  );

comment on table public.farm_memberships is
  'Farm-scoped user roles. Row user_id on business records remains the record creator, not the authorization boundary.';
comment on table public.farm_invitations is
  'Single-use, email-bound invitations to join a farm with a non-owner role.';
