import express from 'express';
import { randomUUID } from 'node:crypto';
import { FIELDS, cleanVin, validateVin, validateUnit, status, exportCsv } from './domain.js';
import { transaction } from './db.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  const now = () => new Date().toISOString();
  const fail = (message, code = 400) => { const e = new Error(message); e.status = code; throw e; };
  const project = id => db.prepare('SELECT * FROM projects WHERE id=?').get(id) || fail('Project not found.',404);
  const event = (p, u, description) => db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(randomUUID(),p,u,description,now());
  const text = (v, max=500) => typeof v === 'string' && v.length <= max ? v.trim() : fail(`Text must be at most ${max} characters.`);
  const count = (v,min,max) => Number.isInteger(v) && v>=min && v<=max ? v : fail(`Enter a whole number between ${min} and ${max}.`);
  const units = p => db.prepare(`SELECT u.*, pl.name AS packing_list, l.reference AS load_ref FROM units u
    LEFT JOIN packing_lists pl ON pl.id=u.packing_list_id LEFT JOIN loads l ON l.id=u.load_id
    WHERE u.project_id=? ORDER BY u.created_at, u.vin`).all(p).map(u=>({...u,status:status(u)}));
  const unitById = (p,id) => db.prepare('SELECT * FROM units WHERE project_id=? AND id=?').get(p,id) || fail('Unit not found.',404);
  const loadById = (p,id) => db.prepare('SELECT * FROM loads WHERE project_id=? AND id=?').get(p,id) || fail('Load not found.',404);
  app.get('/api/health', (_req,res) => { db.prepare('SELECT 1').get(); res.json({ok:true}); });
  app.get('/api/projects', (_req,res) => res.json(db.prepare('SELECT * FROM projects ORDER BY created_at').all()));
  app.post('/api/projects', (req,res) => {
    const name = text(req.body.name,100); if (!name) fail('Project name is required.');
    const p = {id:randomUUID(),name,customer:text(req.body.customer ?? '',100),target:count(req.body.target ?? 400,1,100000),created_at:now()};
    db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(p.id,p.name,p.customer,p.target,p.created_at);
    res.status(201).json(p);
  });
  app.get('/api/projects/:p/workspace', (req,res) => {
    const p=project(req.params.p);
    res.json({project:p,units:units(p.id),loads:db.prepare('SELECT * FROM loads WHERE project_id=? ORDER BY created_at DESC').all(p.id),
      packingLists:db.prepare('SELECT * FROM packing_lists WHERE project_id=? ORDER BY created_at DESC').all(p.id),
      events:db.prepare('SELECT * FROM events WHERE project_id=? ORDER BY created_at DESC LIMIT 50').all(p.id)});
  });
  app.get('/api/projects/:p/export', (req,res) => {
    project(req.params.p);
    res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="units.csv"').send(exportCsv(units(req.params.p)));
  });
  app.post('/api/projects/:p/import', (req,res) => {
    const p=project(req.params.p).id;
    const name=text(req.body.packingList,100); if (!name) fail('Packing list name is required.');
    const rows=req.body.rows; if(!Array.isArray(rows) || !rows.length || rows.length>10000) fail('Paste between 1 and 10,000 rows.');
    const seen=new Set();
    const normalized=rows.map((row,i) => {
      if (!row || typeof row!=='object') fail(`Row ${i+1} is invalid.`);
      const u={};
      for (const f of FIELDS) if (row[f] !== undefined && row[f] !== '') u[f]=text(row[f],f==='notes'?2000:500);
      u.vin=cleanVin(u.vin); const error=validateVin(u.vin); if(error) fail(`Row ${i+1}: ${error}`);
      if(seen.has(u.vin)) fail(`Row ${i+1}: duplicate VIN ${u.vin}.`); seen.add(u.vin);
      const old=db.prepare('SELECT * FROM units WHERE project_id=? AND vin=?').get(p,u.vin);
      const timesError=validateUnit({...old,...u}); if(timesError) fail(`Row ${i+1}: ${timesError}`);
      return {u,old};
    });
    const result=transaction(db,()=>{
      let list=db.prepare('SELECT * FROM packing_lists WHERE project_id=? AND name=?').get(p,name);
      if(!list) { list={id:randomUUID()}; db.prepare('INSERT INTO packing_lists VALUES(?,?,?,?)').run(list.id,p,name,now()); }
      let added=0,updated=0;
      for(const {u,old} of normalized) {
        if(old) {
          const entries=Object.entries(u).filter(([f])=>f!=='vin');
          db.prepare(`UPDATE units SET packing_list_id=?,updated_at=?${entries.map(([f])=>`,${f}=?`).join('')} WHERE id=?`)
            .run(list.id,now(),...entries.map(([,v])=>v),old.id);
          event(p,old.id,`Updated from packing list ${name}`); updated++;
        } else {
          const id=randomUUID(), t=now();
          db.prepare(`INSERT INTO units(id,project_id,${FIELDS.join(',')},packing_list_id,created_at,updated_at) VALUES(${Array(FIELDS.length+5).fill('?').join(',')})`)
            .run(id,p,...FIELDS.map(f=>u[f]??''),list.id,t,t);
          event(p,id,`Imported ${u.vin} from ${name}`); added++;
        }
      }
      return {added,updated};
    });
    res.status(201).json(result);
  });
  app.patch('/api/projects/:p/units/:id', (req,res) => {
    const p=project(req.params.p).id,old=unitById(p,req.params.id), update={};
    for(const f of FIELDS) if(req.body[f] !== undefined) update[f]=text(req.body[f],f==='notes'?2000:500);
    if(update.vin) {update.vin=cleanVin(update.vin); const e=validateVin(update.vin); if(e)fail(e);}
    if(update.vin==='')fail('VIN is required.');
    const e=validateUnit({...old,...update}); if(e)fail(e);
    const entries=Object.entries(update); if(!entries.length)fail('No fields to update.');
    transaction(db,()=>{
      db.prepare(`UPDATE units SET ${entries.map(([f])=>`${f}=?`).join(',')},updated_at=? WHERE id=?`).run(...entries.map(([,v])=>v),now(),old.id);
      event(p,old.id,`Updated ${old.vin}: ${entries.filter(([f,v])=>old[f]!==v).map(([f])=>f.toUpperCase()).join(', ') || 'details saved'}`);
    });
    res.json(unitById(p,old.id));
  });
  const validateLoad = body => {
    const l={}; for(const f of ['reference','carrier','truck','driver','origin','destination','etd','eta','notes']) l[f]=text(body[f] ?? '',f==='notes'?2000:100);
    if(!l.reference)fail('Load reference is required.');
    l.capacity=count(body.capacity ?? 8,1,500); const e=validateUnit(l);if(e)fail(e);return l;
  };
  app.post('/api/projects/:p/loads', (req,res) => {
    const p=project(req.params.p).id,l=validateLoad(req.body),id=randomUUID();
    db.prepare('INSERT INTO loads VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,p,l.reference,l.carrier,l.truck,l.driver,l.capacity,l.origin,l.destination,l.etd,l.eta,l.notes,now());
    event(p,null,`Created load ${l.reference}`);res.status(201).json(loadById(p,id));
  });
  app.patch('/api/projects/:p/loads/:id', (req,res) => {
    const p=project(req.params.p).id,old=loadById(p,req.params.id),l=validateLoad({...old,...req.body});
    if(db.prepare('SELECT count(*) AS n FROM units WHERE load_id=?').get(old.id).n>l.capacity)fail('Capacity cannot be lower than the number of assigned units.');
    const assigned=db.prepare('SELECT * FROM units WHERE load_id=?').all(old.id);
    for(const u of assigned) {const e=validateUnit({...u,etd:l.etd,eta:l.eta});if(e)fail(e);}
    transaction(db,()=>{
      const entries=Object.entries(l);
      db.prepare(`UPDATE loads SET ${entries.map(([f])=>`${f}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),old.id);
      db.prepare('UPDATE units SET origin=?,destination=?,etd=?,eta=?,carrier=?,truck=?,updated_at=? WHERE load_id=?').run(l.origin,l.destination,l.etd,l.eta,l.carrier,l.truck,now(),old.id);
      event(p,null,`Updated load ${l.reference} and its assigned units`);
    });res.json(loadById(p,old.id));
  });
  app.post('/api/projects/:p/loads/:id/assign', (req,res) => {
    const p=project(req.params.p).id,l=loadById(p,req.params.id),ids=req.body.unitIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)fail('Select unique units to assign.');
    const us=ids.map(id=>unitById(p,id));
    if(us.some(u=>u.load_id || ['in_transit','delivered'].includes(status(u))))fail('Only units without a load or actual departure/arrival can be assigned.');
    if(db.prepare('SELECT count(*) AS n FROM units WHERE load_id=?').get(l.id).n+ids.length>l.capacity)fail('Selected units exceed load capacity.');
    for(const u of us) {const e=validateUnit({...u,etd:l.etd,eta:l.eta});if(e)fail(e);}
    transaction(db,()=>{for(const u of us){
      db.prepare('UPDATE units SET load_id=?,origin=?,destination=?,etd=?,eta=?,carrier=?,truck=?,updated_at=? WHERE id=?').run(l.id,l.origin||u.origin,l.destination||u.destination,l.etd,l.eta,l.carrier||u.carrier,l.truck||u.truck,now(),u.id);
      event(p,u.id,`Assigned ${u.vin} to ${l.reference}`);
    }});res.json({assigned:ids.length});
  });
  app.post('/api/projects/:p/units/:id/unassign', (req,res) => {
    const p=project(req.params.p).id,u=unitById(p,req.params.id);
    if(['in_transit','delivered'].includes(status(u)))fail('A departed or delivered unit cannot be removed from its load.');
    transaction(db,()=>{db.prepare('UPDATE units SET load_id=NULL,etd=?,eta=?,updated_at=? WHERE id=?').run('','',now(),u.id);event(p,u.id,`Removed ${u.vin} from load; planned dates cleared`);});res.json({ok:true});
  });
  app.post('/api/projects/:p/loads/:id/milestone', (req,res) => {
    const p=project(req.params.p).id,l=loadById(p,req.params.id),field=req.body.field;
    if(!['atd','ata'].includes(field))fail('Choose ATD or ATA.');
    const value=text(req.body.value,100),us=db.prepare('SELECT * FROM units WHERE load_id=?').all(l.id);
    if(!value)fail('Milestone date and time are required.');
    if(!us.length)fail('Assign units before recording a milestone.');
    const pending=us.filter(u=>!u[field]); if(!pending.length)fail('This milestone is already recorded for all units.');
    if(field==='atd'&&pending.some(u=>u.ata))fail('A delivered unit is missing ATD. Edit its departure individually.');
    for(const u of pending){const e=validateUnit({...u,[field]:value});if(e)fail(e);}
    transaction(db,()=>{for(const u of pending){db.prepare(`UPDATE units SET ${field}=?,updated_at=? WHERE id=?`).run(value,now(),u.id);event(p,u.id,`${field==='atd'?'Departed':'Delivered'} on load ${l.reference}`);}});
    res.json({updated:pending.length});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));
  app.use((e,_req,res,_next)=>{
    if(e.code==='ERR_SQLITE_ERROR' && /UNIQUE constraint/.test(e.message))return res.status(409).json({error:'This VIN, packing list, or load reference already exists in the project.'});
    const s=e.status || 500;
    if(s===500)console.error(e);
    res.status(s).json({error:s===500?'Unexpected server error. Please retry.':e.message});
  });
  return app;
}
