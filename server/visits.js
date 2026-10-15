import { randomUUID, createHash } from 'node:crypto';
import { transaction } from './db.js';
import { ensureCarrier } from './carriers.js';
import { visitMatrix } from './visit-domain.js';
import { matrixText } from '../client/src/sheet-export.js';
import { FIELDS, cleanVin, validateVin, validateUnit, validTimestamp } from './domain.js';
export const VISIT_STATUSES=['planned','announced','arrived','completed','cancelled'];
const signatureFields=['carrier_id','reference','truck','trailer','driver','driver_phone','yard','pickup_date','pickup_time','slot_end','container','booking_reference','expected_units','destination','etd','eta','time_zone'];
export function announcementSignature(v){return createHash('sha256').update(JSON.stringify([...signatureFields,...(v.yard_arrival_date||v.yard_arrival_time?['yard_arrival_date','yard_arrival_time']:[])].map(f=>['etd','eta'].includes(f)&&v[f]?new Date(v[f]).toISOString():v[f]??''))).digest('hex');}
export function visitSummary(v){const signature=announcementSignature(v),ready=!!((v.pickup_date||v.yard_arrival_date)&&v.yard&&(v.truck||v.driver));return {...v,announcement_signature:signature,announcement_ready:ready,needs_announcement:['planned','announced','arrived'].includes(v.status)&&signature!==v.announced_signature,needs_reannouncement:['planned','announced','arrived'].includes(v.status)&&!!v.announced_at&&signature!==v.announced_signature};}
export function registerVisitRoutes(app,db,{project,event,fail,text,now}){
  const stripping=p=>{const value=project(p);if(value.project_type!=='stripping')fail('Truck visits belong to container-stripping projects.');return value;};
  const visit=(p,id)=>db.prepare('SELECT v.*,c.name AS carrier FROM truck_visits v JOIN carriers c ON c.id=v.carrier_id WHERE v.project_id=? AND v.id=?').get(p,id)||fail('Truck visit not found.',404);
  const carrier=(p,id)=>db.prepare('SELECT * FROM carriers WHERE project_id=? AND id=?').get(p,id)||fail('Carrier not found.',404);
  const asset=(p,id)=>db.prepare('SELECT * FROM project_trucks WHERE project_id=? AND id=?').get(p,id)||fail('Saved truck not found.',404);
  const amount=value=>value===null||value===''?null:Number.isInteger(value)&&value>=0&&value<=100000?value:fail('Unit quantities must be whole numbers from 0 to 100,000, or blank.');
  function truckData(body){const value={};for(const f of ['truck','trailer','driver','driver_phone','notes'])value[f]=text(body[f]??'',f==='notes'?2000:100);value.truck=value.truck.toUpperCase();value.trailer=value.trailer.toUpperCase();return value;}
  function saveTruck(p,c,data,id){
    if(!data.truck&&!data.driver)fail('Enter a truck plate or driver name for the truck bank.');
    const existing=id?asset(p,id):data.truck?db.prepare('SELECT * FROM project_trucks WHERE project_id=? AND carrier_id=? AND truck=? COLLATE NOCASE').get(p,c,data.truck):db.prepare('SELECT * FROM project_trucks WHERE project_id=? AND carrier_id=? AND truck=\'\' AND driver=? COLLATE NOCASE').get(p,c,data.driver);
    if(existing){if(existing.carrier_id!==c)fail('The saved truck belongs to a different carrier.');db.prepare(`UPDATE project_trucks SET ${Object.keys(data).map(f=>`${f}=?`).join(',')},updated_at=? WHERE id=?`).run(...Object.values(data),now(),existing.id);return existing.id;}
    const key=randomUUID(),t=now();db.prepare('INSERT INTO project_trucks(id,project_id,carrier_id,truck,trailer,driver,driver_phone,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key,p,c,data.truck,data.trailer,data.driver,data.driver_phone,data.notes,t,t);return key;
  }
  app.patch('/api/projects/:p/carriers/:id/contact',(req,res)=>{
    const p=stripping(req.params.p).id,c=carrier(p,req.params.id),update={};for(const f of ['contact_name','contact_phone','contact_email','notes'])if(req.body[f]!==undefined)update[f]=text(req.body[f],f==='notes'?2000:200);
    if(!Object.keys(update).length)fail('Enter carrier contact details.');transaction(db,()=>{db.prepare(`UPDATE carriers SET ${Object.keys(update).map(f=>`${f}=?`).join(',')} WHERE id=?`).run(...Object.values(update),c.id);event(p,null,`Updated carrier contact: ${c.name}`);});res.json(carrier(p,c.id));
  });
  app.get('/api/projects/:p/visits/export',(req,res)=>{const p=stripping(req.params.p).id,visits=db.prepare('SELECT v.*,c.name AS carrier FROM truck_visits v JOIN carriers c ON c.id=v.carrier_id WHERE v.project_id=? ORDER BY v.pickup_date,v.pickup_time,v.created_at').all(p);res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="truck-visits.csv"').send('\uFEFF'+matrixText(visitMatrix(visits,undefined,{includeTime:true,isoDates:true}),','));});
  app.post('/api/projects/:p/trucks',(req,res)=>{
    const p=stripping(req.params.p).id,c=carrier(p,req.body.carrier_id),data=truckData(req.body);
    const id=transaction(db,()=>{const id=saveTruck(p,c.id,data);event(p,null,`Saved truck / driver for ${c.name}: ${data.truck||data.driver}`);return id;});res.status(201).json(asset(p,id));
  });
  app.patch('/api/projects/:p/trucks/:id',(req,res)=>{
    const p=stripping(req.params.p).id,old=asset(p,req.params.id),data=truckData({...old,...req.body});
    if(req.body.carrier_id!==undefined&&req.body.carrier_id!==old.carrier_id)fail('Create a separate truck-bank entry for another carrier.');
    transaction(db,()=>{saveTruck(p,old.carrier_id,data,old.id);event(p,null,`Updated truck bank: ${data.truck||data.driver}. Existing visits retained their saved details.`);});res.json(asset(p,old.id));
  });
  function validate(body,old,p){
    const value={};for(const f of ['reference','truck','trailer','driver','driver_phone','yard','pickup_date','pickup_time','slot_end','container','booking_reference','notes','destination','etd','eta','atd','ata','time_zone','yard_arrival_date','yard_arrival_time'])value[f]=text(body[f]??old?.[f]??(f==='yard'?p.yard:f==='destination'?p.destination:f==='time_zone'?'Europe/Amsterdam':''),f==='notes'?2000:['yard','destination'].includes(f)?500:100);
    const milestoneError=validateUnit(value);if(milestoneError)fail(milestoneError);
    try{new Intl.DateTimeFormat('en-GB',{timeZone:value.time_zone});}catch{fail('Choose a valid planning timezone.');}
    if(value.etd){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:value.time_zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value.etd)).map(p=>[p.type,p.value]));const day=`${parts.year}-${parts.month}-${parts.day}`;if(body.etd!==undefined&&body.pickup_time===undefined&&value.pickup_time)value.pickup_time=`${parts.hour}:${parts.minute}`;if(value.pickup_time&&value.pickup_time!==`${parts.hour}:${parts.minute}`)fail('ETD and pickup time must agree in the planning timezone.');if(body.pickup_date===undefined)value.pickup_date=day;else if(value.pickup_date!==day)fail('ETD and pickup date must describe the same day in the planning timezone.');}
    if(value.pickup_date){const d=value.pickup_date;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)fail('Choose a valid pickup date.');}
    for(const f of ['pickup_time','slot_end'])if(value[f]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value[f]))fail('Pickup slot times must use HH:mm.');
    if(value.pickup_time&&!value.pickup_date)fail('Set a pickup date before adding a time.');if(value.slot_end&&!value.pickup_time)fail('Set a slot start time before adding its end.');if(value.slot_end&&value.slot_end<value.pickup_time)fail('Slot end must be on or after the start on the pickup date.');
    if(value.yard_arrival_date){const d=value.yard_arrival_date;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)fail('Choose a valid yard-arrival date.');}
    if(value.yard_arrival_time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.yard_arrival_time))fail('Yard-arrival deadline must use HH:mm.');
    if(value.yard_arrival_time&&!value.yard_arrival_date)fail('Set a yard-arrival date before its deadline time.');
    value.truck=value.truck.toUpperCase();value.trailer=value.trailer.toUpperCase();
    value.expected_units=amount(body.expected_units===undefined?old?.expected_units??null:body.expected_units);value.actual_units=amount(body.actual_units===undefined?old?.actual_units??null:body.actual_units);
    value.status=body.status??old?.status??'planned';if(!VISIT_STATUSES.includes(value.status))fail('Choose a valid truck-visit status.');
    if(!old&&value.status==='announced')fail('Create the visit, then prepare and confirm its announcement.');
    if(old&&value.status==='announced'&&old.status!=='announced')fail('Use Mark as announced after preparing the announcement.');
    if(value.status==='cancelled'&&(value.atd||value.ata))fail('A departed or delivered pickup cannot be cancelled. Correct the milestones or create a separate replacement visit.');
    if(value.atd||value.ata)value.status='completed';
    for(const f of ['arrived_at','completed_at']){value[f]=text(body[f]??old?.[f]??'',100);if(value[f]&&!validTimestamp(value[f]))fail('Actual milestones need valid dates and times with a timezone.');}
    if(['arrived','completed'].includes(value.status)&&!value.arrived_at)value.arrived_at=now();if(value.status==='completed'&&!value.completed_at)value.completed_at=now();
    if(value.arrived_at&&value.completed_at&&Date.parse(value.completed_at)<Date.parse(value.arrived_at))fail('Completion cannot be before arrival.');
    if(value.status==='completed'&&!value.atd&&!value.ata)value.atd=now();
    const dateError=validateUnit(value);if(dateError)fail(dateError);
    if(value.actual_units!==null&&value.status!=='completed')fail('Record actual units when the visit is completed.');
    if(old&&['arrived','completed','cancelled'].includes(old.status)&&value.status!==old.status){const allowed=(old.status==='arrived'&&['completed','cancelled'].includes(value.status))||(old.status==='cancelled'&&value.status==='planned'&&!old.atd&&!old.ata);if(!allowed)fail('A closed or arrived visit cannot be moved back to planning.');}
    if(['arrived','completed'].includes(value.status)&&(!(value.pickup_date||value.yard_arrival_date)||!value.yard||(!value.truck&&!value.driver)))fail('Add a date, yard and truck plate or driver before recording arrival.');
    return value;
  }
  function persist(p,body,old=null){
    if(body.save_truck!==undefined&&typeof body.save_truck!=='boolean')fail('Choose whether to save the truck for reuse.');
    const value=validate(body,old,p);
    const carrierId=body.carrier_id??old?.carrier_id,newName=carrierId==='new'?text(body.carrier_name??'',100):'';
    if(carrierId==='new'&&!newName)fail('Enter the carrier name.');if(carrierId!=='new')carrier(p.id,carrierId);
    let truckId=body.truck_id===undefined?old?.truck_id??null:body.truck_id||null;
    if(truckId){const truck=asset(p.id,truckId);if(truck.carrier_id!==carrierId)fail('Choose a truck from the selected carrier.');}

    value.carrier_id=carrierId==='new'?ensureCarrier(db,p.id,newName).id:carrierId;
    if(!value.reference){if(old)fail('Visit reference is required.');let n=db.prepare('SELECT count(*) AS n FROM truck_visits WHERE project_id=?').get(p.id).n+1;do{value.reference=`VIS-${String(n++).padStart(4,'0')}`;}while(db.prepare('SELECT id FROM truck_visits WHERE project_id=? AND reference=?').get(p.id,value.reference));}
    if(body.save_truck&&(value.truck||value.driver))truckId=saveTruck(p.id,value.carrier_id,{truck:value.truck,trailer:value.trailer,driver:value.driver,driver_phone:value.driver_phone,notes:truckId?asset(p.id,truckId).notes:''},truckId);
    value.truck_id=truckId;const t=now(),key=old?.id||randomUUID();
    const linked=old?db.prepare('SELECT * FROM units WHERE truck_visit_id=? AND project_id=?').all(old.id,p.id):[];
    const plans=linked.map(u=>{const update={};for(const [from,to] of [['truck','truck'],['etd','etd'],['eta','eta'],['yard','origin'],['destination','destination']])if(old[from]!==value[from])update[to]=value[from];if(old.carrier_id!==value.carrier_id)update.carrier=db.prepare('SELECT name FROM carriers WHERE id=?').get(value.carrier_id).name;for(const f of ['atd','ata'])if(!u[f]&&value[f])update[f]=value[f];const error=validateUnit({...u,...update});if(error)fail(`${u.vin}: ${error}`);return {u,update};});

    if(old){db.prepare(`UPDATE truck_visits SET ${Object.keys(value).map(f=>`${f}=?`).join(',')},updated_at=? WHERE id=?`).run(...Object.values(value),t,key);const changed=Object.keys(value).filter(f=>old[f]!==value[f]);event(p.id,null,`Truck visit ${value.reference}: ${changed.map(f=>`${f}: ${old[f]??'blank'} → ${value[f]??'blank'}`).join('; ')||'details saved'}${old.announced_at&&announcementSignature({...old,...value})!==old.announced_signature?'; needs re-announcement':''}`,key);}
    else{const entries={id:key,project_id:p.id,...value,created_at:t,updated_at:t};db.prepare(`INSERT INTO truck_visits(${Object.keys(entries).join(',')}) VALUES(${Object.keys(entries).map(()=>'?').join(',')})`).run(...Object.values(entries));event(p.id,null,`Truck visit planned: ${value.reference} · ${value.truck||value.driver||'Identity TBC'}`,key);}
    for(const {u,update} of plans)if(Object.keys(update).length)db.prepare(`UPDATE units SET ${Object.keys(update).map(f=>`${f}=?`).join(',')},updated_at=? WHERE id=?`).run(...Object.values(update),t,u.id);
    return key;
  }
  function write(req,res,editing){
    const p=stripping(req.params.p),old=editing?visit(p.id,req.params.id):null;
    const id=transaction(db,()=>persist(p,req.body,old));res.status(editing?200:201).json(visitSummary(visit(p.id,id)));
  }

  app.post('/api/projects/:p/visits/bulk',(req,res)=>{
    const p=stripping(req.params.p),{rows,common,request_id:requestId}=req.body;
    if(typeof requestId!=='string'||!requestId.trim()||requestId.length>100)fail('A batch request ID is required.');
    if(!Array.isArray(rows)||!rows.length||rows.length>500)fail('Review between 1 and 500 trucks before booking.');
    if(!common||typeof common!=='object'||Array.isArray(common))fail('Choose the shared booking details.');
    const hash=createHash('sha256').update(JSON.stringify({common,rows})).digest('hex');
    const result=transaction(db,()=>{
      const previous=db.prepare('SELECT * FROM visit_batches WHERE project_id=? AND request_id=?').get(p.id,requestId);
      if(previous){if(previous.payload_hash!==hash)fail('This batch ID was already used with different details. Review the batch again.',409);return {visits:JSON.parse(previous.visit_ids).map(id=>visitSummary(visit(p.id,id))),replayed:true};}
      const ids=[],seen=new Set();
      for(const [i,row] of rows.entries()){
        if(!row||typeof row!=='object'||Array.isArray(row))fail(`Truck ${i+1}: check the pasted details.`);
        const identity={};for(const f of ['truck','trailer','driver','driver_phone'])identity[f]=text(row[f]??'',100);
        if(!identity.truck&&!identity.driver)fail(`Truck ${i+1}: enter a truck plate or driver.`);
        const key=(identity.truck||identity.driver).toUpperCase();if(seen.has(key))fail(`Truck ${i+1}: duplicate truck / driver ${key}.`);seen.add(key);
        const body={...common,...identity,status:'planned',actual_units:null,atd:'',ata:'',reference:'',truck_id:null};
        const id=persist(p,body),created=visit(p.id,id),day=created.pickup_date||created.yard_arrival_date;
        const duplicate=db.prepare("SELECT reference FROM truck_visits WHERE project_id=? AND carrier_id=? AND id<>? AND status<>'cancelled' AND truck=? COLLATE NOCASE AND coalesce(nullif(pickup_date,''),yard_arrival_date)=?").get(p.id,created.carrier_id,id,created.truck,day);
        if(created.truck&&duplicate)fail(`${created.truck} is already booked in ${duplicate.reference} for this date. Edit that visit or remove this row from the batch.`,409);
        ids.push(id);
      }
      db.prepare('INSERT INTO visit_batches(project_id,request_id,payload_hash,visit_ids,created_at) VALUES(?,?,?,?,?)').run(p.id,requestId,hash,JSON.stringify(ids),now());
      return {visits:ids.map(id=>visitSummary(visit(p.id,id))),replayed:false};
    });res.status(result.replayed?200:201).json(result);
  });
  app.post('/api/projects/:p/visits',(req,res)=>write(req,res,false));app.patch('/api/projects/:p/visits/:id',(req,res)=>write(req,res,true));

  app.get('/api/projects/:p/visits/:id/events',(req,res)=>{const p=stripping(req.params.p).id,v=visit(p,req.params.id);res.json(db.prepare('SELECT * FROM events WHERE project_id=? AND truck_visit_id=? ORDER BY created_at DESC,rowid DESC').all(p,v.id));});
  app.post('/api/projects/:p/visits/:id/vins',(req,res)=>{
    const p=stripping(req.params.p),v=visit(p.id,req.params.id),rows=req.body.rows;
    if(v.status==='cancelled')fail('Reactivate the visit or choose an active visit before attaching VINs.');
    if(!Array.isArray(rows)||!rows.length||rows.length>10000)fail('Paste between 1 and 10,000 VINs.');
    const seen=new Set(),plan=rows.map((row,i)=>{
      if(!row||typeof row!=='object')fail(`Row ${i+1} is invalid.`);const update={};for(const f of FIELDS)if(row[f]!==undefined&&row[f]!=='')update[f]=text(row[f],f==='notes'?2000:500);
      update.vin=cleanVin(update.vin);const error=validateVin(update.vin);if(error)fail(`Row ${i+1}: ${error}`);if(seen.has(update.vin))fail(`Duplicate VIN ${update.vin}.`);seen.add(update.vin);
      const old=db.prepare('SELECT * FROM units WHERE project_id=? AND vin=?').get(p.id,update.vin);if(old?.load_id)fail(`${update.vin} is assigned to a load.`);
      if(old?.truck_visit_id&&old.truck_visit_id!==v.id){const previous=visit(p.id,old.truck_visit_id);if(!req.body.allow_move||['completed','arrived'].includes(previous.status)||old.atd||old.ata)fail(`${update.vin} belongs to ${previous.reference}. Only planned VINs can be moved, with explicit permission.`);}
      const base={carrier:v.carrier,truck:v.truck,origin:v.yard,destination:v.destination,etd:v.etd,eta:v.eta,atd:v.atd,ata:v.ata,price:p.unit_cost,revenue:p.unit_revenue};
      if(old){for(const f of Object.keys(base))if(old[f])base[f]=old[f];}Object.assign(base,update);base.carrier=v.carrier;base.truck=v.truck;
      const e=validateUnit({...old,...base});if(e)fail(`${update.vin}: ${e}`);return {old,update:base};
    });
    const result=transaction(db,()=>{let list=db.prepare('SELECT id FROM packing_lists WHERE project_id=? AND name=?').get(p.id,'Post-strip VINs');if(!list){list={id:randomUUID()};db.prepare('INSERT INTO packing_lists VALUES(?,?,?,?)').run(list.id,p.id,'Post-strip VINs',now());}
      let added=0,updated=0,order=db.prepare('SELECT coalesce(max(import_order),0) AS n FROM units WHERE project_id=?').get(p.id).n;
      for(const {old,update} of plan){if(old){const entries=Object.entries(update).filter(([f])=>f!=='vin');db.prepare(`UPDATE units SET truck_visit_id=?,${entries.map(([f])=>`${f}=?`).join(',')},updated_at=? WHERE id=?`).run(v.id,...entries.map(([,value])=>value),now(),old.id);updated++;}
        else{const id=randomUUID(),t=now();db.prepare(`INSERT INTO units(id,project_id,${FIELDS.join(',')},packing_list_id,truck_visit_id,created_at,updated_at,import_order) VALUES(${Array(FIELDS.length+7).fill('?').join(',')})`).run(id,p.id,...FIELDS.map(f=>update[f]??''),list.id,v.id,t,t,++order);added++;}}
      event(p.id,null,`Truck visit ${v.reference}: ${added} new and ${updated} existing VINs attached`,v.id);return {added,updated};});res.status(201).json(result);
  });
  app.delete('/api/projects/:p/visits/:id/vins/:unit',(req,res)=>{const p=stripping(req.params.p).id,v=visit(p,req.params.id),u=db.prepare('SELECT * FROM units WHERE id=? AND project_id=? AND truck_visit_id=?').get(req.params.unit,p,v.id)||fail('VIN not found on this visit.',404);transaction(db,()=>{db.prepare('UPDATE units SET truck_visit_id=NULL,updated_at=? WHERE id=?').run(now(),u.id);event(p,u.id,`Removed ${u.vin} from truck visit ${v.reference}; vehicle record retained`,v.id);});res.json({removed:u.id});});
  app.post('/api/projects/:p/visits/announce',(req,res)=>{
    const p=stripping(req.params.p).id,rows=req.body.visits;
    if(!Array.isArray(rows)||!rows.length||rows.length>10000||rows.some(r=>!r||typeof r.id!=='string')||new Set(rows.map(r=>r.id)).size!==rows.length)fail('Select unique truck visits.');
    transaction(db,()=>{const selected=rows.map(r=>{const v=visitSummary(visit(p,r.id));if(!['planned','announced','arrived'].includes(v.status)||!v.announcement_ready)fail('Only planned visits with a date, yard and plate or driver can be announced.');if(r.signature!==v.announcement_signature)fail('Visit details changed. Prepare the announcement again before marking it announced.',409);return v;});for(const v of selected){if(v.announced_signature===v.announcement_signature)continue;db.prepare("UPDATE truck_visits SET status=CASE WHEN status='planned' THEN 'announced' ELSE status END,announced_at=?,announced_signature=?,updated_at=? WHERE id=?").run(now(),v.announcement_signature,now(),v.id);event(p,null,`Truck visit ${v.reference} marked as announced · ${v.truck||v.driver}`,v.id);}});res.json({announced:rows.length});
  });
}
