begin;
alter function public.record_export(text,text,integer,integer) set schema maintenance_private;
grant usage on schema maintenance_private to authenticated;
create function public.record_export(p_action text,p_language text,p_year integer,p_month integer) returns void language sql security invoker set search_path='' as $$ select maintenance_private.record_export(p_action,p_language,p_year,p_month); $$;
revoke all on function public.record_export(text,text,integer,integer) from public,anon;
grant execute on function public.record_export(text,text,integer,integer) to authenticated;
commit;
