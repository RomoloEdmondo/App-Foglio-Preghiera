-- Run as the database administrator. Safe to rerun; monthly contents are preserved.
begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.prayer_months (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 1900 and 2200),
  month integer not null check (month between 1 and 12),
  days jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month)
);

create table if not exists public.prayer_months_de (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 1900 and 2200),
  month integer not null check (month between 1 and 12),
  days jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month)
);

-- Bootstrap existing accounts into IT only on the first installation.
-- Later reruns never re-grant memberships deliberately removed by an admin.
do $$
begin
  if to_regclass('public.prayer_group_members') is null then
    create table public.prayer_group_members (
      user_id uuid not null references auth.users(id) on delete cascade,
      language text not null check (language in ('it', 'de')),
      created_at timestamptz not null default now(),
      primary key (user_id, language)
    );
    insert into public.prayer_group_members (user_id, language)
    select id, 'it' from auth.users;
  end if;
end;
$$;

alter table public.prayer_months enable row level security;
alter table public.prayer_months_de enable row level security;
alter table public.prayer_group_members enable row level security;

revoke all on public.prayer_months, public.prayer_months_de, public.prayer_group_members from public, anon, authenticated;
grant select, insert, update, delete on public.prayer_months, public.prayer_months_de to authenticated;
grant select on public.prayer_group_members to authenticated;
grant all on public.prayer_months, public.prayer_months_de, public.prayer_group_members to service_role;

drop policy if exists "Members read own groups" on public.prayer_group_members;
create policy "Members read own groups" on public.prayer_group_members
for select to authenticated using (user_id = (select auth.uid()));

-- Remove the previous unrestricted policies before installing group permissions.
drop policy if exists "Gli utenti autenticati leggono i mesi" on public.prayer_months;
drop policy if exists "Gli utenti autenticati gestiscono i mesi" on public.prayer_months;
drop policy if exists "Italian group manages months" on public.prayer_months;
create policy "Italian group manages months" on public.prayer_months
for all to authenticated
using ((select exists (select 1 from public.prayer_group_members where user_id = (select auth.uid()) and language = 'it')))
with check ((select exists (select 1 from public.prayer_group_members where user_id = (select auth.uid()) and language = 'it')));

drop policy if exists "German group manages months" on public.prayer_months_de;
create policy "German group manages months" on public.prayer_months_de
for all to authenticated
using ((select exists (select 1 from public.prayer_group_members where user_id = (select auth.uid()) and language = 'de')))
with check ((select exists (select 1 from public.prayer_group_members where user_id = (select auth.uid()) and language = 'de')));

drop trigger if exists set_prayer_months_updated_at on public.prayer_months;
create trigger set_prayer_months_updated_at before update on public.prayer_months
for each row execute function public.set_updated_at();
drop trigger if exists set_prayer_months_de_updated_at on public.prayer_months_de;
create trigger set_prayer_months_de_updated_at before update on public.prayer_months_de
for each row execute function public.set_updated_at();

commit;
