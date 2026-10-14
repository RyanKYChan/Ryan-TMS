export const exportColumns=[
  ['vin','VIN'],['brand','Brand'],['model','Model'],['reference','Reference'],['source_status','Sheet status'],
  ['notes','Comments'],['pol_country','POL-COUNTRY'],['origin','POL-CITY'],['pol_zipcode','POL-ZIPCODE'],['pol_address','POL-ADDRESS'],
  ['pod_country','POD-COUNTRY'],['destination','POD-CITY'],['pod_zipcode','POD-ZIPCODE'],['pod_address','POD-ADDRESS'],['dealer','Dealer name'],
  ['etd','ETD'],['atd','ATD'],['eta','ETA'],['ata','ATA'],['carrier','Carrier'],['truck','Truck plate'],['t1','T1'],
  ['load_ref','Load'],['packing_list','Packing list'],['status','Operational status'],['price','Price(EUR)'],['revenue','Unit revenue (EUR)'],
];
export const carrierFields=exportColumns.filter(([f])=>!['price','revenue','status','packing_list'].includes(f)).map(([f])=>f);
export const announcementFields=['load_ref','vin','model','carrier','truck','etd','origin','destination','reference'];
const stages={unscheduled:'Unscheduled',scheduled:'Scheduled',ready:'Ready to go',in_transit:'In transit',delivered:'Delivered'};
export function exportDate(value,timeZone,iso=false){
  if(!value)return '';
  if(iso)return new Date(value).toISOString();
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export function exportMatrix(units,fields,{timeZone='Europe/Amsterdam',isoDates=false,headers=true,groupLoads=false}={}){
  const valid=new Set(exportColumns.map(([f])=>f));
  if(!fields.length||new Set(fields).size!==fields.length||fields.some(f=>!valid.has(f)))throw new Error('Choose unique export columns.');
  const rows=headers?[fields.map(f=>exportColumns.find(([key])=>key===f)[1])]:[];
  const groups=new Map();
  for(const u of units){const key=groupLoads?(u.load_id||''):'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u);}
  // Built loads are separated; the unbuilt pool stays together at the end.
  const ordered=[...groups].filter(([id])=>id);if(groups.has(''))ordered.push(['',groups.get('')]);
  for(let i=0;i<ordered.length;i++){
    if(i&&groupLoads)rows.push(fields.map(()=>''));
    for(const u of ordered[i][1])rows.push(fields.map(f=>['etd','eta','atd','ata'].includes(f)?exportDate(u[f],timeZone,isoDates):f==='status'?(stages[u.status]||u.status||''):String(u[f]??'')));
  }
  return rows;
}
const safe=value=>(/^[\s]*[=+@-]/.test(String(value))||/^0\d+$|^\d{16,}$/.test(String(value)))?"'"+value:String(value);
export function matrixText(matrix,delimiter='\t'){
  return matrix.map(row=>row.map(value=>{const s=safe(value);return /["\r\n]/.test(s)||s.includes(delimiter)?'"'+s.replaceAll('"','""')+'"':s;}).join(delimiter)).join('\r\n');
}
const escape=s=>safe(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replace(/\r?\n/g,'<br>');
export function matrixHtml(matrix,headers=true){
  const row=(values,tag)=>`<tr>${values.map(v=>`<${tag} style="border:1px solid #dce3df;padding:6px 10px;text-align:left;white-space:pre-wrap">${escape(v)}</${tag}>`).join('')}</tr>`;
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px">${headers&&matrix.length?`<thead>${row(matrix[0],'th')}</thead>`:''}<tbody>${matrix.slice(headers?1:0).map(r=>row(r,'td')).join('')}</tbody></table>`;
}
export function exportFilename(name,kind='carrier'){
  const clean=String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'export';
  return `${kind}-${clean}.csv`;
}
