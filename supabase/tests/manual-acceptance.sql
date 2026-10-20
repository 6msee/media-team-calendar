-- Run in Supabase SQL Editor on a TEST project after schema.sql.
-- All fixture users and records are rolled back. A failed assertion raises an error.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000901','cc-test-editor@example.invalid'),
 ('00000000-0000-4000-8000-000000000902','cc-test-viewer@example.invalid'),
 ('00000000-0000-4000-8000-000000000903','cc-test-unapproved@example.invalid');
insert into public.cc_access(user_id,role) values
 ('00000000-0000-4000-8000-000000000901','editor'),
 ('00000000-0000-4000-8000-000000000902','viewer');

set local role anon;
do $$ begin
 begin perform public.cc_snapshot();raise exception 'FAIL: anon RPC access';
 exception when insufficient_privilege then null;end;
 begin perform count(*) from public.cc_members;raise exception 'FAIL: anon table access';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
do $$ begin
 if (public.cc_snapshot()->>'role') is not null then raise exception 'FAIL: unapproved account';end if;
 if jsonb_array_length(public.cc_snapshot()->'members')<>0 then raise exception 'FAIL: unapproved data visible';end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.cc_apply('[
 {"collection":"members","id":"cc-fixture-member","revision":null,"data":{"name":"สมาชิกทดสอบ","color":0,"order":0}},
 {"collection":"entries","id":"cc-fixture-entry","revision":null,"data":{"memberId":"cc-fixture-member","type":"office","start":"2026-10-20","end":"2026-10-20","period":"full","level":2,"status":"plan"}}
]'::jsonb);
do $$ begin
 if not exists(select from public.cc_entries where id='cc-fixture-entry') then raise exception 'FAIL: editor create';end if;
 perform public.cc_apply('[{"collection":"members","id":"cc-fixture-member","revision":1,"data":{"name":"แก้ไขแล้ว"}}]');
 begin
  perform public.cc_apply('[{"collection":"members","id":"cc-fixture-member","revision":1,"data":{"name":"ข้อมูลเก่า"}}]');
  raise exception 'FAIL: stale update allowed';
 exception when raise_exception then if sqlerrm<>'CC_CONFLICT' then raise;end if;end;
 if (select data->>'name' from public.cc_members where id='cc-fixture-member')<>'แก้ไขแล้ว' then raise exception 'FAIL: conflict overwrote data';end if;
 begin
  perform public.cc_apply('[
   {"collection":"members","id":"cc-fixture-rollback","revision":null,"data":{"name":"ไม่ควรบันทึก"}},
   {"collection":"members","id":"cc-fixture-member","revision":1,"data":{"name":"conflict"}}
  ]');
  raise exception 'FAIL: transaction conflict allowed';
 exception when raise_exception then if sqlerrm<>'CC_CONFLICT' then raise;end if;end;
 if exists(select from public.cc_members where id='cc-fixture-rollback') then raise exception 'FAIL: partial batch saved';end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
do $$ begin
 if not exists(select from public.cc_members where id='cc-fixture-member') then raise exception 'FAIL: viewer cannot read';end if;
 begin perform public.cc_apply('[{"collection":"members","id":"cc-fixture-member","revision":2,"remove":true}]');raise exception 'FAIL: viewer RPC write';
 exception when raise_exception then if sqlerrm<>'CC_FORBIDDEN' then raise;end if;end;
 begin insert into public.cc_members(id,data) values('cc-fixture-nope','{"name":"not allowed"}');raise exception 'FAIL: viewer direct insert';
 exception when insufficient_privilege then null;end;
 update public.cc_members set data='{"name":"not allowed"}' where id='cc-fixture-member';
 delete from public.cc_members where id='cc-fixture-member';
 if (select data->>'name' from public.cc_members where id='cc-fixture-member')<>'แก้ไขแล้ว' then raise exception 'FAIL: viewer direct write';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.cc_apply('[{"collection":"members","id":"cc-fixture-member","revision":2,"remove":true}]');
do $$ begin
 if exists(select from public.cc_entries where id='cc-fixture-entry') then raise exception 'FAIL: dependent entry not deleted';end if;
end $$;
reset role;
rollback;
-- Success: each assertion completed, no fixture data remains.
