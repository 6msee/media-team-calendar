import test from 'node:test';
import assert from 'node:assert/strict';
import {CalendarAPI} from '../assets/api.js';
const cfg={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const session={access_token:'user-jwt',refresh_token:'refresh-token',expires_at:Math.floor(Date.now()/1000)+3600};
test('login uses Auth API; snapshot sends caller JWT and public API key',async()=>{
 const calls=[];const api=new CalendarAPI(cfg,async(url,options)=>{calls.push({url,options});return response(url.includes('/token')?session:{role:'viewer',members:[],entries:[],plans:[],config:[]});},storage());
 await api.login('person@example.org','example');await api.snapshot();
 assert.match(calls[0].url,/grant_type=password/);assert.equal(JSON.parse(calls[0].options.body).email,'person@example.org');
 assert.equal(calls[1].options.headers.Authorization,'Bearer user-jwt');assert.equal(calls[1].options.headers.apikey,cfg.SUPABASE_PUBLISHABLE_KEY);
});
test('concurrent calls refresh expired session once',async()=>{
 let refreshes=0;const api=new CalendarAPI(cfg,async url=>{if(url.includes('refresh_token')){refreshes++;await new Promise(r=>setTimeout(r,5));return response(session);}return response({});},storage());
 api.remember({...session,expires_at:0});await Promise.all([api.snapshot(),api.snapshot(),api.snapshot()]);assert.equal(refreshes,1);
});
test('batch preserves expected revisions and removes client metadata',async()=>{
 let payload;const api=new CalendarAPI(cfg,async(url,options)=>{payload=JSON.parse(options.body);return response(null);},storage());api.remember(session);
 await api.mutate([{collection:'members',id:'m1',revision:4,data:{id:'m1',_rev:4,name:'A'}}]);
 assert.equal(payload.changes[0].revision,4);assert.deepEqual(payload.changes[0].data,{name:'A'});
});
test('write conflict reaches form as actionable message, never success',async()=>{
 const api=new CalendarAPI(cfg,async()=>response({message:'CC_CONFLICT'},400),storage());api.remember(session);
 await assert.rejects(()=>api.mutate([]),/มีคนแก้ไขข้อมูลนี้แล้ว/);
});
test('failed refresh discards invalid session and requests login',async()=>{
 const store=storage();const api=new CalendarAPI(cfg,async()=>response({error:'invalid_grant'},400),store);api.remember({...session,expires_at:0});
 await assert.rejects(()=>api.snapshot(),e=>e.status===401);assert.equal(api.hasSession,false);
});
test('network failure keeps saved session for retry',async()=>{
 const api=new CalendarAPI(cfg,async()=>{throw new TypeError('offline');},storage());api.remember(session);
 await assert.rejects(()=>api.snapshot(),/เชื่อมต่อฐานข้อมูลไม่ได้/);assert.equal(api.hasSession,true);
});
test('abort signal propagates to AI call',async()=>{
 const ctl=new AbortController();let used;const api=new CalendarAPI(cfg,async(url,options)=>{used=options.signal;throw new DOMException('aborted','AbortError');},storage());api.remember(session);
 await assert.rejects(()=>api.summarize('report',ctl.signal),{name:'AbortError'});assert.equal(used,ctl.signal);
});
test('logout clears local session even if network is unavailable',async()=>{
 const api=new CalendarAPI(cfg,async()=>{throw new Error('offline')},storage());api.remember(session);
 await assert.rejects(()=>api.logout());assert.equal(api.hasSession,false);
});
