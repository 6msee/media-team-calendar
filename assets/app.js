import { api } from "./api.js";
import { fiscalYear, fiscalRange, workDays } from "./dates.js";
"use strict";
/* ---------- constants ---------- */
const TYPES = {
  office:  {label:"งานในสำนักงาน", away:false},
  dev:     {label:"พัฒนาระบบ", away:false},
  field:   {label:"ออกพื้นที่ / ถ่ายภาพ", away:true},
  event:   {label:"งานพิธี / อีเวนต์", away:true},
  meeting: {label:"ประชุม / อบรมภายนอก", away:true},
  leave:   {label:"ลา", away:true}
};
const PERIOD = {full:"ทั้งวัน", am:"ช่วงเช้า", pm:"ช่วงบ่าย"};
const STATUS = {plan:"วางแผน",doing:"กำลังทำ",done:"เสร็จแล้ว"};
const DEFAULT_LEVELS = [
  {key:1,label:"ง่าย",pct:25,hint:"งานประจำ ทำซ้ำได้ เช่น โพสต์ข่าวสั้น แก้ข้อความบนเว็บ"},
  {key:2,label:"ปานกลาง",pct:50,hint:"ต้องวางแผนบ้าง เช่น ทำอินโฟกราฟิก เพิ่มฟีเจอร์เล็กในระบบ"},
  {key:3,label:"ยาก",pct:75,hint:"หลายขั้นตอน/ประสานหลายฝ่าย เช่น ตัดต่อวิดีโอ งานพิธี เชื่อมระบบกับ M365"},
  {key:4,label:"ยากมาก",pct:100,hint:"งานใหญ่ เร่งด่วน ผลกระทบสูง เช่น อีเวนต์ระดับมหาวิทยาลัย พัฒนาระบบใหม่ทั้งระบบ"}];
const PROJECTS = ["BudgetFlowUP","dbf-document (ระบบจัดเก็บเอกสาร)","UP Admin Hub","dbf-album (อัลบั้มรูปภาพ)","DBF HR","dbf-machine / Smart Vehicles","Garden System","inser-ed (EdPEx)","inventory-fuel (เบิกน้ำมัน)","procu-plan (แผนจัดซื้อจัดจ้าง)","smart-building (ฟอร์มคำขอ)","Smart Water","UP-Fix","UP Vehicle Pass","ระบบ Job Description / คู่มือปฏิบัติงาน","เว็บไซต์กองอาคารสถานที่"];
const COLORS = ["#5a2a8a","#2f68b6","#2f8a58","#cc6226","#a8823a","#b83a7a","#17809a","#6d5bd0"];

/* ---------- dates ---------- */
function pad(n){return String(n).padStart(2,"0")}
function toISO(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function fromISO(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function todayISO(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function addDays(s,n){const d=fromISO(s);d.setDate(d.getDate()+n);return toISO(d)}
function mondayOf(s){const d=fromISO(s);const w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return toISO(d)}
function isWeekend(s){const g=fromISO(s).getDay();return g===0||g===6}
function diffDays(a,b){return Math.round((fromISO(b)-fromISO(a))/864e5)}
/* Thai fiscal year: 1 Oct (year-1) – 30 Sep; stored as Buddhist-era number, e.g. 2570 */
function fyBE(iso){return fiscalYear(iso)}
function fyRange(be){return fiscalRange(be)}
function fyMonth(be,i){const g=be-543;const s=new Date(g-1,9+i,1);return [toISO(s),toISO(new Date(s.getFullYear(),s.getMonth()+1,0))]}
function fyMonthIndex(iso){const d=fromISO(iso);return (d.getMonth()+3)%12}
const fmtLong=new Intl.DateTimeFormat("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
const fmtShort=new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short"});
const fmtWd=new Intl.DateTimeFormat("th-TH",{weekday:"short"});
const fmtMonY=new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"2-digit"});
const fmtMon=new Intl.DateTimeFormat("th-TH",{month:"short",year:"2-digit"});
const fmtMonOnly=new Intl.DateTimeFormat("th-TH",{month:"short"});
const fmtMonLong=new Intl.DateTimeFormat("th-TH",{month:"long",year:"numeric"});

/* ---------- state ---------- */
const S = {
  db:null, live:false, sample:false, canWrite:false, offline:false, connecting:true, snapMode:false, isEditor:false, publishing:false,
  members:[], entries:[], plans:[], config:{minInOffice:1},
  sel:todayISO(), span:14, anchor:mondayOf(todayISO()), tab:"cal", planFY:fyBE(todayISO())
};
try{ const v=localStorage.getItem("cc-span"); if(v&&[7,14,28].includes(+v)) S.span=+v; }catch(e){}
try{ const t=localStorage.getItem("cc-tab"); if(["cal","plan","load"].includes(t)) S.tab=t; }catch(e){}
if(location.hash==="#load") S.tab="load"; else if(location.hash==="#plan") S.tab="plan"; else if(location.hash==="#calendar") S.tab="cal";

/* ---------- derived ---------- */
function levels(){const l=S.config&&Array.isArray(S.config.levels)&&S.config.levels.length===4?S.config.levels:null;
  return DEFAULT_LEVELS.map((d,i)=>({...d,pct:l&&+l[i]>0?Math.min(100,+l[i]):d.pct}));}
function levelOf(x){const k=+x.level||2;return levels()[Math.min(4,Math.max(1,k))-1];}
function lvColor(k){return `var(--lv${k})`}
function activeMembers(){return S.members.filter(m=>m.active!==false).sort((a,b)=>(a.order||0)-(b.order||0)||String(a.name).localeCompare(String(b.name),"th"))}
function memberById(id){return S.members.find(m=>m.id===id)}
function entriesOn(memberId,day){return S.entries.filter(e=>e.memberId===memberId&&e.start<=day&&e.end>=day)}
function covers(e,period){return !e.period||e.period==="full"||e.period===period}
function awayIn(memberId,day,period){return entriesOn(memberId,day).some(e=>TYPES[e.type]&&TYPES[e.type].away&&covers(e,period))}
function coverage(day){
  const ms=activeMembers();
  const am=ms.filter(m=>!awayIn(m.id,day,"am")).length, pm=ms.filter(m=>!awayIn(m.id,day,"pm")).length;
  const min=Math.max(0,+S.config.minInOffice||0);
  return {am,pm,total:ms.length,min,short:!isWeekend(day)&&ms.length>0&&(am<min||pm<min),amShort:am<min,pmShort:pm<min};
}
function memberColor(m){return COLORS[((m&&m.color)||0)%COLORS.length]}
function initial(name){return (String(name||"?").trim().replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/,"")[0]||"?")}
function overlapDays(e,first,last){
  const s=e.start>first?e.start:first, en=e.end<last?e.end:last;
  if(en<s) return 0;
  return workDays(s,en,e.period);
}
function entryScore(e,first,last){ if(e.type==="leave") return 0; return overlapDays(e,first,last)*levelOf(e).pct/100; }
function plansOf(be){return S.plans.filter(p=>+p.fy===+be)}
function planActual(p){const es=S.entries.filter(e=>e.planId===p.id&&e.type!=="leave");
  return {days:es.reduce((a,e)=>a+overlapDays(e,e.start,e.end),0),count:es.length};}
const n1=x=>(Math.round(x*10)/10).toLocaleString("th-TH");
const p0=x=>Math.round(x)+"%";

/* ---------- DOM helpers ---------- */
function h(tag,attrs,...kids){
  const el=document.createElement(tag);
  if(attrs) for(const k in attrs){
    const v=attrs[k]; if(v==null||v===false) continue;
    if(k==="class") el.className=v;
    else if(k==="style") el.style.cssText=v;
    else if(k.startsWith("on")) el.addEventListener(k.slice(2),v);
    else if(k==="text") el.textContent=v;
    else el.setAttribute(k,v===true?"":v);
  }
  for(const c of kids.flat(Infinity)){ if(c==null||c===false) continue; el.append(c.nodeType?c:document.createTextNode(String(c))); }
  return el;
}
const $=id=>document.getElementById(id);
function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2400)}
function typeChip(type){return h("span",{class:"chip",style:`color:var(--t-${type});background:var(--t-${type}-bg)`},TYPES[type]?TYPES[type].label:type)}
function lvTag(L){return h("span",{class:"lvtag",style:`background:${lvColor(L.key)};color:${L.key>=3?"var(--surface)":"var(--fg)"}`,text:`${L.label} ${L.pct}%`})}
function avatar(m,size){return h("div",{class:"avatar",style:`background:${memberColor(m)}`+(size?`;width:${size}px;height:${size}px;font-size:${Math.round(size*.45)}px`:""),text:initial(m&&m.name)})}

/* ---------- render ---------- */
function render(){
  const noTeam=activeMembers().length===0;
  const readOnly=(S.live||S.snapMode)&&!S.sample&&!S.canWrite;
  $("sampleBanner").hidden=!S.sample&&!readOnly;
  $("btnExitSample").hidden=!S.sample;
  $("sampleText").textContent=S.sample
    ? "กำลังแสดงข้อมูลตัวอย่าง รายชื่อและงานในโหมดนี้สมมติขึ้นเพื่อสาธิต การแก้ไขในโหมดนี้ไม่ถูกบันทึก"
    : "สิทธิ์ดูข้อมูล · ติดต่อผู้ดูแลหากต้องการแก้ไขแผนงาน";
  renderConnection();
  $("btnAdd").hidden=!S.canWrite||noTeam;
  $("btnMembers").hidden=!S.canWrite&&!S.sample;
  $("btnAddPlan").hidden=!S.canWrite;
  $("btnLevels").hidden=!S.canWrite;
  $("aiPanel").hidden=noTeam; $("tabs").hidden=noTeam; $("heroStats").hidden=noTeam;
  const tab=noTeam?"cal":S.tab;
  [["cal","viewCal"],["plan","viewPlan"],["load","viewLoad"]].forEach(([k,v])=>{
    $("tab-"+k).setAttribute("aria-selected",String(tab===k)); $(v).hidden=tab!==k; });
  $("legend").replaceChildren(...Object.keys(TYPES).map(typeChip));
  refreshDatalist();
  if(noTeam){ renderEmpty(); return; }
  renderHero();
  $("board").hidden=false;
  if(tab==="cal"){ renderDay(); renderTimeline(); }
  else if(tab==="plan") renderPlan();
  else renderLoad();
}
function setTab(t){ S.tab=t; try{localStorage.setItem("cc-tab",t)}catch(e){} render(); }
["cal","plan","load"].forEach(k=>$("tab-"+k).addEventListener("click",()=>setTab(k)));

