import { status } from '../../server/domain.js';
export const packingStages=['unscheduled','scheduled','ready','in_transit','delivered'];
export const priorityRank={urgent:0,high:1,normal:2};
export function packingProgress(listId,units,loads,now=Date.now()){
  const rows=units.filter(u=>u.packing_list_id===listId),counts=Object.fromEntries(packingStages.map(s=>[s,0]));
  const pending=u=>!['in_transit','delivered'].includes(status(u));
  for(const u of rows)counts[status(u)]++;
  const queues={noCarrier:rows.filter(u=>pending(u)&&!u.carrier),noLoad:rows.filter(u=>pending(u)&&!u.load_id),noEtd:rows.filter(u=>pending(u)&&!u.etd),pickupDue:rows.filter(u=>pending(u)&&u.etd&&Date.parse(u.etd)<now),overdue:rows.filter(u=>status(u)!=='delivered'&&u.eta&&Date.parse(u.eta)<now),missingActual:rows.filter(u=>status(u)==='delivered'&&!u.ata||status(u)==='in_transit'&&!u.atd),noRoute:rows.filter(u=>pending(u)&&(!u.origin||!u.destination))};
  const carriers=new Map();
  for(const u of rows){const key=(u.carrier||'').toLowerCase();if(!carriers.has(key))carriers.set(key,{name:u.carrier||'No carrier assigned',units:[],counts:Object.fromEntries(packingStages.map(s=>[s,0]))});const c=carriers.get(key);c.units.push(u);c.counts[status(u)]++;}
  const byLoad=new Map(),loadTotals=new Map();
  for(const u of rows)if(u.load_id){if(!byLoad.has(u.load_id))byLoad.set(u.load_id,[]);byLoad.get(u.load_id).push(u);}
  for(const u of units)if(u.load_id)loadTotals.set(u.load_id,(loadTotals.get(u.load_id)||0)+1);
  const loadGroups=loads.flatMap(load=>{const members=byLoad.get(load.id)||[];return members.length?[{load,units:members,totalAssigned:loadTotals.get(load.id)||0}]:[];});
  const schedule=new Map();
  for(const u of rows)for(const field of ['etd','eta']){
    if(field==='etd'?!pending(u):status(u)==='delivered')continue;
    if(!u[field]||Date.parse(u[field])<now)continue;
    const key=`${field}:${u.load_id||u.id}:${u[field]}`;
    if(!schedule.has(key))schedule.set(key,{field,date:u[field],loadRef:u.load_ref||'',units:[]});schedule.get(key).units.push(u);
  }
  const actuals=rows.flatMap(u=>['atd','ata'].filter(f=>u[f]).map(field=>({field,date:u[field],unit:u}))).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  return {units:rows,counts,queues,carriers:[...carriers.values()],loads:loadGroups,schedule:[...schedule.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)),actuals,total:rows.length,pending:rows.filter(pending).length,departed:rows.filter(u=>u.atd||u.ata).length,arrived:rows.filter(u=>u.ata).length,deliveredPercent:rows.length?Math.round(counts.delivered/rows.length*100):0,noMovement:!!rows.length&&!counts.in_transit&&!counts.delivered};
}
