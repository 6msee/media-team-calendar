const SESSION_KEY='cc-supabase-session-v1';
export class CalendarAPI {
  constructor(config={},fetcher=globalThis.fetch.bind(globalThis),storage=globalThis.sessionStorage){
    this.config=config;this.fetcher=fetcher;this.storage=storage;this.session=null;this.refreshing=null;
    this.base=String(config.SUPABASE_URL||'').replace(/\/+$/,'');
    this.key=config.SUPABASE_PUBLISHABLE_KEY||'';
    try{this.session=JSON.parse(storage.getItem(SESSION_KEY)||'null');}catch{}
  }
  get configured(){return /^https:\/\/[^/]+$/.test(this.base)&&!!this.key&&!this.key.startsWith('sb_secret_');}
  get hasSession(){return !!this.session?.refresh_token;}
  remember(session){this.session=session;try{session?this.storage.setItem(SESSION_KEY,JSON.stringify(session)):this.storage.removeItem(SESSION_KEY);}catch{}}
  async raw(path,{method='GET',body,token,signal,headers={}}={}){
    if(!this.configured)throw new Error('กรุณาตั้งค่า Supabase ใน config.js');
    let response;
    try{response=await this.fetcher(this.base+path,{method,signal,headers:{apikey:this.key,...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
    catch(err){if(err.name==='AbortError')throw err;throw new Error('เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');}
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const msg=data?.message||data?.msg||data?.error_description||data?.error||'';
      const mapped=msg.includes('CC_CONFLICT')?'มีคนแก้ไขข้อมูลนี้แล้ว กรุณาปิดฟอร์ม กดรีเฟรช แล้วเปิดแก้ไขอีกครั้ง':
        msg.includes('CC_FORBIDDEN')||response.status===403?'บัญชีนี้ไม่มีสิทธิ์ใช้งานรายการนี้':
        response.status===429?'มีการใช้งานถี่เกินไป กรุณารอสักครู่':
        msg.includes('Invalid login credentials')?'อีเมลหรือรหัสผ่านไม่ถูกต้อง':
        response.status===401?'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง':
        msg.includes('AI_NOT_CONFIGURED')?'ยังไม่ได้ตั้งค่า AI ที่ Supabase Edge Function':
        msg.includes('CC_INVALID')?'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก':
        response.status===404?'ไม่พบ API กรุณาติดตั้ง schema.sql และ Edge Function ให้ครบ':
        'ทำรายการไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า Supabase หรือแจ้งผู้ดูแล';
      const error=new Error(mapped);error.status=response.status;error.code=data?.code;throw error;
    }
    return data;
  }
  async login(email,password){
    const session=await this.raw('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    this.remember({...session,expires_at:session.expires_at||Math.floor(Date.now()/1000)+session.expires_in});
  }
  async token(){
    if(!this.session){const e=new Error('กรุณาเข้าสู่ระบบ');e.status=401;throw e;}
    if(this.session.expires_at>Date.now()/1000+60)return this.session.access_token;
    if(!this.refreshing)this.refreshing=(async()=>{
      try{
        const s=await this.raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.session.refresh_token}});
        this.remember({...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+s.expires_in});return s.access_token;
      }catch(err){if(err.status===400||err.status===401){this.remember(null);err.status=401;}throw err;}
      finally{this.refreshing=null;}
    })();
    return this.refreshing;
  }
  async request(path,options={}){
    const token=await this.token();
    try{return await this.raw(path,{...options,token});}
    catch(err){if(err.status===401)this.remember(null);throw err;}
  }
  async logout(){try{if(this.session)await this.raw('/auth/v1/logout',{method:'POST',token:this.session.access_token});}finally{this.remember(null);}}
  snapshot(){return this.request('/rest/v1/rpc/cc_snapshot',{method:'POST',body:{}});}
  mutate(changes){
    const clean=changes.map(change=>{
      const {id,_rev,...data}=change.data||{};
      return {...change,data};
    });
    // One transaction: no partially-saved team when a later item conflicts.
    return this.request('/rest/v1/rpc/cc_apply',{method:'POST',body:{changes:clean}});
  }
  summarize(prompt,signal){return this.request('/functions/v1/'+encodeURIComponent(this.config.AI_FUNCTION||'summarize'),{method:'POST',body:{prompt},signal});}
}
export const api=new CalendarAPI(globalThis.APP_CONFIG||{});