function refreshDatalist(){
  const used=new Set(PROJECTS); S.entries.forEach(e=>e.project&&used.add(e.project)); S.plans.forEach(p=>p.project&&used.add(p.project));
  $("projList-dl").replaceChildren(...[...used].map(p=>h("option",{value:p})));
}

function renderHero(){
  const t=todayISO(), c=coverage(t), hr=+new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",hourCycle:"h23"}).format(new Date()), per=hr<12?"am":"pm";
  const now=per==="am"?c.am:c.pm;
  const awayToday=activeMembers().filter(m=>entriesOn(m.id,t).some(e=>TYPES[e.type].away)).length;
  const doing=S.entries.filter(e=>e.status==="doing"&&e.end>=t&&e.type!=="leave").length;
  const be=fyBE(t), ps=plansOf(be);
  const avgProg=ps.length?ps.reduce((a,p)=>a+(+p.progress||0),0)/ps.length:null;
  const short=!isWeekend(t)&&now<c.min;
  $("heroStats").replaceChildren(
    h("div",{class:"hs"+(short?" warn":"")},h("small",{text:`อยู่สำนักงาน${per==="am"?"ช่วงเช้า":"ช่วงบ่าย"}นี้`}),h("b",null,String(now),h("span",{text:` / ${c.total} คน`}))),
    h("div",{class:"hs"},h("small",{text:"ออกนอกสำนักงานวันนี้"}),h("b",null,String(awayToday),h("span",{text:" คน"}))),
    h("div",{class:"hs"},h("small",{text:"งานที่กำลังทำ"}),h("b",null,String(doing),h("span",{text:" งาน"}))),
    h("div",{class:"hs"},h("small",{text:`แผนปีงบประมาณ ${be}`}),h("b",null,avgProg==null?"–":p0(avgProg),h("span",{text:avgProg==null?" ยังไม่มีแผน":` · ${ps.length} แผน`})))
  );
}

function renderEmpty(){
  $("board").hidden=true;
  $("btnMembers").hidden=$("btnMembers").hidden||S.offline||S.connecting;
  if(S.connecting){ $("tlScroll").replaceChildren(h("div",{class:"empty"},h("p",{text:"กำลังเชื่อมต่อข้อมูลของทีม…"}))); $("rangeLabel").textContent=""; return; }
  if(S.offline){
    $("tlScroll").replaceChildren(h("div",{class:"empty"},
      h("h3",{text:"ยังเปิดข้อมูลของทีมไม่ได้"}),
      h("p",{text:"ยังเชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตและเข้าสู่ระบบอีกครั้ง"}),
      h("div",{class:"actions"},h("button",{class:"btn",type:"button",onclick:enterSample},"ดูตัวอย่างการใช้งาน"))));
    $("rangeLabel").textContent=""; return;
  }
  $("tlScroll").replaceChildren(h("div",{class:"empty"},
    h("h3",{text:"เริ่มจากใส่รายชื่อทีม"}),
    h("p",{text:"เพิ่มสมาชิกทีมสื่อสารองค์กรก่อน จากนั้นแต่ละคนลงแผนงานของตัวเองได้ ทั้งงานรายวัน (ออกพื้นที่ พัฒนาระบบ ลา) และแผนประจำปีงบประมาณ ระบบจะบอกว่าวันไหนสำนักงานไม่มีคนอยู่ และใครถือสโคปงานมากแค่ไหน"}),
    h("div",{class:"actions"},
      S.canWrite?h("button",{class:"btn primary",type:"button",onclick:openMembers},"+ เพิ่มสมาชิกทีม"):null,
      h("button",{class:"btn",type:"button",onclick:enterSample},"ดูตัวอย่างการใช้งาน"))));
  $("rangeLabel").textContent="";
}

function renderDay(){
  const d=S.sel, t=todayISO(), dd=diffDays(t,d);
  $("dayRel").textContent=dd===0?"วันนี้":dd===1?"พรุ่งนี้":dd===-1?"เมื่อวาน":(dd>0?`อีก ${dd} วัน`:`${-dd} วันที่แล้ว`);
  $("dayTitle").textContent=fmtLong.format(fromISO(d));
  const c=coverage(d), we=isWeekend(d);
  $("cover").replaceChildren(
    h("div",{class:"slot"+(c.amShort&&!we?" short":"")},h("small",{text:"อยู่สำนักงาน ช่วงเช้า"}),h("b",{text:`${c.am}/${c.total}`})),
    h("div",{class:"slot"+(c.pmShort&&!we?" short":"")},h("small",{text:"อยู่สำนักงาน ช่วงบ่าย"}),h("b",{text:`${c.pm}/${c.total}`})));
  const msg=$("coverMsg");
  if(we) msg.replaceChildren(h("div",{class:"foot",text:"วันหยุดเสาร์–อาทิตย์ ไม่นับคนเฝ้าสำนักงาน"}));
  else if(c.short){ const p=c.amShort&&c.pmShort?"ทั้งวัน":c.amShort?"ช่วงเช้า":"ช่วงบ่าย";
    msg.replaceChildren(h("div",{class:"alert",text:`${p}มีคนอยู่สำนักงานน้อยกว่า ${c.min} คน ควรปรับแผนให้มีคนรับเรื่องที่สำนักงาน`})); }
  else msg.replaceChildren(h("div",{class:"ok",text:`มีคนเฝ้าสำนักงานครบตามที่กำหนด (อย่างน้อย ${c.min} คน)`}));
  $("who").replaceChildren(...activeMembers().map(m=>{
    const es=entriesOn(m.id,d).sort((a,b)=>(a.period||"").localeCompare(b.period||""));
    const status=es.length
      ? es.map(e=>h("div",{class:"st"},typeChip(e.type)," ",[e.title,e.project&&`[${e.project}]`,e.place&&"@ "+e.place,e.period&&e.period!=="full"&&"("+PERIOD[e.period]+")"].filter(Boolean).join(" ")))
      : [h("div",{class:"st"},we?"วันหยุด":h("span",{class:"chip",style:"color:var(--muted);background:var(--surface)"},"อยู่สำนักงาน (ไม่มีแผน)"))];
    return h("div",{class:"person"},avatar(m),
      h("div",{style:"min-width:0;display:flex;flex-direction:column;gap:4px"},h("div",{class:"nm",text:m.name}),m.role?h("div",{class:"st",text:m.role}):null,status));
  }));
}

function renderTimeline(){
  const days=[...Array(S.span)].map((_,i)=>addDays(S.anchor,i));
  const first=days[0], last=days[days.length-1], t=todayISO();
  $("rangeLabel").textContent=`${fmtShort.format(fromISO(first))} – ${fmtMonY.format(fromISO(last))} · ปีงบประมาณ ${fyBE(first)}`;
  document.querySelectorAll(".seg button").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.span===S.span)));
  const col=S.span===28?54:70, laneH=30;
  const shortMap={}; days.forEach(d=>shortMap[d]=coverage(d).short);
  const hdr=h("div",{class:"tl-row tl-hdr"},h("div",{class:"tl-name"},"สมาชิก"),
    h("div",{class:"days"},days.map(d=>h("button",{type:"button",
      class:"dh"+(isWeekend(d)?" we":"")+(d===t?" today":"")+(d===S.sel?" sel":""),style:`width:${col}px`,
      title:fmtLong.format(fromISO(d))+(shortMap[d]?" · คนเฝ้าสำนักงานไม่พอ":""),onclick:()=>{S.sel=d;render();}},
      h("span",{text:fmtWd.format(fromISO(d))}),h("span",{class:"d",text:String(fromISO(d).getDate())}),
      h("span",{class:"flag"+(shortMap[d]?"":" none"),text:"คนไม่พอ"})))));
  const rows=activeMembers().map(m=>{
    const es=S.entries.filter(e=>e.memberId===m.id&&e.end>=first&&e.start<=last)
      .sort((a,b)=>a.start.localeCompare(b.start)||(a.period||"").localeCompare(b.period||""));
    const lanes=[]; const placed=es.map(e=>{
      const s=Math.max(0,diffDays(first,e.start)), en=Math.min(S.span-1,diffDays(first,e.end));
      let x0=s,x1=en+1;
      if(e.start===e.end&&e.period==="am") x1=s+.5;
      if(e.start===e.end&&e.period==="pm") x0=s+.5;
      let lane=lanes.findIndex(endX=>endX<=x0+1e-6); if(lane<0){lane=lanes.length;lanes.push(0);} lanes[lane]=x1;
      return {e,x0,x1,lane};
    });
    const height=Math.max(1,lanes.length)*laneH+10;
    const cells=h("div",{class:"cells"},days.map(d=>h("button",{type:"button",
      class:"cell"+(isWeekend(d)?" we":"")+(shortMap[d]?" short":"")+(d===S.sel?" sel":""),style:`width:${col}px`,
      "aria-label":`ลงงานของ ${m.name} วันที่ ${fmtShort.format(fromISO(d))}`,
      onclick:()=>{ if(S.canWrite) openEntry(null,{memberId:m.id,start:d,end:d}); else {S.sel=d;render();} }})));
    const bars=placed.map(({e,x0,x1,lane})=>{
      const L=e.type==="leave"?null:levelOf(e);
      const lbl=[e.title||TYPES[e.type].label,e.period&&e.period!=="full"&&e.start!==e.end&&"("+PERIOD[e.period]+")"].filter(Boolean).join(" ");
      return h("button",{type:"button",class:"bar"+(e.status==="done"?" done":""),
        style:`left:${x0*col+3}px;width:${(x1-x0)*col-6}px;top:${lane*laneH+8}px;color:var(--t-${e.type});background:var(--t-${e.type}-bg)`,
        title:[TYPES[e.type].label,e.title,e.project&&`ระบบ: ${e.project}`,e.place&&"@ "+e.place,e.period&&e.period!=="full"&&PERIOD[e.period],L&&`ความยาก ${L.label} ${L.pct}%`,L&&STATUS[e.status||"plan"],e.note].filter(Boolean).join(" · "),
        onclick:ev=>{ev.stopPropagation(); if(S.canWrite) openEntry(e); else {S.sel=e.start<first?first:e.start;render();}}},
        e.status==="done"?h("span",{text:"✓"}):null, h("span",{text:lbl}));
    });
    return h("div",{class:"tl-row"},
      h("div",{class:"tl-name",style:`min-height:${height}px`},avatar(m),
        h("div",null,h("div",{class:"nm",text:m.name}),m.role?h("div",{class:"rl",text:m.role}):null)),
      h("div",{class:"track",style:`width:${col*S.span}px;height:${height}px`},cells,bars));
  });
  $("tlScroll").replaceChildren(h("div",{class:"tl"},hdr,h("div",{class:"tl-body"},rows)));
}

