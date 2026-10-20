-- Optional: run after schema.sql when enabling the AI function.
begin;
create table cc_private.ai_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 calls integer not null
);
revoke all on cc_private.ai_usage from public,anon,authenticated;
create function public.cc_consume_ai() returns boolean language plpgsql security definer set search_path='' as $$
declare used int;
begin
 if cc_private.current_role() is null then raise exception 'CC_FORBIDDEN';end if;
 insert into cc_private.ai_usage(user_id,window_start,calls) values(auth.uid(),now(),1)
 on conflict(user_id) do update set
 calls=case when cc_private.ai_usage.window_start < now()-interval '1 hour' then 1 else cc_private.ai_usage.calls+1 end,
 window_start=case when cc_private.ai_usage.window_start < now()-interval '1 hour' then now() else cc_private.ai_usage.window_start end
 returning calls into used;
 return used<=20;
end $$;
revoke all on function public.cc_consume_ai() from public,anon;
grant execute on function public.cc_consume_ai() to authenticated;
commit;
