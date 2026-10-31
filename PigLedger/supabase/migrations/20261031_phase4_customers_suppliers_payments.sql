-- Phase 4: contacts and sale settlement.
-- Source-controlled migration only; do not apply to production without explicit approval.
-- Sales remain revenue records. Sale payments are separate cash-received events.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, farm_id),
  unique (farm_id, name)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, farm_id),
  unique (farm_id, name)
);

create unique index if not exists sales_id_farm_unique
  on public.sales(id, farm_id);

alter table public.sales
  add column if not exists customer_id uuid;
alter table public.expenses
  add column if not exists supplier_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_customer_farm_fk'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_customer_farm_fk
      foreign key (customer_id, farm_id)
      references public.customers(id, farm_id)
      on delete set null (customer_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_supplier_farm_fk'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_supplier_farm_fk
      foreign key (supplier_id, farm_id)
      references public.suppliers(id, farm_id)
      on delete set null (supplier_id);
  end if;
end $$;

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  sale_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank_transfer', 'e_wallet', 'check', 'other')),
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint sale_payment_sale_farm_fk
    foreign key (sale_id, farm_id) references public.sales(id, farm_id)
    on delete restrict
);

create index if not exists customers_farm_active_idx
  on public.customers(farm_id, is_active, name);
create index if not exists suppliers_farm_active_idx
  on public.suppliers(farm_id, is_active, name);
create index if not exists sales_customer_date_idx
  on public.sales(customer_id, date desc);
create index if not exists expenses_supplier_date_idx
  on public.expenses(supplier_id, date desc);
create index if not exists sale_payments_sale_date_idx
  on public.sale_payments(sale_id, payment_date desc);
create index if not exists sale_payments_farm_date_idx
  on public.sale_payments(farm_id, payment_date desc);

alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.sale_payments enable row level security;

drop policy if exists customers_select_owner on public.customers;
create policy customers_select_owner on public.customers
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = customers.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists customers_insert_owner on public.customers;
create policy customers_insert_owner on public.customers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = customers.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists customers_update_owner on public.customers;
create policy customers_update_owner on public.customers
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = customers.farm_id and f.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = customers.farm_id and f.user_id = (select auth.uid())
    )
  );

drop policy if exists suppliers_select_owner on public.suppliers;
create policy suppliers_select_owner on public.suppliers
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = suppliers.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists suppliers_insert_owner on public.suppliers;
create policy suppliers_insert_owner on public.suppliers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = suppliers.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists suppliers_update_owner on public.suppliers;
create policy suppliers_update_owner on public.suppliers
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = suppliers.farm_id and f.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = suppliers.farm_id and f.user_id = (select auth.uid())
    )
  );

drop policy if exists sale_payments_select_owner on public.sale_payments;
create policy sale_payments_select_owner on public.sale_payments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = sale_payments.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists sale_payments_insert_owner on public.sale_payments;
create policy sale_payments_insert_owner on public.sale_payments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.sales s
      where s.id = sale_payments.sale_id
        and s.farm_id = sale_payments.farm_id
        and s.user_id = (select auth.uid())
    )
  );

-- Keep existing owner policies while requiring linked customer/supplier IDs
-- to belong to the same farm and authenticated account.
drop policy if exists "own insert expenses" on public.expenses;
create policy "own insert expenses" on public.expenses
  for insert to authenticated
  with check (
    auth.uid() = expenses.user_id and (
      expenses.batch_id is null or exists (
        select 1 from public.batches b where b.id = expenses.batch_id
          and b.farm_id = expenses.farm_id and b.user_id = auth.uid()
      )
    ) and (
      expenses.supplier_id is null or exists (
        select 1 from public.suppliers s where s.id = expenses.supplier_id
          and s.farm_id = expenses.farm_id and s.user_id = auth.uid()
      )
    )
  );
drop policy if exists "own update expenses" on public.expenses;
create policy "own update expenses" on public.expenses
  for update to authenticated
  using (auth.uid() = expenses.user_id)
  with check (
    auth.uid() = expenses.user_id and (
      expenses.batch_id is null or exists (
        select 1 from public.batches b where b.id = expenses.batch_id
          and b.farm_id = expenses.farm_id and b.user_id = auth.uid()
      )
    ) and (
      expenses.supplier_id is null or exists (
        select 1 from public.suppliers s where s.id = expenses.supplier_id
          and s.farm_id = expenses.farm_id and s.user_id = auth.uid()
      )
    )
  );

drop policy if exists "own insert sales" on public.sales;
create policy "own insert sales" on public.sales
  for insert to authenticated
  with check (
    auth.uid() = sales.user_id and (
      sales.batch_id is null or exists (
        select 1 from public.batches b where b.id = sales.batch_id
          and b.farm_id = sales.farm_id and b.user_id = auth.uid()
      )
    ) and (
      sales.customer_id is null or exists (
        select 1 from public.customers c where c.id = sales.customer_id
          and c.farm_id = sales.farm_id and c.user_id = auth.uid()
      )
    )
  );
drop policy if exists "own update sales" on public.sales;
create policy "own update sales" on public.sales
  for update to authenticated
  using (auth.uid() = sales.user_id)
  with check (
    auth.uid() = sales.user_id and (
      sales.batch_id is null or exists (
        select 1 from public.batches b where b.id = sales.batch_id
          and b.farm_id = sales.farm_id and b.user_id = auth.uid()
      )
    ) and (
      sales.customer_id is null or exists (
        select 1 from public.customers c where c.id = sales.customer_id
          and c.farm_id = sales.farm_id and c.user_id = auth.uid()
      )
    )
  );

grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select on public.sale_payments to authenticated;
revoke insert, update, delete on public.sale_payments from anon, authenticated;

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
    and s.user_id = (select auth.uid())
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
grant execute on function public.record_sale_payment(uuid, uuid, uuid, date, numeric, text, text, text)
  to authenticated;

create or replace function public.validate_sale_gross_against_payments()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_paid numeric := 0;
begin
  if new.gross is null or new.gross < 0 then
    raise exception 'Sale revenue cannot be negative';
  end if;

  select coalesce(sum(p.amount), 0)
    into v_paid
  from public.sale_payments p
  where p.sale_id = new.id and p.farm_id = new.farm_id;

  if v_paid > new.gross + 0.000001 then
    raise exception 'Sale revenue cannot be reduced below payments already received (% paid)',
      round(v_paid, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists validate_sale_gross_against_payments on public.sales;
create trigger validate_sale_gross_against_payments
  before update of gross on public.sales
  for each row execute function public.validate_sale_gross_against_payments();

comment on table public.sale_payments is
  'Append-only customer receipts; multiple partial payments may settle one sale without changing gross revenue.';

-- Payments must be recorded through record_sale_payment so outstanding balances
-- are checked while the parent sale is locked. Do not allow direct table inserts.