/* ---------- fiscal-year plan ---------- */
function fyOptions(){
  const cur=fyBE(todayISO()); const set=new Set([cur-1,cur,cur+1]);
  S.plans.forEach(p=>p.fy&&set.add(+p.fy)); S.entries.forEach(e=>set.add(fyBE(e.start)));
  return [...set].sort((a,b)=>b-a);
}
function renderPlan(){
  const be=S.planFY, sel=$("plan-fy");
  sel.replaceChildren(...fyOptions().map(y=>h("option",{value:String(y),selected:y===be},`ปีงบประมาณ ${y}`+(y===fyBE(todayISO())?" (ปัจจุบัน)":""))));
  const [f0,f1]=fyRange(be);
  $("planRangeLabel").textContent=`${fmtLong.format(fromISO(f0))} – ${fmtLong.format(fromISO(f1))}`;
  $("btnAddPlan").hidden=!S.canWrite;
  const ps=plansOf(be).slice().sort((a,b)=>{const ma=memberById(a.ownerId),mb=memberById(b.ownerId);
    return ((ma&&ma.order)||99)-((mb&&mb.order)||99)||(+a.startM||0)-(+b.startM||0);});
  const done=ps.filter(p=>p.status==="done").length;
  const avg=ps.length?ps.reduce((a,p)=>a+(+p.progress||0),0)/ps.length:0;
  const actual=ps.reduce((a,p)=>a+planActual(p).days,0);
  const yearScore=S.entries.reduce((a,e)=>a+entryScore(e,f0,f1),0);
  $("planKpis").replaceChildren(
    h("div",{class:"kpi"},h("small",{text:"แผนงานประจำปี"}),h("b",{text:String(ps.length)}),h("span",{text:` · เสร็จ ${done}`})),
    h("div",{class:"kpi"},h("small",{text:"ความคืบหน้าเฉลี่ย"}),h("b",{text:ps.length?p0(avg):"–"})),
    h("div",{class:"kpi"},h("small",{text:"วันทำงานที่ลงจริงตามแผน"}),h("b",{text:n1(actual)}),h("span",{text:" วัน"})),
    h("div",{class:"kpi"},h("small",{text:"คะแนนภาระทั้งปีของทีม"}),h("b",{text:n1(yearScore)}),h("span",{text:" คะแนน"})));

  const curM=fyBE(todayISO())===be?fyMonthIndex(todayISO()):-1;
  const monthCells=(extra)=>[...Array(12)].map((_,i)=>h("div",{class:"mc"+(i%3===2&&i<11?" q":"")+(i===curM?" now":"")},extra?extra(i):null));
  const qRow=h("div",{class:"yr-row yr-q"},h("div",{class:"yr-name"},""),
    h("div",{class:"yr-lane"},[0,1,2,3].map(q=>h("div",{class:"mc",style:`grid-column:${q*3+1}/${q*3+4}`,text:`ไตรมาส ${q+1}`}))));
  const hRow=h("div",{class:"yr-row yr-hdr"},h("div",{class:"yr-name"},"แผนงาน / ผู้รับผิดชอบ"),
    h("div",{class:"yr-lane"},monthCells(i=>fmtMon.format(fromISO(fyMonth(be,i)[0])))));
  const rows=ps.map(p=>{
    const L=levelOf(p), m=memberById(p.ownerId), a=planActual(p);
    const s=Math.max(0,Math.min(11,+p.startM||0)), e=Math.max(s,Math.min(11,p.endM==null?s:+p.endM));
    const prog=Math.max(0,Math.min(100,+p.progress||0));
    const bar=h("button",{type:"button",class:"pbarx",
      style:`grid-column:${s+1}/${e+2};background:color-mix(in srgb,${lvColor(L.key)} 28%,var(--surface));box-shadow:inset 3px 0 0 ${lvColor(L.key)}`,
      title:[p.title,`ความยาก ${L.label} ${L.pct}%`,STATUS[p.status||"plan"],`คืบหน้า ${prog}%`,p.target&&`เป้าหมาย: ${p.target}`,a.count&&`ลงงานจริง ${n1(a.days)} วัน`].filter(Boolean).join(" · "),
      onclick:()=>{ if(S.canWrite) openPlan(p); }},
      p.status==="done"?h("span",{text:"✓"}):null, h("span",{text:`${p.title} · ${prog}%`}),
      h("i",{class:"pg",style:`width:${prog}%;background:${lvColor(L.key)}`}));
    return h("div",{class:"yr-row"},
      h("div",{class:"yr-name"},h("div",{class:"nm",text:p.title}),
        h("div",{class:"rl",text:[m?m.name:"ทั้งทีม",p.project,a.count?`ลงงานแล้ว ${n1(a.days)} วัน`:null].filter(Boolean).join(" · ")})),
      h("div",{class:"yr-lane"},monthCells(),bar));
  });
  if(!ps.length) rows.push(h("div",{class:"empty",style:"padding:28px"},
    h("p",{text:`ยังไม่มีแผนงานของปีงบประมาณ ${be} เพิ่มโครงการหรือระบบที่จะพัฒนาในปีนี้ พร้อมเดือนที่ทำและระดับความยาก`}),
    S.canWrite?h("button",{class:"btn primary",type:"button",onclick:()=>openPlan(null)},"+ เพิ่มแผนประจำปี"):null));
  $("yrGantt").replaceChildren(qRow,hRow,...rows);

  /* heatmap */
  const ms=activeMembers();
  const grid=ms.map(m=>[...Array(12)].map((_,i)=>{const [a,b]=fyMonth(be,i);
    return S.entries.filter(e=>e.memberId===m.id).reduce((s,e)=>s+entryScore(e,a,b),0);}));
  const max=Math.max(0.0001,...grid.flat());
  const tot=grid.map(r=>r.reduce((a,b)=>a+b,0)), all=tot.reduce((a,b)=>a+b,0);
  $("heat").replaceChildren(
    h("thead",null,h("tr",null,h("th",{class:"nmc",text:"สมาชิก"}),[...Array(12)].map((_,i)=>h("th",{text:fmtMonOnly.format(fromISO(fyMonth(be,i)[0]))})),h("th",{text:"รวม / % ทีม"}))),
    h("tbody",null,ms.map((m,r)=>h("tr",null,
      h("td",{class:"nmc",text:m.name}),
      grid[r].map((v,i)=>{const ratio=v/max, pct=v?Math.round(10+ratio*72):0;
        return h("td",{class:"hc",style:v?`background:color-mix(in srgb,var(--accent) ${pct}%,var(--surface));color:${ratio>.55?"var(--accent-ink)":"var(--fg)"}`:"background:var(--sunk);color:var(--muted)"},
          h("button",{type:"button",title:`${m.name} · ${fmtMonLong.format(fromISO(fyMonth(be,i)[0]))} · ${n1(v)} คะแนน`,
            onclick:()=>{const d=fyMonth(be,i)[0];S.sel=d;S.anchor=mondayOf(d);S.span=28;setTab("cal");}},v?n1(v):"·"));}),
      h("td",{class:"tot"},h("b",{text:n1(tot[r])}),h("span",{class:"foot",text:` · ${all?p0(tot[r]/all*100):"–"}`}))))));
}
$("plan-fy").addEventListener("change",ev=>{S.planFY=+ev.target.value;render();});
$("btnAddPlan").addEventListener("click",()=>openPlan(null));

