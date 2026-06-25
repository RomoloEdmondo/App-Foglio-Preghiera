create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
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

create index if not exists prayer_months_year_month_idx
  on public.prayer_months (year, month);

drop trigger if exists set_prayer_months_updated_at on public.prayer_months;

create trigger set_prayer_months_updated_at
before update on public.prayer_months
for each row
execute function public.set_updated_at();

alter table public.prayer_months enable row level security;

drop policy if exists "Gli utenti autenticati leggono i mesi" on public.prayer_months;
create policy "Gli utenti autenticati leggono i mesi"
on public.prayer_months
for select
to authenticated
using (true);

drop policy if exists "Gli utenti autenticati gestiscono i mesi" on public.prayer_months;
create policy "Gli utenti autenticati gestiscono i mesi"
on public.prayer_months
for all
to authenticated
using (true)
with check (true);
