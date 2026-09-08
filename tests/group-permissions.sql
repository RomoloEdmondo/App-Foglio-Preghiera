-- Execute as the database administrator. All fixtures and permission changes roll back.
begin;
-- Requires two bilingual accounts and one Italian-only account.
select set_config('test.bilingual', (select user_id::text from public.prayer_group_members group by user_id having count(*)=2 order by user_id limit 1), true);
select set_config('test.second_bilingual', (select user_id::text from public.prayer_group_members where user_id::text <> current_setting('test.bilingual') group by user_id having count(*)=2 limit 1), true);
select set_config('test.italian_only', (select user_id::text from public.prayer_group_members group by user_id having array_agg(language)=array['it'] limit 1), true);
insert into public.prayer_months (year, month, days) values (2199, 12, '{"1":{"subject":"IT permission test"}}');
insert into public.prayer_months_de (year, month, days) values (2199, 12, '{"1":{"subject":"DE permission test"}}');

do $$ begin
  if has_table_privilege('anon', 'public.prayer_months', 'SELECT') or
     has_table_privilege('anon', 'public.prayer_months_de', 'SELECT') or
     has_table_privilege('authenticated', 'public.prayer_group_members', 'INSERT') then
    raise exception 'Unexpected public access or membership escalation';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.bilingual'), true);
do $$ begin
  if (select count(*) from public.prayer_months where year=2199 and month=12) <> 1 or
     (select count(*) from public.prayer_months_de where year=2199 and month=12) <> 1 then
    raise exception 'Bilingual account cannot read both groups';
  end if;
  insert into public.prayer_months_de (year, month, days) values (2199, 12, '{"1":{"subject":"updated"}}')
  on conflict (year, month) do update set days=excluded.days;
  if (select days->'1'->>'subject' from public.prayer_months_de where year=2199 and month=12) <> 'updated' then
    raise exception 'Authorized upsert failed';
  end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.italian_only'), true);
do $$ declare affected integer; begin
  if (select count(*) from public.prayer_months where year=2199 and month=12) <> 1 or
     (select count(*) from public.prayer_months_de) <> 0 then
    raise exception 'Italian-only read isolation failed';
  end if;
  update public.prayer_months_de set days='{}' where year=2199 and month=12;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-group update succeeded'; end if;
  delete from public.prayer_months_de where year=2199 and month=12;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-group delete succeeded'; end if;
  begin
    insert into public.prayer_months_de (year, month) values (2199, 11);
    raise exception 'Cross-group insert succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.prayer_group_members (user_id, language) values ((select auth.uid()), 'de');
    raise exception 'Membership escalation succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
-- Simulate a DE-only account inside this transaction without altering real access.
delete from public.prayer_group_members where user_id::text=current_setting('test.second_bilingual') and language='it';
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.second_bilingual'), true);
do $$ begin
  if (select count(*) from public.prayer_months) <> 0 or
     (select count(*) from public.prayer_months_de where year=2199 and month=12) <> 1 then
    raise exception 'German-only read isolation failed';
  end if;
  begin
    insert into public.prayer_months (year, month) values (2199, 11);
    raise exception 'German account wrote to Italian table';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.prayer_group_members where user_id <> (select auth.uid())) <> 0 then
    raise exception 'Another account membership is visible';
  end if;
end $$;
rollback;