/* ---------- workload analysis ---------- */
function buildLoadOptions(){
  const sel=$("load-range"); const prev=sel.value||"month"; const cur=fyBE(todayISO());
  const opts=[["week","สัปดาห์นี้"],["month","เดือนนี้"],["lastmonth","เดือนที่แล้ว"],["q3","3 เดือนล่าสุด"],
    ...fyOptions().filter(y=>y<=cur+1).map(y=>[`fy:${y}`,`ปีงบประมาณ ${y}`+(y===cur?" (ปัจจุบัน)":"")])];
  sel.replaceChildren(...opts.map(([v,t])=>h("option",{value:v,selected:v===prev},t)));
}
function loadRange(kind){
  const t=todayISO(), d=fromISO(t), mon=mondayOf(t);
  if(kind==="week") return [mon,addDays(mon,6),"สัปดาห์นี้"];
  if(kind==="next") return [addDays(mon,7),addDays(mon,13),"สัปดาห์หน้า"];
  if(kind==="view") return [S.anchor,addDays(S.anchor,S.span-1),"ช่วงที่แสดงในไทม์ไลน์"];
  if(kind==="lastmonth") return [toISO(new Date(d.getFullYear(),d.getMonth()-1,1)),toISO(new Date(d.getFullYear(),d.getMonth(),0)),"เดือนที่แล้ว"];
  if(kind==="q3") return [toISO(new Date(d.getFullYear(),d.getMonth()-2,1)),toISO(new Date(d.getFullYear(),d.getMonth()+1,0)),"3 เดือนล่าสุด"];
  if(kind==="fy"){const r=fyRange(S.planFY);return [r[0],r[1],`ปีงบประมาณ ${S.planFY}`];}
  if(String(kind).startsWith("fy:")){const be=+kind.slice(3);const r=fyRange(be);return [r[0],r[1],`ปีงบประมาณ ${be}`];}
  return [toISO(new Date(d.getFullYear(),d.getMonth(),1)),toISO(new Date(d.getFullYear(),d.getMonth()+1,0)),"เดือนนี้"];
}
function computeLoad(first,last){
  const ms=activeMembers();
  const rows=ms.map(m=>({m,tasks:0,days:0,score:0,leave:0,byLv:[0,0,0,0],done:0,diffSum:0}));
  const byId=Object.fromEntries(rows.map(r=>[r.m.id,r]));
  const items=[], proj={};
  S.entries.forEach(e=>{
    const r=byId[e.memberId]; if(!r) return;
    const days=overlapDays(e,first,last); if(!days) return;
    if(e.type==="leave"){ r.leave+=days; return; }
    const L=levelOf(e), sc=days*L.pct/100;
    r.tasks++; r.days+=days; r.score+=sc; r.byLv[L.key-1]+=sc; r.diffSum+=L.pct*days;
    if(e.status==="done") r.done++;
    items.push({e,m:r.m,L,days,sc});
    const k=(e.project||"").trim()||"ไม่ระบุระบบ/โครงการ";
    const P=proj[k]||(proj[k]={name:k,score:0,days:0,tasks:0,people:new Set(),byLv:[0,0,0,0]});
    P.score+=sc; P.days+=days; P.tasks++; P.people.add(r.m.name); P.byLv[L.key-1]+=sc;
  });
  const total=rows.reduce((a,r)=>a+r.score,0), avg=rows.length?total/rows.length:0;
  rows.forEach(r=>{
    r.share=total?r.score/total*100:0; r.vsAvg=avg?r.score/avg*100:0;
    r.avgDiff=r.days?r.diffSum/r.days:0; r.donePct=r.tasks?r.done/r.tasks*100:0;
    r.flag=!r.score?"none":r.vsAvg>=125?"hi":r.vsAvg<=75?"lo":"mid";
  });
  const tasks=rows.reduce((a,r)=>a+r.tasks,0), days=rows.reduce((a,r)=>a+r.days,0), done=rows.reduce((a,r)=>a+r.done,0);
  const teamDiff=days?rows.reduce((a,r)=>a+r.diffSum,0)/days:0;
  items.sort((a,b)=>b.L.pct-a.L.pct||b.sc-a.sc);
  const projects=Object.values(proj).sort((a,b)=>b.score-a.score);
  return {rows,total,tasks,days,done,teamDiff,items,projects,lv:levels()};
}
function stackBar(byLv,total,scaleMax){
  const w=scaleMax?Math.max(0,total/scaleMax*100):100;
  return h("div",{class:"stack"},h("div",{class:"stack",style:`width:${w}%;background:transparent`},
    byLv.map((v,i)=>v>0?h("i",{style:`width:${total?v/total*100:0}%;background:${lvColor(i+1)}`,title:`${levels()[i].label}: ${n1(v)} คะแนน`}):null)));
}
function nearestLevel(pct){const l=levels();let best=l[0];l.forEach(x=>{if(Math.abs(x.pct-pct)<Math.abs(best.pct-pct))best=x;});return "≈ "+best.label;}
function renderLoad(){
  buildLoadOptions();
  const [first,last,label]=loadRange($("load-range").value);
  const R=computeLoad(first,last);
  $("loadRangeLabel").textContent=`${label} · ${fmtMonY.format(fromISO(first))} – ${fmtMonY.format(fromISO(last))}`;
  $("kpis").replaceChildren(
    h("div",{class:"kpi"},h("small",{text:"งานทั้งหมด (ไม่รวมลา)"}),h("b",{text:R.tasks.toLocaleString("th-TH")}),h("span",{text:` · ${n1(R.days)} วัน-คน`})),
    h("div",{class:"kpi"},h("small",{text:"คะแนนภาระรวมของทีม"}),h("b",{text:n1(R.total)}),h("span",{text:" คะแนน"})),
    h("div",{class:"kpi"},h("small",{text:"ความยากเฉลี่ยของทีม"}),h("b",{text:R.days?p0(R.teamDiff):"–"}),h("span",{text:R.days?" "+nearestLevel(R.teamDiff):""})),
    h("div",{class:"kpi"},h("small",{text:"งานที่เสร็จแล้ว"}),h("b",{text:R.tasks?p0(R.done/R.tasks*100):"–"}),h("span",{text:` · ${R.done}/${R.tasks} งาน`})));
  $("lvLegend").replaceChildren(...R.lv.map(l=>h("span",null,h("i",{style:`background:${lvColor(l.key)}`}),`${l.label} ${l.pct}%`)));
  const maxScore=Math.max(0,...R.rows.map(r=>r.score));
  const flagTxt={hi:"ภาระสูงกว่าเฉลี่ย",mid:"สมดุล",lo:"ภาระน้อยกว่าเฉลี่ย",none:"ไม่มีงานในช่วงนี้"};
  $("peopleLoad").replaceChildren(...(R.tasks?[...R.rows].sort((a,b)=>b.score-a.score):R.rows).map(r=>h("div",{class:"pl"},
    h("div",{class:"pl-who"},avatar(r.m),h("div",{style:"min-width:0"},h("div",{class:"nm",text:r.m.name}),r.m.role?h("div",{class:"rl",text:r.m.role}):null)),
    h("div",{class:"pl-bar"},stackBar(r.byLv,r.score,maxScore),
      h("div",{class:"nums"},
        h("span",null,h("b",{text:r.tasks})," งาน"),h("span",null,h("b",{text:n1(r.days)})," วันทำงาน"),
        h("span",null,"คะแนน ",h("b",{text:n1(r.score)})),h("span",null,"ยากเฉลี่ย ",h("b",{text:r.days?p0(r.avgDiff):"–"})),
        h("span",null,"เสร็จ ",h("b",{text:r.tasks?p0(r.donePct):"–"})),r.leave?h("span",null,"ลา ",h("b",{text:n1(r.leave)})," วัน"):null)),
    h("div",{class:"pl-share"},h("b",{text:R.total?p0(r.share):"–"}),h("div",{class:"foot",style:"font-size:11.5px",text:"ของสโคปงานทีม"}),
      h("span",{class:"badge "+r.flag,text:flagTxt[r.flag]})))));
  if(!R.tasks) $("peopleLoad").append(h("p",{class:"foot",style:"margin:12px 0 0",text:"ยังไม่มีงานในช่วงนี้ ลงแผนงานในแท็บปฏิทินทีมแล้วระบบจะคำนวณให้อัตโนมัติ"}));

  const top=R.items.slice(0,8);
  $("hardTbl").replaceChildren(
    h("thead",null,h("tr",null,["ระดับ","งาน","ผู้รับผิดชอบ","วันที่","วันทำงาน","สถานะ"].map(t=>h("th",{text:t})))),
    h("tbody",null,top.length?top.map(({e,m,L,days})=>h("tr",null,
      h("td",null,lvTag(L)),
      h("td",null,h("div",{style:"font-weight:500",text:e.title||TYPES[e.type].label}),h("div",{class:"foot",text:[TYPES[e.type].label,e.project,e.place].filter(Boolean).join(" · ")})),
      h("td",{text:m.name,style:"white-space:nowrap"}),
      h("td",{class:"mono",style:"white-space:nowrap;font-size:13px",text:e.start===e.end?fmtShort.format(fromISO(e.start)):`${fmtShort.format(fromISO(e.start))} – ${fmtShort.format(fromISO(e.end))}`}),
      h("td",{class:"mono",text:n1(days)}),
      h("td",null,h("span",{class:"status "+(e.status||"plan"),text:STATUS[e.status||"plan"]})))):
      h("tr",null,h("td",{colspan:"6",class:"foot",text:"ยังไม่มีงานในช่วงนี้"}))));

  const pmax=Math.max(0,...R.projects.map(p=>p.score));
  $("projList").replaceChildren(...(R.projects.length?R.projects.map(p=>h("div",{class:"proj"},
    h("div",{style:"min-width:0"},h("div",{class:"pn",text:p.name}),h("div",{class:"pm",text:`${[...p.people].join(", ")} · ${p.tasks} งาน · ${n1(p.days)} วัน`})),
    h("div",{class:"pbar"},stackBar(p.byLv,p.score,pmax)),
    h("div",{class:"pct",text:R.total?p0(p.score/R.total*100):"–"}))):[h("p",{class:"foot",text:"ยังไม่มีงานในช่วงนี้"})]));

  $("methodText").textContent=`คะแนนภาระของแต่ละงาน = จำนวนวันทำงานในช่วงที่เลือก × % ความยาก (ครึ่งวันนับ 0.5 วัน) เช่น งานยาก (${R.lv[2].pct}%) 2 วัน = ${n1(2*R.lv[2].pct/100)} คะแนน · "% ของสโคปงานทีม" คือคะแนนของคนนั้นหารด้วยคะแนนรวมของทีม · เทียบกับค่าเฉลี่ยของทีม: สูงกว่าเฉลี่ย 25% ขึ้นไป = ภาระสูง, ต่ำกว่าเฉลี่ย 25% ขึ้นไป = ภาระน้อย · วันลาไม่นับเป็นภาระแต่แสดงแยกไว้ · งานที่ไม่ได้ระบุความยากนับเป็น "ปานกลาง" · นับวันจันทร์–ศุกร์ ไม่หักวันหยุดนักขัตฤกษ์ และนับแต่ละงานแยกกันแม้วันที่ทับซ้อน · ปีงบประมาณนับ 1 ต.ค. ถึง 30 ก.ย.`;
}
$("load-range").addEventListener("change",render);

/* ---------- API writes: database commits before UI success ---------- */
function uid(){return crypto.randomUUID()}
function upsert(arr,x){const i=arr.findIndex(y=>y.id===x.id); if(i>=0) arr[i]=x; else arr.push(x);}
async function persist(collection,obj,remove=false){
  if(S.sample){
    if(remove) S[collection]=S[collection].filter(x=>x.id!==obj.id);
    else upsert(S[collection],obj);
    render(); return;
  }
  if(!S.canWrite||!S.live) throw new Error("บัญชีนี้ไม่มีสิทธิ์แก้ไข หรือยังเชื่อมต่อฐานข้อมูลไม่ได้");
  await api.mutate([{collection,id:obj.id,data:obj,revision:obj._rev??null,remove}]);
  // Saving succeeded even when the subsequent refresh temporarily fails.
  try{await refreshData();}catch{toast("บันทึกแล้ว แต่ยังโหลดข้อมูลล่าสุดไม่ได้ กรุณากดรีเฟรช");}
}
async function saveEntry(e){await persist("entries",e)}
async function deleteEntry(id,revision){await persist("entries",{id,_rev:revision},true)}
async function savePlan(p){await persist("plans",p)}
async function deletePlan(id,revision){
  if(S.sample){S.entries.forEach(e=>{if(e.planId===id)e.planId="";});}
  await persist("plans",{id,_rev:revision},true);
}
async function saveTeam(keep,removed,min,configRevision){
  const changes=keep.map((m,i)=>({collection:"members",id:m.id,revision:m._rev??null,
    data:{...m,name:m.name.trim(),role:String(m.role||"").trim(),order:i,active:true}}));
  changes.push(...removed.filter(m=>m._rev).map(m=>({collection:"members",id:m.id,revision:m._rev,remove:true})));
  changes.push({collection:"config",id:"main",revision:configRevision??null,data:{...S.config,minInOffice:min}});
  if(S.sample){S.members=keep;S.entries=S.entries.filter(e=>keep.some(m=>m.id===e.memberId));S.config.minInOffice=min;render();return;}
  if(!S.canWrite)throw new Error("ไม่มีสิทธิ์แก้ไข");
  await api.mutate(changes);
  try{await refreshData();}catch{toast("บันทึกแล้ว กรุณากดรีเฟรชข้อมูลอีกครั้ง");}
}
async function saveConfig(c){
  if(S.sample){S.config=c;render();return;}
  await persist("config",{...c,id:"main"});
}
function writeError(err){return err?.message||"บันทึกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ";}

