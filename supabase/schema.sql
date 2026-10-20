-- Install once in Supabase SQL Editor in a NEW project.
-- Every table exposed to the browser is protected by RLS.
begin;
create schema if not exists cc_private;
revoke all on schema cc_private from public;
grant usage on schema cc_private to authenticated;
create table public.cc_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('viewer','editor','admin')),
  created_at timestamptz not null default now()
);
alter table public.cc_access enable row level security;
revoke all on public.cc_access from anon,authenticated;
grant select on public.cc_access to authenticated;
create policy own_access on public.cc_access for select to authenticated using(user_id=(select auth.uid()));
-- Only the SQL Editor / trusted backend can grant or change access roles.
create function cc_private.current_role() returns text language sql stable security definer
set search_path='' as $$ select role from public.cc_access where user_id=(select auth.uid()) $$;
revoke all on function cc_private.current_role() from public;
grant execute on function cc_private.current_role() to authenticated;

create table public.cc_members (
 id text primary key check(length(id) between 1 and 100),
 data jsonb not null check(jsonb_typeof(data)='object'),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table public.cc_plans (
 id text primary key check(length(id) between 1 and 100),
 data jsonb not null check(jsonb_typeof(data)='object'),
 owner_id text generated always as (nullif(data->>'ownerId','')) stored references public.cc_members(id),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table public.cc_entries (
 id text primary key check(length(id) between 1 and 100),
 data jsonb not null check(jsonb_typeof(data)='object'),
 member_id text generated always as (data->>'memberId') stored not null references public.cc_members(id) on delete cascade,
 plan_id text generated always as (nullif(data->>'planId','')) stored references public.cc_plans(id),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create index on public.cc_entries(member_id);
create index on public.cc_entries(plan_id);
create index on public.cc_plans(owner_id);
create table public.cc_config (
 id text primary key check(id='main'),
 data jsonb not null check(jsonb_typeof(data)='object'),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create function cc_private.validate_record() returns trigger language plpgsql set search_path='' as $$
declare d jsonb:=new.data; n int;
begin
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>40000 then raise exception 'CC_INVALID: object too large'; end if;
 -- Disallow internal/client-only fields in stored payload.
 new.data:=d-'id'-'_rev';
 if tg_table_name='cc_members' then
  if coalesce(length(trim(d->>'name')),0) not between 1 and 150
   or length(coalesce(d->>'role',''))>300 then raise exception 'CC_INVALID: member';end if;
 elsif tg_table_name='cc_entries' then
  if coalesce(d->>'type','') not in ('office','dev','field','event','meeting','leave')
   or coalesce(d->>'period','full') not in ('full','am','pm')
   or coalesce(d->>'status','plan') not in ('plan','doing','done')
   or coalesce(d->>'start','') !~ '^\d{4}-\d{2}-\d{2}$'
   or coalesce(d->>'end','') !~ '^\d{4}-\d{2}-\d{2}$'
   then raise exception 'CC_INVALID: entry';end if;
  if (d->>'end')::date < (d->>'start')::date
   or (d->>'end')::date-(d->>'start')::date>3660 then raise exception 'CC_INVALID: dates';end if;
  if coalesce((d->>'level')::int,2) not between 1 and 4 then raise exception 'CC_INVALID: level';end if;
 elsif tg_table_name='cc_plans' then
  if coalesce(length(trim(d->>'title')),0) not between 1 and 1000
   or coalesce((d->>'fy')::int,0) not between 2500 and 2800
   or coalesce((d->>'startM')::int,-1) not between 0 and 11
   or coalesce((d->>'endM')::int,-1) not between 0 and 11
   or (d->>'endM')::int < (d->>'startM')::int
   or coalesce((d->>'progress')::int,0) not between 0 and 100
   or coalesce((d->>'level')::int,2) not between 1 and 4
   or coalesce(d->>'status','plan') not in ('plan','doing','done') then raise exception 'CC_INVALID: plan';end if;
 elsif tg_table_name='cc_config' then
  if coalesce((d->>'minInOffice')::int,-1) not between 0 and 20 then raise exception 'CC_INVALID: config';end if;
  if d ? 'levels' then
   if jsonb_typeof(d->'levels')<>'array' or jsonb_array_length(d->'levels')<>4 then raise exception 'CC_INVALID: levels';end if;
   for n in 0..3 loop
    if coalesce((d->'levels'->>n)::int,-1) not between 1 and 100 then raise exception 'CC_INVALID: weight';end if;
    if n>0 and (d->'levels'->>n)::int < (d->'levels'->>(n-1))::int then raise exception 'CC_INVALID: weight order';end if;
   end loop;
  end if;
 end if;
 new.revision:=case when tg_op='UPDATE' then old.revision+1 else 1 end;
 new.updated_at:=now();return new;
end $$;
-- Policies apply both to RPCs and direct REST calls.
do $$ declare t text;begin
 foreach t in array array['cc_members','cc_plans','cc_entries','cc_config'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy approved_read on public.%I for select to authenticated using ((select cc_private.current_role()) is not null)',t);
  execute format('create policy editor_insert on public.%I for insert to authenticated with check ((select cc_private.current_role()) in (''editor'',''admin''))',t);
  execute format('create policy editor_update on public.%I for update to authenticated using ((select cc_private.current_role()) in (''editor'',''admin'')) with check ((select cc_private.current_role()) in (''editor'',''admin''))',t);
  execute format('create policy editor_delete on public.%I for delete to authenticated using ((select cc_private.current_role()) in (''editor'',''admin''))',t);
  execute format('create trigger validate_record before insert or update on public.%I for each row execute function cc_private.validate_record()',t);
 end loop;
end $$;
insert into public.cc_config(id,data) values('main','{"minInOffice":1}'::jsonb);

create function public.cc_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'role',cc_private.current_role(),
  'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data,'revision',revision) order by id) from public.cc_members),'[]'::jsonb),
  'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data,'revision',revision) order by id) from public.cc_entries),'[]'::jsonb),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data,'revision',revision) order by id) from public.cc_plans),'[]'::jsonb),
  'config',coalesce((select jsonb_agg(jsonb_build_object('id',id,'data',data,'revision',revision)) from public.cc_config),'[]'::jsonb))
$$;
-- Compare-and-swap within a transaction. Any conflict rolls the entire batch back.
create function public.cc_apply(changes jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c jsonb;t text;k text;expected bigint;current_revision bigint;
begin
 if cc_private.current_role() is null or cc_private.current_role() not in ('editor','admin') then raise exception 'CC_FORBIDDEN';end if;
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) not between 1 and 200 then raise exception 'CC_INVALID: batch';end if;
 for c in select value from jsonb_array_elements(changes) loop
  if coalesce(c->>'collection','') not in ('members','entries','plans','config') then raise exception 'CC_INVALID: collection';end if;
  t:='cc_'||(c->>'collection');k:=c->>'id';expected:=(c->>'revision')::bigint;
  -- Serialize writes to the same ID, including competing inserts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t||':'||k,0));
  current_revision:=null;
  execute format('select revision from public.%I where id=$1 for update',t) into current_revision using k;
  if current_revision is distinct from expected then raise exception 'CC_CONFLICT';end if;
  if coalesce((c->>'remove')::boolean,false) then
   if expected is null then raise exception 'CC_CONFLICT';end if;
   if t='cc_plans' then
    update public.cc_entries set data=data-'planId' where plan_id=k;
   elsif t='cc_members' then
    update public.cc_plans set data=data-'ownerId' where owner_id=k;
   end if;
   execute format('delete from public.%I where id=$1',t) using k;
  elsif expected is null then
   execute format('insert into public.%I(id,data) values($1,$2)',t) using k,c->'data';
  else
   execute format('update public.%I set data=$2 where id=$1',t) using k,c->'data';
  end if;
 end loop;
end $$;
revoke all on function public.cc_snapshot(), public.cc_apply(jsonb) from public,anon;
grant execute on function public.cc_snapshot(), public.cc_apply(jsonb) to authenticated;
commit;
