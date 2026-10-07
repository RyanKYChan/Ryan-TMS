import { status } from './domain.js';
export function loadStatus(load,units){
  const members=units.filter(u=>u.load_id===load.id);
  if(!members.length)return status({...load,reference:''});
  const stages=members.map(status);
  if(stages.every(s=>s==='delivered'))return 'delivered';
  if(stages.some(s=>['in_transit','delivered'].includes(s)))return 'in_transit';
  if(stages.every(s=>s==='ready'))return 'ready';
  return 'scheduled';
}
export function operationalLoads(loads,units){
  const ids=new Set(units.map(u=>u.load_id).filter(Boolean));
  return loads.filter(l=>ids.has(l.id)||l.notes!=='Created from carrier sheet groups');
}
export function scheduleChanges(old,update){
  return ['etd','eta'].flatMap(field=>{
    if(!old[field]||!update[field]||Date.parse(old[field])===Date.parse(update[field]))return [];
    return [{field,before:old[field],after:update[field],deltaMinutes:(Date.parse(update[field])-Date.parse(old[field]))/60000}];
  });
}