/* ---------- modals ---------- */
function openModal(content){ const s=$("scrim"); s.replaceChildren(content); s.hidden=false; const f=content.querySelector("input,select,button"); if(f) f.focus(); }
function closeModal(){ $("scrim").hidden=true; $("scrim").replaceChildren(); }
$("scrim").addEventListener("click",e=>{ if(e.target.id==="scrim") closeModal(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!$("scrim").hidden) closeModal(); });
function twoStepDelete(label,fn,err){
  const b=h("button",{class:"btn danger",type:"button",onclick:async()=>{
    if(!b.classList.contains("armed")){b.classList.add("armed");b.textContent="กดอีกครั้งเพื่อยืนยันลบ";return;}
    try{await fn();closeModal();toast(label);}catch(x){err.textContent=writeError(x);}
  }},"ลบ"); return b;
}
function levelPicker(obj){
  const hint=h("div",{class:"foot",style:"margin-top:6px"});
  const btns=levels().map(l=>h("button",{type:"button","data-k":String(l.key),"aria-pressed":String(+obj.level===l.key),
    style:`color:${l.key>=2?lvColor(l.key):"var(--accent)"}`,
    onclick:()=>{obj.level=l.key;btns.forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.k===l.key)));hint.textContent=l.hint;}},`${l.label} ${l.pct}%`));
  hint.textContent=levels()[(+obj.level||2)-1].hint;
  return h("div",null,h("div",{class:"flabel",text:"ความยากของงาน"}),h("div",{class:"types"},btns),hint);
}

function openEntry(existing,preset){
  if(!S.canWrite){toast("บัญชีนี้ดูข้อมูลได้อย่างเดียว");return;}
  const ms=activeMembers();
  const e=existing?{level:2,status:"plan",project:"",planId:"",...existing}:{id:uid(),memberId:(preset&&preset.memberId)||(ms[0]&&ms[0].id),type:"office",title:"",project:"",place:"",start:(preset&&preset.start)||S.sel,end:(preset&&preset.end)||S.sel,period:"full",note:"",level:2,status:"plan",planId:""};
  const fMember=h("select",{id:"f-member"},ms.map(m=>h("option",{value:m.id,selected:m.id===e.memberId},m.name)));
  const fTitle=h("input",{id:"f-title",type:"text",value:e.title||"",placeholder:"เช่น ถ่ายภาพพิธีรับปริญญา, เพิ่มหน้าอนุมัติผู้ใช้ใน BudgetFlowUP"});
  const fProject=h("input",{id:"f-project",type:"text",list:"projList-dl",value:e.project||"",placeholder:"เลือกหรือพิมพ์ชื่อระบบ / โครงการ"});
  const fPlace=h("input",{id:"f-place",type:"text",value:e.place||"",placeholder:"เช่น หอประชุมพญางำเมือง"});
  const fStart=h("input",{id:"f-start",type:"date",value:e.start});
  const fEnd=h("input",{id:"f-end",type:"date",value:e.end});
  const fPeriod=h("select",{id:"f-period"},Object.keys(PERIOD).map(k=>h("option",{value:k,selected:(e.period||"full")===k},PERIOD[k])));
  const fStatus=h("select",{id:"f-status"},Object.keys(STATUS).map(k=>h("option",{value:k,selected:(e.status||"plan")===k},STATUS[k])));
  const fPlan=h("select",{id:"f-plan"});
  function fillPlans(){ const be=fyBE(fStart.value||e.start); const cur=fPlan.value||e.planId;
    fPlan.replaceChildren(h("option",{value:""},"— ไม่ผูกกับแผนประจำปี —"),...plansOf(be).map(p=>h("option",{value:p.id,selected:p.id===cur},`${p.title}`+(memberById(p.ownerId)?` (${memberById(p.ownerId).name})`:""))));
    planLabel.firstChild.textContent=`อยู่ภายใต้แผนปีงบประมาณ ${be}`; }
  const planLabel=h("label",{class:"f"},"อยู่ภายใต้แผนปีงบประมาณ",fPlan);
  const fNote=h("textarea",{id:"f-note",placeholder:"ติดต่อได้ทางไหน ใครรับเรื่องแทน ฯลฯ"},e.note||"");
  const err=h("div",{class:"err",role:"alert"});
  fStart.addEventListener("change",()=>{ if(fEnd.value<fStart.value) fEnd.value=fStart.value; fillPlans(); });
  const workBlock=h("div",{style:"display:flex;flex-direction:column;gap:14px"},
    h("label",{class:"f"},"ระบบ / โครงการ (ถ้ามี)",fProject),
    levelPicker(e),
    h("div",{class:"row"},h("label",{class:"f"},"สถานะ",fStatus),planLabel));
  workBlock.hidden=e.type==="leave";
  const typeBtns=Object.keys(TYPES).map(k=>h("button",{type:"button","data-k":k,style:`color:var(--t-${k})`,"aria-pressed":String(e.type===k),
    onclick:()=>{e.type=k;typeBtns.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.k===k)));workBlock.hidden=k==="leave";}},TYPES[k].label));
  const save=h("button",{class:"btn primary",type:"submit"},"บันทึก");
  const form=h("form",{class:"modal",onsubmit:async ev=>{
    ev.preventDefault();
    Object.assign(e,{memberId:fMember.value,title:fTitle.value.trim(),project:fProject.value.trim(),place:fPlace.value.trim(),
      start:fStart.value,end:fEnd.value,period:fPeriod.value,note:fNote.value.trim(),status:fStatus.value,level:+e.level||2,planId:fPlan.value});
    if(!e.memberId){err.textContent="เลือกคนที่รับผิดชอบงานนี้";return;}
    if(!e.start||!e.end){err.textContent="ใส่วันเริ่มและวันสิ้นสุด";return;}
    if(e.end<e.start){err.textContent="วันสิ้นสุดต้องไม่ก่อนวันเริ่ม";return;}
    save.disabled=true;
    try{await saveEntry(e);closeModal();toast(existing?"แก้ไขแผนงานแล้ว":"ลงแผนงานแล้ว");S.sel=e.start;render();}
    catch(x){err.textContent=writeError(x);save.disabled=false;}
  }},
    h("h2",{text:existing?"แก้ไขแผนงาน":"ลงแผนงาน"}),
    h("label",{class:"f"},"ใคร",fMember),
    h("div",null,h("div",{class:"flabel",text:"ประเภท"}),h("div",{class:"types"},typeBtns)),
    h("label",{class:"f"},"งานอะไร",fTitle),
    workBlock,
    h("label",{class:"f"},"สถานที่",fPlace),
    h("div",{class:"row"},h("label",{class:"f"},"วันเริ่ม",fStart),h("label",{class:"f"},"ถึงวันที่",fEnd)),
    h("label",{class:"f"},"ช่วงเวลา",fPeriod),
    h("label",{class:"f"},"หมายเหตุ",fNote),
    err,
    h("div",{class:"m-foot"},existing?twoStepDelete("ลบแผนงานแล้ว",()=>deleteEntry(e.id,e._rev),err):null,
      h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:closeModal},"ยกเลิก"),save)));
  fillPlans();
  openModal(form);
}

function openPlan(existing){
  if(!S.canWrite){toast("บัญชีนี้ดูข้อมูลได้อย่างเดียว");return;}
  const ms=activeMembers(), cur=fyBE(todayISO());
  const p=existing?{level:2,status:"plan",progress:0,...existing}:{id:uid(),fy:S.planFY,title:"",ownerId:(ms[0]&&ms[0].id)||"",project:"",startM:0,endM:2,level:3,status:"plan",progress:0,target:"",note:""};
  const fTitle=h("input",{id:"p-title",type:"text",value:p.title||"",placeholder:"เช่น พัฒนาระบบ Job Description ระยะที่ 2"});
  const fOwner=h("select",{id:"p-owner"},h("option",{value:"",selected:!p.ownerId},"ทั้งทีม"),ms.map(m=>h("option",{value:m.id,selected:m.id===p.ownerId},m.name)));
  const fProject=h("input",{id:"p-project",type:"text",list:"projList-dl",value:p.project||"",placeholder:"เลือกหรือพิมพ์ชื่อระบบ / โครงการ"});
  const years=[...new Set([cur-1,cur,cur+1,cur+2,+p.fy])].sort((a,b)=>a-b);
  const fFy=h("select",{id:"p-fy"},years.map(y=>h("option",{value:String(y),selected:y===+p.fy},`ปีงบประมาณ ${y}`)));
  const monthOpts=sel=>[...Array(12)].map((_,i)=>h("option",{value:String(i),selected:i===sel},fmtMonLong.format(fromISO(fyMonth(+fFy.value||p.fy,i)[0]))));
  const fS=h("select",{id:"p-start"},monthOpts(+p.startM||0));
  const fE=h("select",{id:"p-end"},monthOpts(p.endM==null?+p.startM||0:+p.endM));
  fFy.addEventListener("change",()=>{const s=+fS.value,e=+fE.value;fS.replaceChildren(...monthOpts(s));fE.replaceChildren(...monthOpts(e));});
  fS.addEventListener("change",()=>{ if(+fE.value<+fS.value) fE.value=fS.value; });
  const fStatus=h("select",{id:"p-status"},Object.keys(STATUS).map(k=>h("option",{value:k,selected:(p.status||"plan")===k},STATUS[k])));
  const progOut=h("b",{class:"mono",style:"min-width:4ch;text-align:right",text:(+p.progress||0)+"%"});
  const fProg=h("input",{id:"p-progress",type:"range",min:"0",max:"100",step:"5",value:String(+p.progress||0),oninput:ev=>progOut.textContent=ev.target.value+"%"});
  fStatus.addEventListener("change",()=>{ if(fStatus.value==="done"){fProg.value="100";progOut.textContent="100%";} });
  const fTarget=h("input",{id:"p-target",type:"text",value:p.target||"",placeholder:"เช่น ใช้งานจริงครบ 4 งาน, ผู้ใช้ 50 คน, ลดเวลาอนุมัติเหลือ 1 วัน"});
  const fNote=h("textarea",{id:"p-note"},p.note||"");
  const err=h("div",{class:"err",role:"alert"});
  const save=h("button",{class:"btn primary",type:"submit"},"บันทึก");
  const form=h("form",{class:"modal",onsubmit:async ev=>{
    ev.preventDefault();
    Object.assign(p,{title:fTitle.value.trim(),ownerId:fOwner.value,project:fProject.value.trim(),fy:+fFy.value,startM:+fS.value,endM:+fE.value,
      status:fStatus.value,progress:+fProg.value,target:fTarget.value.trim(),note:fNote.value.trim(),level:+p.level||2});
    if(!p.title){err.textContent="ใส่ชื่อแผนงาน";return;}
    if(p.endM<p.startM){err.textContent="เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม";return;}
    save.disabled=true;
    try{await savePlan(p);S.planFY=p.fy;closeModal();toast(existing?"แก้ไขแผนประจำปีแล้ว":"เพิ่มแผนประจำปีแล้ว");render();}
    catch(x){err.textContent=writeError(x);save.disabled=false;}
  }},
    h("h2",{text:existing?"แก้ไขแผนประจำปี":"เพิ่มแผนประจำปี"}),
    h("label",{class:"f"},"ชื่อแผนงาน / โครงการ",fTitle),
    h("div",{class:"row"},h("label",{class:"f"},"ผู้รับผิดชอบ",fOwner),h("label",{class:"f"},"ระบบ / โครงการ",fProject)),
    h("label",{class:"f"},"ปีงบประมาณ",fFy),
    h("div",{class:"row"},h("label",{class:"f"},"เริ่มเดือน",fS),h("label",{class:"f"},"ถึงเดือน",fE)),
    levelPicker(p),
    h("div",{class:"row"},h("label",{class:"f"},"สถานะ",fStatus),h("label",{class:"f"},"ความคืบหน้า",h("div",{class:"range"},fProg,progOut))),
    h("label",{class:"f"},"เป้าหมาย / ตัวชี้วัด",fTarget),
    h("label",{class:"f"},"หมายเหตุ",fNote),
    err,
    h("div",{class:"m-foot"},existing?twoStepDelete("ลบแผนประจำปีแล้ว",()=>deletePlan(p.id,p._rev),err):null,
      h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:closeModal},"ยกเลิก"),save)));
  openModal(form);
}

