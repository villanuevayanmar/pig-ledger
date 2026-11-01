-- Phase 3: animal monitoring.
-- Source-controlled migration only. Do not apply to production without explicit approval.
-- Weight records capture a batch's represented head count and average body weight.
-- FCR is only reported when the interval has no population/sales changes and matching counts.

create table if not exists public.weight_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  batch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null default current_date,
  head_count integer not null check (head_count > 0),
  average_weight_kg numeric not null check (average_weight_kg > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint weight_record_batch_farm_fk
    foreign key (batch_id, farm_id) references public.batches(id, farm_id)
    on delete restrict
);

create table if not exists public.health_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  batch_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null default current_date,
  record_type text not null check (
    record_type in ('observation', 'illness', 'treatment', 'vaccination', 'deworming', 'medication', 'recovery')
  ),
  title text not null,
  symptoms text not null default '',
  medicine text not null default '',
  dosage text not null default '',
  treated_heads integer not null default 0 check (treated_heads >= 0),
  cost numeric not null default 0 check (cost >= 0),
  expense_id uuid references public.expenses(id) on delete set null,
  next_due_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint health_record_batch_farm_fk
    foreign key (batch_id, farm_id) references public.batches(id, farm_id)
    on delete restrict
);

create index if not exists weight_records_batch_date_idx
  on public.weight_records(batch_id, measured_on desc);
create index if not exists weight_records_farm_date_idx
  on public.weight_records(farm_id, measured_on desc);
create index if not exists health_records_batch_date_idx
  on public.health_records(batch_id, record_date desc);
create index if not exists health_records_due_idx
  on public.health_records(farm_id, next_due_date)
  where next_due_date is not null;

alter table public.weight_records enable row level security;
alter table public.health_records enable row level security;

drop policy if exists weight_records_select_owner on public.weight_records;
create policy weight_records_select_owner on public.weight_records
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = weight_records.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists weight_records_insert_owner on public.weight_records;
create policy weight_records_insert_owner on public.weight_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.batches b
      where b.id = weight_records.batch_id
        and b.farm_id = weight_records.farm_id
        and b.user_id = (select auth.uid())
    )
  );

drop policy if exists health_records_select_owner on public.health_records;
create policy health_records_select_owner on public.health_records
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.farms f
      where f.id = health_records.farm_id and f.user_id = (select auth.uid())
    )
  );
drop policy if exists health_records_insert_owner on public.health_records;
create policy health_records_insert_owner on public.health_records
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.batches b
      where b.id = health_records.batch_id
        and b.farm_id = health_records.farm_id
        and b.user_id = (select auth.uid())
    )
    and (
      health_records.expense_id is null
      or exists (
        select 1 from public.expenses e
        where e.id = health_records.expense_id
          and e.farm_id = health_records.farm_id
          and e.user_id = (select auth.uid())
      )
    )
  );

grant select, insert on public.weight_records to authenticated;
grant select, insert on public.health_records to authenticated;

comment on table public.weight_records is
  'Append-only batch weight observations; head_count represents the total batch population at measurement time.';
comment on table public.health_records is
  'Append-only health, medication and vaccination history with optional expense linkage and next-due reminders.';
