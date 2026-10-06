import { randomUUID, createHash } from 'node:crypto';
import { FIELDS, cleanVin, validateVin, validateUnit, status } from './domain.js';
import { transaction } from './db.js';

export function ensureCarrier(db, projectId, name) {
  const canonical=name.trim();
  const old=db.prepare('SELECT * FROM carriers WHERE project_id=? AND name=? COLLATE NOCASE').get(projectId,canonical);
  if(old)return old;
  const c={id:randomUUID(),project_id:projectId,name:canonical,created_at:new Date().toISOString()};
  db.prepare('INSERT INTO carriers VALUES(?,?,?,?)').run(c.id,c.project_id,c.name,c.created_at);
  return c;
}
const same=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
const common=(rows,field)=>rows.length&&rows.every(u=>u[field]===rows[0][field])?rows[0][field]||'':'';
const summaryFields=['origin','destination','etd','eta','truck'];

export function registerCarrierRoutes(app,db,{project,units,unitById,event,fail,text,now}) {
  const carrierById=(p,id)=>db.prepare('SELECT * FROM carriers WHERE project_id=? AND id=?').get(p,id)||fail('Carrier not found.',404);
  app.post('/api/projects/:p/carriers',(req,res)=>{
    const p=project(req.params.p).id,name=text(req.body.name,100);
    if(!name)fail('Carrier name is required.');
    res.status(201).json(ensureCarrier(db,p,name));
  });
  app.post('/api/projects/:p/carriers/:id/assign',(req,res)=>{
    const p=project(req.params.p).id,c=carrierById(p,req.params.id),ids=req.body.unitIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail('Select between 1 and 10,000 unique vehicles.');
    const selected=ids.map(id=>unitById(p,id));
    for(const u of selected){
      if(same(u.carrier,c.name))continue;
      if(u.load_id)fail(`${u.vin} already belongs to a load. Change the load's carrier or remove this vehicle from the load first.`);
      if(['in_transit','delivered'].includes(status(u)))fail(`${u.vin} has already departed or arrived. Correct its carrier in the vehicle details.`);
    }
    let assigned=0;
    transaction(db,()=>{for(const u of selected){
      if(u.carrier===c.name)continue;
      db.prepare('UPDATE units SET carrier=?,updated_at=? WHERE id=?').run(c.name,now(),u.id);
      event(p,u.id,`Assigned ${u.vin} to carrier ${c.name}`);assigned++;
    }});
    res.json({assigned,unchanged:ids.length-assigned});
  });

  // Both preview and apply run this planner against saved data; the preview fingerprint
  // prevents a later paste from silently overwriting changes made after review.
  function plan(p,c,body){
    const saved=units(p),loads=db.prepare('SELECT * FROM loads WHERE project_id=? ORDER BY created_at,id').all(p);
    const snapshot=createHash('sha256').update(JSON.stringify({saved,loads})).digest('hex');
    const incoming=body.rows;
    if(!Array.isArray(incoming)||!incoming.length||incoming.length>10000)fail('Paste between 1 and 10,000 rows.');
    if(typeof body.groupLoads!=='boolean')fail('Choose whether to apply load groups.');
    const byVin=new Map(saved.map(u=>[u.vin,u])),seen=new Set();
    const planned=incoming.map((r,i)=>{
      if(!r||typeof r!=='object')fail(`Row ${i+1} is invalid.`);
      const vin=cleanVin(r.vin),error=validateVin(vin);if(error)fail(`Row ${i+1}: ${error}`);
      if(seen.has(vin))fail(`Row ${i+1}: duplicate VIN ${vin}.`);seen.add(vin);
      const old=byVin.get(vin);if(!old)fail(`${vin} is not in this project's packing lists. Import it before updating a carrier.`);
      if(!same(old.carrier,c.name))fail(`${vin} is not assigned to ${c.name}. Assign it from the unit register first.`);
      const update={};
      for(const f of FIELDS){
        if(f==='vin'||r[f]===undefined||r[f]==='')continue;
        const value=text(r[f],f==='notes'?2000:500);
        if(!value)continue;
        if(f==='carrier') {if(!same(value,c.name))fail(`${vin}: the pasted carrier does not match ${c.name}.`);continue;}
        if(old[f]!==value)update[f]=value;
      }
      const e=validateUnit({...old,...update});if(e)fail(`${vin}: ${e}`);
      return {old,update,group:body.groupLoads?text(r.group??'',100):'',reference:body.groupLoads?text(r.load_reference??'',100):''};
    });
    const grouped=new Map();
    for(const r of planned){
      const key=r.reference?`ref:${r.reference.toLowerCase()}`:r.group?`gap:${r.group}`:'';
      if(!key)continue;
      if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);
    }
    const usedRefs=new Set(loads.map(l=>l.reference.toLowerCase())),usedLoads=new Set(),groups=[];
    const occurrences=new Map();
    for(const members of grouped.values())for(const id of new Set(members.map(r=>r.old.load_id).filter(Boolean)))occurrences.set(id,(occurrences.get(id)||0)+1);
    let number=1;
    for(const members of grouped.values()){
      if(members.length>500)fail('A load group can have at most 500 vehicles. Add gaps or load references to divide this group.');
      const requested=members[0].reference;
      const memberIds=new Set(members.map(r=>r.old.id));
      let load=requested?loads.find(l=>same(l.reference,requested)):loads.find(l=>{
        if(!same(l.carrier,c.name)||usedLoads.has(l.id))return false;
        const existing=saved.filter(u=>u.load_id===l.id);
        return existing.length===members.length&&existing.every(u=>memberIds.has(u.id));
      });
      // A smaller daily paste can still belong to one saved load. Only split that
      // load when its VINs now appear in more than one proposed group.
      if(!requested&&!load){
        const previous=[...new Set(members.map(r=>r.old.load_id).filter(Boolean))];
        if(previous.length===1&&occurrences.get(previous[0])===1){
          const candidate=loads.find(l=>l.id===previous[0]);
          if(candidate&&same(candidate.carrier,c.name)&&!usedLoads.has(candidate.id))load=candidate;
        }
      }
      if(load&&!same(load.carrier,c.name))fail(`Load ${load.reference} belongs to another carrier. Use a different load reference.`);
      let reference=load?.reference||requested;
      if(!reference){do{reference=`${c.name.slice(0,60)} · ${String(number++).padStart(3,'0')}`;}while(usedRefs.has(reference.toLowerCase()));}
      if(!load&&usedRefs.has(reference.toLowerCase()))fail(`Load reference ${reference} is already used by another proposed group.`);
      usedRefs.add(reference.toLowerCase());if(load)usedLoads.add(load.id);
      for(const r of members){
        if(r.old.load_id&&r.old.load_id!==load?.id&&['in_transit','delivered'].includes(status(r.old)))fail(`${r.old.vin} has departed or arrived on ${r.old.load_ref}. Its load cannot be changed by a paste. Turn off load grouping to update its dates.`);
      }
      const outsiders=load?saved.filter(u=>u.load_id===load.id&&!memberIds.has(u.id)):[];
      if(outsiders.some(u=>!same(u.carrier,c.name)))fail(`Load ${reference} contains vehicles assigned to another carrier. Correct those assignments first.`);
      const g={reference,loadId:load?.id||null,new:!load,unitCount:members.length,vins:members.map(r=>r.old.vin)};
      groups.push(g);for(const r of members)r.loadGroup=g;
    }
    for(const g of groups.filter(g=>!g.new)){
      const l=loads.find(l=>l.id===g.loadId);
      const count=saved.filter(u=>{
        const r=planned.find(r=>r.old.id===u.id);
        return (r?.loadGroup?r.loadGroup.loadId:u.load_id)===g.loadId;
      }).length;
      if(count>l.capacity)fail(`Group ${g.reference} exceeds its capacity of ${l.capacity}. Increase its capacity in Load builds first.`);
    }
    const rows=planned.map(r=>{
      const before=r.old.load_ref||'',after=r.loadGroup?.reference||before;
      const changes=Object.entries(r.update).map(([field,after])=>({field,before:r.old[field]||'',after}));
      if(before!==after)changes.push({field:'load',before,after});
      return {vin:r.old.vin,unitId:r.old.id,changes,beforeStatus:status(r.old),afterStatus:status({...r.old,...r.update,load_id:r.loadGroup?true:r.old.load_id}),loadBefore:before,loadAfter:after};
    });
    return {planned,groups,rows,snapshot,counts:{matched:rows.length,changed:rows.filter(r=>r.changes.length).length,unchanged:rows.filter(r=>!r.changes.length).length,loadsCreated:groups.filter(g=>g.new).length,loadMoves:rows.filter(r=>r.loadBefore&&r.loadBefore!==r.loadAfter).length}};
  }
  app.post('/api/projects/:p/carriers/:id/updates/preview',(req,res)=>{
    const p=project(req.params.p).id,c=carrierById(p,req.params.id),result=plan(p,c,req.body);
    const {planned,...review}=result;res.json(review);
  });
  app.post('/api/projects/:p/carriers/:id/updates',(req,res)=>{
    const p=project(req.params.p).id,c=carrierById(p,req.params.id);
    const result=transaction(db,()=>{
      const result=plan(p,c,req.body);
      if(req.body.snapshot!==result.snapshot)fail('Saved data changed since your preview. Review the paste again before applying it.',409);
      const {planned,groups,rows,counts}=result,t=now();
      for(const g of groups){
        if(!g.new)continue;
        g.loadId=randomUUID();
        const members=planned.filter(r=>r.loadGroup===g).map(r=>({...r.old,...r.update}));
        db.prepare('INSERT INTO loads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(g.loadId,p,g.reference,c.name,common(members,'truck'),'',members.length,common(members,'origin'),common(members,'destination'),common(members,'etd'),common(members,'eta'),'Created from carrier sheet groups',t);
        event(p,null,`Created load ${g.reference} from ${c.name}'s sheet`);
      }
      const affectedLoads=new Set();
      for(let i=0;i<planned.length;i++){
        const r=planned[i];
        if(!rows[i].changes.length)continue;
        if(r.loadGroup)r.update.load_id=r.loadGroup.loadId;
        const entries=Object.entries(r.update);
        db.prepare(`UPDATE units SET ${entries.map(([f])=>`${f}=?`).join(',')},updated_at=? WHERE id=?`).run(...entries.map(([,v])=>v),t,r.old.id);
        if(r.old.load_id)affectedLoads.add(r.old.load_id);if(r.loadGroup)affectedLoads.add(r.loadGroup.loadId);
        event(p,r.old.id,`Carrier sheet ${c.name}: ${rows[i].changes.map(change=>`${change.field.toUpperCase()} ${change.before||'blank'} → ${change.after}`).join('; ')}`);
      }
      // A load heading can show a date only when all its members share that date.
      for(const id of affectedLoads){
        const members=db.prepare('SELECT * FROM units WHERE load_id=?').all(id);
        if(!members.length)continue;
        db.prepare(`UPDATE loads SET ${summaryFields.map(f=>`${f}=?`).join(',')} WHERE id=?`).run(...summaryFields.map(f=>common(members,f)),id);
      }
      db.prepare('INSERT INTO carrier_updates VALUES(?,?,?,?,?,?,?)').run(randomUUID(),p,c.id,counts.matched,counts.changed,counts.loadsCreated,t);
      event(p,null,`${c.name} sheet checked: ${counts.changed} changed of ${counts.matched} VINs; ${counts.loadsCreated} new loads`);
      return counts;
    });res.json(result);
  });
}