function openMembers(){
  if(!S.canWrite){toast("บัญชีนี้ดูข้อมูลได้อย่างเดียว");return;}
  let list=S.members.map(m=>({...m})); const removed=[];
  const configRevision=S.config._rev;
  let min=+S.config.minInOffice||1;
  const box=h("div",{class:"mem-list"}), err=h("div",{class:"err",role:"alert"}), minVal=h("b",{text:String(min)});
  function draw(){
    box.replaceChildren(...list.map(m=>{
      const del=h("button",{class:"btn ghost",type:"button","aria-label":"ลบ "+(m.name||"สมาชิก"),onclick:()=>{
        if(!del.classList.contains("armed")){del.classList.add("armed","danger");del.textContent="ยืนยันลบ";return;}
        list=list.filter(x=>x!==m); removed.push(m); draw(); }},"ลบ");
      return h("div",{class:"mem"},
        h("button",{type:"button",class:"swatch",style:`background:${memberColor(m)}`,"aria-label":"เปลี่ยนสี",onclick:()=>{m.color=((m.color||0)+1)%COLORS.length;draw();}}),
        h("input",{id:"m-name-"+m.id,type:"text",value:m.name||"",placeholder:"ชื่อเล่น / ชื่อ",oninput:ev=>m.name=ev.target.value}),
        h("input",{id:"m-role-"+m.id,class:"role",type:"text",value:m.role||"",placeholder:"หน้าที่ เช่น ช่างภาพ, พัฒนาระบบ",oninput:ev=>m.role=ev.target.value}),
        del);
    }));
  }
  draw();
  const add=h("button",{class:"btn",type:"button",onclick:()=>{
    list.push({id:uid(),name:"",role:"",color:list.length%COLORS.length,order:list.length,active:true});draw();
    const ins=box.querySelectorAll("input[id^='m-name-']"); ins[ins.length-1].focus(); }},"+ เพิ่มคน");
  const save=h("button",{class:"btn primary",type:"submit"},"บันทึก");
  const form=h("form",{class:"modal",onsubmit:async ev=>{
    ev.preventDefault();
    if(list.some(m=>!String(m.name||"").trim())){err.textContent="กรุณากรอกชื่อสมาชิกทุกคน";return;}
    const keep=list;
    save.disabled=true;
    try{
      await saveTeam(keep,removed,min,configRevision);
      closeModal(); toast("บันทึกรายชื่อทีมแล้ว"); render();
    }catch(x){err.textContent=writeError(x);save.disabled=false;}
  }},
    h("h2",{text:"สมาชิกทีม"}),
    h("p",{class:"foot",style:"margin:0",text:"ลบคนออกจะลบแผนงานรายวันของคนนั้นด้วย"}),
    box,h("div",null,add),
    h("div",{style:"display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding-top:12px;border-top:1px solid var(--line)"},
      h("div",null,h("div",{style:"font-weight:500",text:"ต้องมีคนอยู่สำนักงานอย่างน้อย"}),h("div",{class:"foot",text:"วันทำการที่มีคนอยู่น้อยกว่านี้จะถูกเตือนสีแดง"})),
      h("div",{class:"stepper"},
        h("button",{class:"btn",type:"button","aria-label":"ลด",onclick:()=>{min=Math.max(1,min-1);minVal.textContent=min;}},"−"),
        minVal,h("span",{text:"คน"}),
        h("button",{class:"btn",type:"button","aria-label":"เพิ่ม",onclick:()=>{min=Math.min(20,min+1);minVal.textContent=min;}},"+"))),
    err,
    h("div",{class:"m-foot"},h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:closeModal},"ยกเลิก"),save)));
  openModal(form);
}

function openLevels(){
  if(!S.canWrite){toast("บัญชีนี้ดูข้อมูลได้อย่างเดียว");return;}
  const configAtOpen={...S.config};
  const lv=levels(); const vals=lv.map(l=>l.pct);
  const err=h("div",{class:"err",role:"alert"}), save=h("button",{class:"btn primary",type:"submit"},"บันทึก");
  const form=h("form",{class:"modal",onsubmit:async ev=>{
    ev.preventDefault();
    for(let i=0;i<4;i++){ if(!(vals[i]>=1&&vals[i]<=100)){err.textContent="ใส่ตัวเลข 1–100";return;} if(i&&vals[i]<vals[i-1]){err.textContent="ระดับที่ยากกว่าต้องมี % ไม่น้อยกว่าระดับก่อนหน้า";return;} }
    save.disabled=true;
    try{ await saveConfig({...configAtOpen,levels:vals.map(Number)}); closeModal(); toast("บันทึกน้ำหนักความยากแล้ว"); }
    catch(x){ err.textContent=writeError(x); save.disabled=false; }
  }},
    h("h2",{text:"ตั้งค่า % ความยากของงาน"}),
    h("p",{class:"foot",style:"margin:0",text:"กำหนดว่างานแต่ละระดับหนักแค่ไหนเมื่อเทียบกับงานยากมาก (100%) ใช้คิดคะแนนภาระของทุกคน ทั้งงานรายวันและแผนประจำปี"}),
    h("div",{class:"lv-edit"},lv.map((l,i)=>[lvTag(l),h("span",{class:"foot",text:l.hint}),
      h("label",{style:"display:flex;align-items:center;gap:4px"},h("input",{id:"lv-"+l.key,type:"number",min:"1",max:"100",value:String(l.pct),"aria-label":l.label+" เปอร์เซ็นต์",oninput:ev=>vals[i]=+ev.target.value}),"%")])),
    err,
    h("div",{class:"m-foot"},h("div",{class:"r"},h("button",{class:"btn ghost",type:"button",onclick:closeModal},"ยกเลิก"),save)));
  openModal(form);
}
$("btnLevels").addEventListener("click",()=>{ if(S.canWrite) openLevels(); else toast("ต้องมีสิทธิ์ลงแผนงานจึงจะแก้ค่านี้ได้"); });

/* ---------- copy summary ---------- */
function summaryText(){
  const d=S.sel, ms=activeMembers(), c=coverage(d);
  const lines=[`📋 ตารางงานทีมสื่อสารองค์กร ${fmtLong.format(fromISO(d))}`]; const inOffice=[], out=[];
  ms.forEach(m=>{
    const es=entriesOn(m.id,d), away=es.filter(e=>TYPES[e.type].away);
    if(!away.length||away.every(e=>e.period&&e.period!=="full")) inOffice.push(m.name+(away.length?` (${away.map(e=>e.period==="am"?"บ่าย":"เช้า").join("/")})`:""));
    es.forEach(e=>out.push(`• ${m.name}: ${TYPES[e.type].label}${e.title?" – "+e.title:""}${e.project?" ["+e.project+"]":""}${e.place?" @ "+e.place:""}${e.period&&e.period!=="full"?" ("+PERIOD[e.period]+")":""}`));
  });
  lines.push(`อยู่สำนักงาน: ${inOffice.length?inOffice.join(", "):"ไม่มี"}`);
  if(out.length){lines.push("แผนงาน:");lines.push(...out);}
  if(c.short) lines.push(`⚠️ คนเฝ้าสำนักงานน้อยกว่า ${c.min} คน`);
  return lines.join("\n");
}
function copyText(txt,okMsg){ try{ navigator.clipboard.writeText(txt).then(()=>toast(okMsg),()=>fallbackCopy(txt)); }catch(e){ fallbackCopy(txt); } }
function fallbackCopy(txt){
  const ta=h("textarea",{id:"copy-fallback",style:"width:100%;min-height:180px;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg)"},txt);
  openModal(h("div",{class:"modal"},h("h2",{text:"ข้อความสำหรับส่งต่อ"}),h("p",{class:"foot",style:"margin:0",text:"เลือกข้อความแล้วคัดลอกเอง"}),ta,
    h("div",{class:"m-foot"},h("div",{class:"r"},h("button",{class:"btn primary",type:"button",onclick:closeModal},"ปิด")))));
  ta.select();
}
$("btnCopy").addEventListener("click",()=>copyText(summaryText(),"คัดลอกแล้ว วางในกลุ่ม LINE ได้เลย"));

