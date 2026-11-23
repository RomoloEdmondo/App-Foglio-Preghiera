-- Maintenance API: only the server-side service role can call these functions.
-- End-user authorization is verified by maintenance-admin before every request.
begin;
create table public.maintenance_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  language text not null check (language in ('it', 'de')),
  enabled boolean not null,
  created_at timestamptz not null default now()
);
alter table public.maintenance_audit enable row level security;
revoke all on public.maintenance_audit from public, anon, authenticated;
grant select, insert on public.maintenance_audit to service_role;
grant usage, select on sequence public.maintenance_audit_id_seq to service_role;

create function public.maintenance_snapshot() returns jsonb
language sql security invoker set search_path = '' as $$
select jsonb_build_object(
  'checkedAt', now(),
  'databaseBytes', pg_database_size(current_database()),
  'postgresVersion', current_setting('server_version'),
  'tables', (select jsonb_agg(jsonb_build_object(
    'name', c.relname, 'bytes', pg_total_relation_size(c.oid), 'rls', c.relrowsecurity,
    'policies', (select count(*) from pg_catalog.pg_policy p where p.polrelid=c.oid)
  ) order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r'),
  'months', jsonb_build_array(
    jsonb_build_object('language','it','count',(select count(*) from public.prayer_months), 'lastUpdated',(select max(updated_at) from public.prayer_months)),
    jsonb_build_object('language','de','count',(select count(*) from public.prayer_months_de), 'lastUpdated',(select max(updated_at) from public.prayer_months_de))
  ),
  'storage', (select jsonb_build_object('objects',count(*),'bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::numeric else 0 end),0)) from storage.objects),
  'buckets', (select coalesce(jsonb_agg(jsonb_build_object('name',name,'public',public)), '[]'::jsonb) from storage.buckets)
);
$$;
revoke all on function public.maintenance_snapshot() from public, anon, authenticated;
grant execute on function public.maintenance_snapshot() to service_role;

create function public.maintenance_set_membership(p_actor uuid, p_target uuid, p_language text, p_enabled boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_actor <> 'dbe3d8e8-3e14-4010-b227-a8dad5e7c1a3'::uuid or p_actor is null then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_target = p_actor then raise exception 'Owner memberships are protected'; end if;
  if p_language not in ('it','de') or p_language is null or p_enabled is null then raise exception 'Invalid membership'; end if;
  if p_enabled then
    insert into public.prayer_group_members(user_id,language) values(p_target,p_language) on conflict do nothing;
  else
    delete from public.prayer_group_members where user_id=p_target and language=p_language;
  end if;
  insert into public.maintenance_audit(actor_id,target_id,language,enabled) values(p_actor,p_target,p_language,p_enabled);
end;
$$;
revoke all on function public.maintenance_set_membership(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.maintenance_set_membership(uuid,uuid,text,boolean) to service_role;
commit;
