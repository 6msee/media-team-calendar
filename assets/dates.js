export function fiscalYear(iso){const [y,m]=iso.split('-').map(Number);return y+(m>=10?1:0)+543;}
export function fiscalRange(be){const y=Number(be)-543;return [`${y-1}-10-01`,`${y}-09-30`];}
export function workDays(start,end,period='full'){
  const first=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');
  let days=0;
  for(let d=first;d<=last;d.setUTCDate(d.getUTCDate()+1)){if(![0,6].includes(d.getUTCDay()))days++;}
  return days*(period==='full'||!period?1:0.5);
}