/* ---------- controls ---------- */
$("btnAdd").addEventListener("click",()=>openEntry(null));
$("btnMembers").addEventListener("click",openMembers);
function follow(){ if(S.sel<S.anchor||S.sel>addDays(S.anchor,S.span-1)) S.anchor=mondayOf(S.sel); }
$("dPrev").addEventListener("click",()=>{S.sel=addDays(S.sel,-1);follow();render();});
$("dNext").addEventListener("click",()=>{S.sel=addDays(S.sel,1);follow();render();});
$("dToday").addEventListener("click",()=>{S.sel=todayISO();S.anchor=mondayOf(S.sel);render();});
$("wPrev").addEventListener("click",()=>{S.anchor=addDays(S.anchor,-7);render();});
$("wNext").addEventListener("click",()=>{S.anchor=addDays(S.anchor,7);render();});
$("wToday").addEventListener("click",()=>{S.anchor=mondayOf(todayISO());render();});
document.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",()=>{S.span=+b.dataset.span;try{localStorage.setItem("cc-span",S.span)}catch(e){}render();}));


/* ---------- sample mode (examples, never stored) ---------- */
let liveCache=null;
function sampleData(){
  const m0=mondayOf(todayISO()), d=n=>addDays(m0,n), be=fyBE(todayISO()), cm=fyMonthIndex(todayISO());
  const members=[
    {id:"s1",name:"ตัวอย่าง ก.",role:"ช่างภาพ / วิดีโอ",color:0,order:0},
    {id:"s2",name:"ตัวอย่าง ข.",role:"กราฟิก / เพจ",color:1,order:1},
    {id:"s3",name:"ตัวอย่าง ค.",role:"เขียนข่าว / ประชาสัมพันธ์",color:2,order:2},
    {id:"s4",name:"ตัวอย่าง ง.",role:"พัฒนาระบบ / เว็บไซต์",color:6,order:3}];
  const plans=[
    {id:"p1",fy:be,title:"ระบบ Job Description ระยะที่ 2",ownerId:"s4",project:"ระบบ Job Description / คู่มือปฏิบัติงาน",startM:0,endM:5,level:4,status:"doing",progress:20,target:"รวมเล่มคู่มือปฏิบัติงานทั้งกอง"},
    {id:"p2",fy:be,title:"ย้ายระบบเอกสารไปใช้ Microsoft 365",ownerId:"s4",project:"dbf-document (ระบบจัดเก็บเอกสาร)",startM:1,endM:3,level:3,status:"plan",progress:0,target:"ผู้ใช้ทุกคนล็อกอินด้วยบัญชี @up.ac.th"},
    {id:"p3",fy:be,title:"วิดีโอแนะนำกองอาคารสถานที่",ownerId:"s1",project:"",startM:2,endM:4,level:3,status:"plan",progress:0,target:"เผยแพร่บนเพจและเว็บไซต์"},
    {id:"p4",fy:be,title:"อินโฟกราฟิกผลงานรายไตรมาส",ownerId:"s2",project:"",startM:0,endM:11,level:2,status:"doing",progress:Math.round((cm+1)/12*100/5)*5,target:"4 ชิ้นต่อปี"},
    {id:"p5",fy:be,title:"ข่าวประชาสัมพันธ์งานพิธีสำคัญ",ownerId:"s3",project:"",startM:0,endM:11,level:2,status:"doing",progress:15,target:"ข่าวครบทุกงานพิธี"}];
  const entries=[
    {id:"e1",memberId:"s1",type:"field",title:"ถ่ายภาพงานปรับปรุงภูมิทัศน์",place:"ถนนวงรอบมหาวิทยาลัย",start:d(1),end:d(1),period:"am",level:1,status:"done"},
    {id:"e2",memberId:"s1",type:"event",title:"งานพิธีวันสำคัญ",place:"หอประชุม",start:d(3),end:d(4),period:"full",level:4,status:"doing"},
    {id:"e3",memberId:"s3",type:"event",title:"ทำข่าวงานพิธี",place:"หอประชุม",start:d(3),end:d(3),period:"full",level:3,status:"plan",planId:"p5"},
    {id:"e4",memberId:"s2",type:"office",title:"ทำอินโฟกราฟิกประจำเดือน",place:"",start:d(0),end:d(2),period:"full",level:2,status:"doing",planId:"p4"},
    {id:"e5",memberId:"s2",type:"leave",title:"ลาพักผ่อน",place:"",start:d(3),end:d(3),period:"full"},
    {id:"e6",memberId:"s4",type:"meeting",title:"อบรมเว็บไซต์มหาวิทยาลัย",place:"ศูนย์เทคโนโลยีสารสนเทศ",start:d(3),end:d(3),period:"am",level:1,status:"plan"},
    {id:"e7",memberId:"s3",type:"field",title:"สัมภาษณ์งานสวนและภูมิทัศน์",place:"เรือนเพาะชำ",start:d(8),end:d(8),period:"pm",level:2,status:"plan"},
    {id:"e8",memberId:"s4",type:"dev",title:"หน้าเขียน JD รายบุคคล",project:"ระบบ Job Description / คู่มือปฏิบัติงาน",place:"",start:d(0),end:d(2),period:"full",level:4,status:"doing",planId:"p1"},
    {id:"e9",memberId:"s1",type:"office",title:"ตัดต่อวิดีโอแนะนำกอง",place:"",start:d(7),end:d(9),period:"full",level:3,status:"plan",planId:"p3"},
    {id:"e10",memberId:"s4",type:"dev",title:"ล็อกอิน Microsoft 365",project:"dbf-document (ระบบจัดเก็บเอกสาร)",place:"",start:d(7),end:d(8),period:"full",level:3,status:"plan",planId:"p2"},
    {id:"e11",memberId:"s3",type:"office",title:"เขียนข่าวประจำสัปดาห์",place:"",start:d(0),end:d(0),period:"am",level:1,status:"done",planId:"p5"},
    {id:"e12",memberId:"s4",type:"dev",title:"แก้รายงาน สขร.",project:"procu-plan (แผนจัดซื้อจัดจ้าง)",place:"",start:d(4),end:d(4),period:"full",level:2,status:"plan"}];
  return {members,entries,plans};
}
function enterSample(){
  liveCache={members:S.members,entries:S.entries,plans:S.plans,config:S.config,canWrite:S.canWrite};
  const sd=sampleData(); S.members=sd.members; S.entries=sd.entries; S.plans=sd.plans; S.config={minInOffice:1};
  S.sample=true; S.canWrite=true; S.sel=todayISO(); S.anchor=mondayOf(todayISO()); S.planFY=fyBE(todayISO()); render();
}
function exitSample(){
  if(!liveCache) return;
  Object.assign(S,{members:liveCache.members,entries:liveCache.entries,plans:liveCache.plans,config:liveCache.config,canWrite:liveCache.canWrite&&!S.offline});
  liveCache=null; S.sample=false; S.sel=todayISO(); render();
}

