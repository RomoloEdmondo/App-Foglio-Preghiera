begin;
create table public.app_activity(id bigint generated always as identity primary key, actor_id uuid, actor_email text, action text not null, language text, year integer, month integer, target_email text, created_at timestamptz not null default now());
alter table public.app_activity enable row level security;
revoke all on public.app_activity from public,anon,authenticated;
grant select,insert on public.app_activity to service_role;
grant usage,select on sequence public.app_activity_id_seq to service_role;
create index app_activity_recent on public.app_activity(created_at desc);
create schema if not exists maintenance_private;
revoke all on schema maintenance_private from public,anon,authenticated;
create function maintenance_private.record_month_save() returns trigger language plpgsql security definer set search_path='' as $$
begin
if TG_OP='UPDATE' and new.days is not distinct from old.days then return new; end if;
insert into public.app_activity(actor_id,actor_email,action,language,year,month)
select auth.uid(),(select email from auth.users where id=auth.uid()),'save',case when TG_TABLE_NAME='prayer_months' then 'it' else 'de' end,new.year,new.month;
return new;
end $$;
revoke all on function maintenance_private.record_month_save() from public,anon,authenticated;
create trigger record_activity after insert or update on public.prayer_months for each row execute function maintenance_private.record_month_save();
create trigger record_activity after insert or update on public.prayer_months_de for each row execute function maintenance_private.record_month_save();
create function public.record_export(p_action text,p_language text,p_year integer,p_month integer) returns void language plpgsql security definer set search_path='' as $$
begin
if auth.uid() is null or not exists(select 1 from public.prayer_group_members where user_id=auth.uid() and language=p_language) then raise exception 'Forbidden' using errcode='42501'; end if;
if p_action not in ('pdf','word','image_preview','image_download','share') or p_action is null or p_year not between 1900 and 2200 or p_month not between 1 and 12 or p_year is null or p_month is null then raise exception 'Invalid event'; end if;
insert into public.app_activity(actor_id,actor_email,action,language,year,month) select auth.uid(),email,p_action,p_language,p_year,p_month from auth.users where id=auth.uid();
end $$;
revoke all on function public.record_export(text,text,integer,integer) from public,anon;
grant execute on function public.record_export(text,text,integer,integer) to authenticated;
commit;
