-- Mileage Logger multi-device synchronization schema
-- Run in the Supabase SQL editor for the private Mileage Logger project.
-- The browser app must use only the public/publishable (anon) key. Never expose a service-role/secret key.

create table if not exists public.mileage_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  payload jsonb,
  modified_at timestamptz not null default now(),
  device_id text not null default '',
  tombstone boolean not null default false,
  primary key (user_id, record_type, record_id)
);

create index if not exists mileage_sync_records_modified_idx
  on public.mileage_sync_records (user_id, modified_at);

create table if not exists public.mileage_sync_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_label text not null default '',
  platform text not null default '',
  last_seen_at timestamptz not null default now(),
  last_sync_at timestamptz,
  primary key (user_id, device_id)
);

create or replace function public.mileage_sync_touch_modified_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.modified_at = now();
  return new;
end;
$$;

drop trigger if exists mileage_sync_records_touch on public.mileage_sync_records;
create trigger mileage_sync_records_touch
before insert or update on public.mileage_sync_records
for each row execute function public.mileage_sync_touch_modified_at();

alter table public.mileage_sync_records enable row level security;
alter table public.mileage_sync_devices enable row level security;

-- Each signed-in user can see and change only their own synchronized records.
drop policy if exists "Mileage records select own" on public.mileage_sync_records;
create policy "Mileage records select own"
on public.mileage_sync_records for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Mileage records insert own" on public.mileage_sync_records;
create policy "Mileage records insert own"
on public.mileage_sync_records for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Mileage records update own" on public.mileage_sync_records;
create policy "Mileage records update own"
on public.mileage_sync_records for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Mileage records delete own" on public.mileage_sync_records;
create policy "Mileage records delete own"
on public.mileage_sync_records for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Mileage devices select own" on public.mileage_sync_devices;
create policy "Mileage devices select own"
on public.mileage_sync_devices for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Mileage devices insert own" on public.mileage_sync_devices;
create policy "Mileage devices insert own"
on public.mileage_sync_devices for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Mileage devices update own" on public.mileage_sync_devices;
create policy "Mileage devices update own"
on public.mileage_sync_devices for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.mileage_sync_records to authenticated;
grant select, insert, update on public.mileage_sync_devices to authenticated;

-- Phase 2 will add private photo/document object storage after structured-data sync is validated.