/* ---------- AI summary ---------- */
let aiCtl=null;
function aiPayload(first,last){
  const ms=activeMembers(), byId=Object.fromEntries(ms.map(m=>[m.id,m])), thd=s=>fmtLong.format(fromISO(s));
  const entries=S.entries.filter(e=>byId[e.memberId]&&e.end>=first&&e.start<=last).sort((a,b)=>a.start.localeCompare(b.start))
    .map(e=>({คน:byId[e.memberId].name,ประเภท:TYPES[e.type]?TYPES[e.type].label:e.type,นับว่าไม่อยู่สำนักงาน:!!(TYPES[e.type]&&TYPES[e.type].away),
      งาน:e.title||"",ระบบหรือโครงการ:e.project||"",สถานที่:e.place||"",ตั้งแต่:thd(e.start),ถึง:thd(e.end),ช่วงเวลา:PERIOD[e.period||"full"],
      ความยาก:e.type==="leave"?"-":`${levelOf(e).label} ${levelOf(e).pct}%`,สถานะ:e.type==="leave"?"-":STATUS[e.status||"plan"],หมายเหตุ:e.note||""}));
  const L=computeLoad(first,last);
  const load=L.rows.map(r=>({ชื่อ:r.m.name,จำนวนงาน:r.tasks,วันทำงาน:Math.round(r.days*10)/10,คะแนนภาระ:Math.round(r.score*10)/10,
    เปอร์เซ็นต์ของสโคปงานทีม:Math.round(r.share),ความยากเฉลี่ยเปอร์เซ็นต์:Math.round(r.avgDiff),งานเสร็จเปอร์เซ็นต์:Math.round(r.donePct),วันลา:r.leave,
    เทียบค่าเฉลี่ยทีม:{hi:"สูงกว่าเฉลี่ย",mid:"สมดุล",lo:"ต่ำกว่าเฉลี่ย",none:"ไม่มีงาน"}[r.flag]}));
  const projects=L.projects.map(p=>({ชื่อ:p.name,คะแนน:Math.round(p.score*10)/10,เปอร์เซ็นต์:L.total?Math.round(p.score/L.total*100):0,ผู้ทำ:[...p.people].join(", ")}));
  const fys=new Set([fyBE(first),fyBE(last)]);
  const plans=S.plans.filter(p=>fys.has(+p.fy)).map(p=>({ปีงบประมาณ:p.fy,แผน:p.title,ผู้รับผิดชอบ:memberById(p.ownerId)?memberById(p.ownerId).name:"ทั้งทีม",
    ระบบหรือโครงการ:p.project||"",ช่วงเดือน:`${fmtMonLong.format(fromISO(fyMonth(+p.fy,+p.startM||0)[0]))} – ${fmtMonLong.format(fromISO(fyMonth(+p.fy,p.endM==null?+p.startM||0:+p.endM)[0]))}`,
    ความยาก:`${levelOf(p).label} ${levelOf(p).pct}%`,สถานะ:STATUS[p.status||"plan"],ความคืบหน้า:(+p.progress||0)+"%",เป้าหมาย:p.target||"",วันทำงานที่ลงจริง:planActual(p).days}));
  const shortDays=[]; for(let i=0;i<=Math.min(400,diffDays(first,last));i++){const d=addDays(first,i);const c=coverage(d);
    if(c.short) shortDays.push({วัน:thd(d),อยู่สำนักงานช่วงเช้า:c.am,อยู่สำนักงานช่วงบ่าย:c.pm});}
  return {ช่วง:`${thd(first)} ถึง ${thd(last)}`,วันนี้:thd(todayISO()),สมาชิก:ms.map(m=>({ชื่อ:m.name,หน้าที่:m.role||""})),
    ขั้นต่ำคนอยู่สำนักงาน:+S.config.minInOffice||1,ระดับความยาก:levels().map(l=>`${l.label} ${l.pct}%`).join(", "),
    วิธีคิดคะแนนภาระ:"วันทำงาน × % ความยาก (ครึ่งวัน = 0.5 วัน) ไม่นับวันลา",
    สโคปงานรายบุคคล:load,แยกตามระบบหรือโครงการ:projects,แผนปีงบประมาณ:plans,แผนงานรายวัน:entries,วันทำการที่คนเฝ้าสำนักงานไม่พอ:shortDays.slice(0,60)};
}
const AI_STYLE={
  overview:"เขียนสรุปภาพรวมงานของทีมในช่วงนี้: งานหลักที่มี (จัดกลุ่มตามงาน/อีเวนต์/ระบบ ไม่ใช่ไล่ทีละรายการ), วันที่ทีมออกพื้นที่หนาแน่น, วันที่คนเฝ้าสำนักงานไม่พอ และข้อเสนอสั้น ๆ ว่าควรปรับใครหรือเตรียมอะไร",
  report:"เขียนเป็นรายงานผลการปฏิบัติงานของทีมสื่อสารองค์กรเสนอหัวหน้างาน ภาษาราชการสุภาพ แบ่งหัวข้อ: ภาพรวม, ผลงาน/ภารกิจที่ปฏิบัติ (จัดกลุ่มตามประเภทงานและระบบที่พัฒนา ระบุผู้รับผิดชอบและวันที่), ความคืบหน้าแผนปีงบประมาณ (ถ้ามี), การลาและการปฏิบัติงานนอกสถานที่, ข้อสังเกต ถ้าช่วงนี้ยังไม่ถึง ให้ใช้คำว่า 'แผนการปฏิบัติงาน' แทน 'ผลการปฏิบัติงาน'",
  line:"เขียนข้อความสั้นแจ้งทีมในกลุ่ม LINE แบบกันเอง อ่านง่ายบนมือถือ ไล่ตามวัน บอกว่าใครไปไหน ใครอยู่สำนักงาน และเตือนวันที่คนเฝ้าสำนักงานไม่พอ ใช้อีโมจิได้เล็กน้อย",
  person:"วิเคราะห์สโคปงานรายบุคคลตามความยากของงาน โดยใช้ตัวเลขใน 'สโคปงานรายบุคคล' และ 'แยกตามระบบหรือโครงการ' ตามที่ให้มา (ห้ามคำนวณใหม่): แต่ละคนถือสโคปงานกี่ % ของทีม ทำงานยากเฉลี่ยกี่ % ใครภาระสูงหรือต่ำกว่าเฉลี่ย ใครรับงานยากกระจุก แล้วเสนอการโยกงานที่เป็นรูปธรรมเพื่อให้ภาระสมดุลขึ้น",
  fyplan:"สรุปความคืบหน้าแผนปีงบประมาณ: แผนแต่ละรายการคืบหน้ากี่ % เทียบกับช่วงเดือนที่วางไว้ (ช้ากว่าแผน/ตามแผน/เร็วกว่าแผน โดยเทียบกับวันนี้), แผนไหนยังไม่มีการลงงานจริง, ใครถือแผนยากหลายรายการ และข้อเสนอสำหรับไตรมาสถัดไป"
};
async function runAI(){
  if(S.sample){toast("AI ใช้กับข้อมูลจริงหลังเข้าสู่ระบบ");return;}
  const [first,last,label]=loadRange($("ai-range").value);
  const style=$("ai-style").value, data=aiPayload(first,last);
  const out=$("aiOut"); out.hidden=false; out.className="ai-out wait"; out.textContent="กำลังสรุป…";
  $("aiMeta").hidden=true; $("aiGo").disabled=true; $("aiStop").hidden=false;
  if(aiCtl) aiCtl.abort(); aiCtl=new AbortController();
  const prompt=`คุณช่วยงานทีมสื่อสารองค์กร กองอาคารสถานที่ มหาวิทยาลัยพะเยา (ทีมนี้รวมงานพัฒนาระบบสารสนเทศของกองด้วย)
งาน: ${AI_STYLE[style]}
ช่วงที่สรุป: ${label} (${data.ช่วง}) ปีงบประมาณนับ 1 ต.ค. ถึง 30 ก.ย.

กติกา:
- ใช้เฉพาะข้อมูลด้านล่าง ห้ามแต่งงานหรือรายละเอียดที่ไม่มีในข้อมูล
- ถ้าไม่มีแผนงานในช่วงนี้ ให้บอกตรง ๆ ว่ายังไม่มีการลงแผนงาน
- คนที่ไม่มีแผนงานในวันทำการถือว่าอยู่สำนักงาน วันเสาร์-อาทิตย์เป็นวันหยุด
- ประเภท "งานในสำนักงาน" และ "พัฒนาระบบ" ยังนับว่าอยู่สำนักงาน
- เขียนเป็นภาษาไทย ข้อความธรรมดา ใช้บรรทัดหัวข้อและ "•" นำหน้ารายการ ห้ามใช้ markdown เช่น # หรือ **
- กระชับ ไม่เกินประมาณ 300 คำ

ข้อมูล (JSON):
${JSON.stringify(data)}`;
  try{
    const r=await api.summarize(prompt,aiCtl.signal);
    out.className="ai-out"; out.textContent=r.text||"ไม่ได้รับข้อความสรุป ลองกดสรุปอีกครั้ง";
    $("aiMeta").hidden=false;
    $("aiNote").textContent=`${label} · ${data.แผนงานรายวัน.length} แผนงาน`+(r.truncated?" · ข้อความถูกตัดเพราะยาวเกิน":"");
  }catch(err){
    const code=err&&err.code;
    if(code==="not_granted"){ $("aiPanel").querySelector(".ai-ctrl").hidden=true; out.hidden=true; $("aiOff").hidden=false; }
    else if(code==="rate_limited"){ out.className="ai-out wait"; out.textContent="ใช้ฟีเจอร์สรุปถี่เกินไป รอสักครู่แล้วลองใหม่"; }
    else if((err&&err.name==="AbortError")||code==="aborted"){ out.className="ai-out wait"; out.textContent=((err&&err.text)||out.textContent)+"\n\n(หยุดแล้ว)"; }
    else { out.className="ai-out wait"; out.textContent=err.message||"สรุปไม่สำเร็จ กรุณาลองอีกครั้ง"; }
  }finally{ $("aiGo").disabled=false; $("aiStop").hidden=true; aiCtl=null; }
}
$("aiGo").addEventListener("click",runAI);
$("aiStop").addEventListener("click",()=>{ if(aiCtl) aiCtl.abort(); });
$("aiCopy").addEventListener("click",()=>copyText($("aiOut").textContent,"คัดลอกแล้ว"));

/* ---------- sign-in and synchronization ---------- */
let refreshing=false,lastSync=null,poll=null,authEpoch=0;
function renderConnection(){
  $("syncText").textContent=S.sample?"โหมดทดลอง · ไม่บันทึกข้อมูล":S.offline?"การเชื่อมต่อขัดข้อง · แสดงข้อมูลที่โหลดไว้ล่าสุด":S.live?`เชื่อมต่อ Supabase · ${S.canWrite?"แก้ไขได้":"ดูข้อมูล"}${lastSync?" · "+lastSync.toLocaleTimeString("th-TH"):""}`:"ยังไม่เชื่อมต่อ";
  $("btnExport").hidden=!S.live||S.sample;
}
async function refreshData(){
  if(refreshing||S.sample)return;
  refreshing=true;const epoch=authEpoch;
  try{
    const data=await api.snapshot();
    if(epoch!==authEpoch)return;
    if(!data.role){const err=new Error("ยังไม่ได้รับสิทธิ์เข้าใช้ กรุณาติดต่อผู้ดูแลระบบ");err.status=403;throw err;}
    const withRev=rows=>rows.map(r=>({...r.data,id:r.id,_rev:r.revision}));
    S.members=withRev(data.members);S.entries=withRev(data.entries);S.plans=withRev(data.plans);
    const cfg=data.config[0];S.config=cfg?{...cfg.data,_rev:cfg.revision}:{minInOffice:1};
    S.canWrite=["editor","admin"].includes(data.role); S.live=true;S.offline=false;S.connecting=false;
    lastSync=new Date();$("authGate").hidden=true;$("root").hidden=false;render();
  }catch(err){if(epoch!==authEpoch)return;S.offline=true;S.canWrite=false;S.connecting=false;render();if([401,403].includes(err.status))gate(err.message);throw err;}
  finally{refreshing=false;}
}
function gate(message=""){
  authEpoch++;
  if(poll)clearInterval(poll);poll=null;
  S.sample=false;liveCache=null;S.members=[];S.entries=[];S.plans=[];S.config={minInOffice:1};S.live=false;S.canWrite=false;
  $("root").hidden=true;$("authGate").hidden=false;$("authError").textContent=message;
}
async function connect(){
  await refreshData();
  if(poll)clearInterval(poll);
  poll=setInterval(()=>{if(!document.hidden&&!S.sample)refreshData().catch(err=>{
    if(err.status===401)logout();
  });},30000);
}
async function logout(){
  if(aiCtl)aiCtl.abort();
  gate();
  try{await api.logout();}catch{}finally{closeModal();$("aiOut").textContent="";$("aiOut").hidden=true;gate();}
}
$("loginForm").addEventListener("submit",async event=>{
  event.preventDefault();const button=$("loginButton");button.disabled=true;$("authError").textContent="กำลังเข้าสู่ระบบ…";
  try{await api.login($("email").value.trim(),$("password").value);$("password").value="";await connect();}
  catch(err){gate(err.message);}
  finally{button.disabled=false;}
});
$("btnLogout").addEventListener("click",()=>S.sample?gate():logout());
$("btnRefresh").addEventListener("click",()=>refreshData().catch(err=>toast(err.message)));
$("btnDemo").addEventListener("click",()=>{
  S.connecting=false;S.offline=false;enterSample();$("authGate").hidden=true;$("root").hidden=false;
});
$("btnExitSample").addEventListener("click",()=>{exitSample();if(S.live)refreshData().catch(err=>toast(err.message));else gate();});
$("btnExport").addEventListener("click",()=>{
  const clean=x=>{const {_rev,...data}=x;return data;};
  const blob=new Blob([JSON.stringify({at:new Date().toISOString(),members:S.members.map(clean),entries:S.entries.map(clean),plans:S.plans.map(clean),config:clean(S.config)},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`media-team-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
// Exiting demo must restore read/write state before the next real refresh.
render();gate();
if(!api.configured){$("authError").textContent="กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_PUBLISHABLE_KEY ใน config.js ก่อนใช้งานจริง";$("loginButton").disabled=true;}
else if(api.hasSession){connect().catch(err=>gate(err.message));}
