// Shared by the paste preview and tests. Relative dates use the operator's local day.
const aliases={truck:['truck','truckplate','plate','registration','truckregistration'],trailer:['trailer','trailerplate','trailerregistration'],driver:['driver','drivername','name'],driver_phone:['phone','driverphone','telephone']};
const key=s=>s.toLowerCase().replace(/[^a-z]/g,'');
const plate=s=>/^[a-z0-9][a-z0-9.-]{2,19}$/i.test(s)&&/\d/.test(s);
const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function arrivalNote(notes,today){
  const candidates=[];
  for(const line of notes){
    if(!/\b(arriv\w*|yard)\b/i.test(line))continue;
    let date='';
    if(/\btomorrow\b/i.test(line)&&validDay(today)){const next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);}
    else if(/\btoday\b/i.test(line)&&validDay(today))date=today;
    else{const iso=line.match(/\b(\d{4}-\d{2}-\d{2})\b/),eu=line.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);date=iso?.[1]|| (eu?`${eu[3]}-${eu[2].padStart(2,'0')}-${eu[1].padStart(2,'0')}`:'');}
    const time=line.match(/\b(?:by|before|till|until)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i);
    if(validDay(date))candidates.push({date,time:time?`${time[1].padStart(2,'0')}:${time[2]}`:''});
  }
  const unique=[...new Map(candidates.map(c=>[JSON.stringify(c),c])).values()];
  return {arrival:unique.length===1?unique[0]:null,ambiguous:unique.length>1};
}
export function parseTruckPaste(input,today){
  const rows=[],unparsed=[],warnings=[];let headers=null;
  for(const [index,raw] of input.replace(/\r\n?/g,'\n').split('\n').entries()){
    const line=raw.replace(/\u00a0/g,' ').trim();if(!line)continue;
    const cells=line.split('\t').map(s=>s.trim());
    const mapping=cells.map(s=>Object.keys(aliases).find(f=>aliases[f].includes(key(s))));
    if(cells.length>1&&mapping.includes('truck')){headers=mapping;continue;}
    let row;
    if(headers&&cells.length>1){row={truck:'',trailer:'',driver:'',driver_phone:''};headers.forEach((field,i)=>{if(field)row[field]=cells[i]||'';});
      const pair=row.truck.split(/\s*\/\s*/);if(pair.length===2){row.truck=pair[0];row.trailer ||= pair[1];}
      if(!row.truck&&!row.driver)row=null;
    }else{
      const match=line.match(/^(\S+?)(?:\s*\/\s*(\S+))?(?:\s+(.+))?$/);
      if(match&&plate(match[1])&&(!match[2]||plate(match[2])))row={truck:match[1],trailer:match[2]||'',driver:match[3]||'',driver_phone:''};
    }
    if(row){row.truck=row.truck.toUpperCase();row.trailer=row.trailer.toUpperCase();rows.push({...row,line:index+1});}
    else unparsed.push({line:index+1,text:line});
  }
  const seen=new Set();for(const row of rows){const id=(row.truck||row.driver).toUpperCase();if(seen.has(id))warnings.push(`Duplicate truck / driver ${id} on line ${row.line}. Remove or correct it before booking.`);seen.add(id);}
  const {arrival,ambiguous}=arrivalNote(unparsed.map(r=>r.text),today);
  if(ambiguous)warnings.push('The message has conflicting arrival dates or deadlines. Set the shared arrival fields yourself.');
  return {rows,notes:unparsed.map(r=>r.text).join('\n'),unparsed,warnings,arrival};
}
