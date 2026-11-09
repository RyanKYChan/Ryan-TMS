import { createHash } from 'node:crypto';
import { transaction } from './db.js';
export const packingListSummary=list=>({...list,snapshot:createHash('sha256').update(JSON.stringify(list)).digest('hex')});
export function registerPackingListRoutes(app,db,{project,text,fail,event}){
  const find=(p,id)=>db.prepare('SELECT * FROM packing_lists WHERE project_id=? AND id=?').get(p,id)||fail('Packing list not found.',404);
  app.get('/api/projects/:p/packing-lists/:id',(req,res)=>res.json(packingListSummary(find(project(req.params.p).id,req.params.id))));
  app.patch('/api/projects/:p/packing-lists/:id',(req,res)=>{
    const p=project(req.params.p).id;
    const updated=transaction(db,()=>{
      const list=find(p,req.params.id),body=req.body||{},update={};
      if(body.snapshot!==packingListSummary(list).snapshot)fail('Packing-list details changed. Reload the saved details before applying your changes.',409);
      const allowed=['priority','planning_state','objective','hold_reason','next_action','review_date'];
      if(Object.keys(body).some(f=>!allowed.includes(f)&&f!=='snapshot'))fail('Only packing-list planning details can be edited here.');
      for(const f of allowed){
        if(body[f]===undefined)continue;
        const value=text(body[f],['objective','hold_reason','next_action'].includes(f)?2000:20);
        if(f==='priority'&&!['normal','high','urgent'].includes(value))fail('Choose Normal, High or Urgent priority.');
        if(f==='planning_state'&&!['active','on_hold'].includes(value))fail('Choose Open or On hold.');
        if(f==='review_date'&&value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))fail('Enter a valid review date.');
        if(list[f]!==value)update[f]=value;
      }
      if({...list,...update}.planning_state==='on_hold'&&!String(update.hold_reason??list.hold_reason).trim())fail('Add a reason before putting this packing list on hold.');
      const changes=Object.entries(update);
      if(changes.length){
        db.prepare(`UPDATE packing_lists SET ${changes.map(([f])=>`${f}=?`).join(',')} WHERE id=? AND project_id=?`).run(...changes.map(([,v])=>v),list.id,p);
        event(p,null,`Packing list ${list.name}: ${changes.map(([f,v])=>`${f.replaceAll('_',' ')}: ${list[f]||'blank'} → ${v||'blank'}`).join('; ')}`,null,list.id);
      }
      return packingListSummary(find(p,list.id));
    });res.json(updated);
  });
  app.get('/api/projects/:p/packing-lists/:id/activity',(req,res)=>{
    const p=project(req.params.p).id,list=find(p,req.params.id);
    res.json(db.prepare(`SELECT e.*,u.vin FROM events e LEFT JOIN units u ON u.id=e.unit_id
      WHERE e.project_id=? AND (e.packing_list_id=? OR (e.packing_list_id IS NULL AND u.packing_list_id=?))
      ORDER BY e.created_at DESC,e.rowid DESC LIMIT 30`).all(p,list.id,list.id));
  });
}
