-- Public connectivity probe: no access to application tables or user data.
create or replace function public.app_healthcheck()
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$ select true; $$;

revoke all on function public.app_healthcheck() from public;
grant execute on function public.app_healthcheck() to anon, authenticated;
