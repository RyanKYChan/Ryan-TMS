import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { visitMatrix } from '../server/visit-domain.js';
const vin=i=>`LSFAM11A1RA${String(i).padStart(6,'0')}`;
async function fixture(t,filename=':memory:'){
 const db=openDb(filename),server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const url=`http://127.0.0.1:${server.address().port}`;
 async function req(path,method='GET',body){const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();return {status:response.status,data};}
 const legacy=(await req('/api/projects')).data[0],p=(await req('/api/projects','POST',{name:'Container stripping test',project_type:'stripping',yard:'Test yard',target:0})).data,base=`/api/projects/${p.id}`;
 const ws=async()=> (await req(base+'/workspace')).data;
 const create=async(overrides={})=>req(base+'/visits','POST',{carrier_id:'new',carrier_name:'Spot carrier',pickup_date:'2026-10-20',truck:'test-01',driver:'Test Driver',save_truck:true,...overrides});
 return {db,url,req,p,base,legacy,ws,create};
}
test('Stripping projects start without VINs, retain editable defaults, and keep their project type',async t=>{
 const f=await fixture(t);assert.equal(f.legacy.project_type,'vin');assert.equal(f.p.target,0);assert.equal(f.p.project_type,'stripping');let w=await f.ws();assert.equal(w.units.length,0);assert.equal(w.truckVisits.length,0);assert.equal(w.truckBank.length,0);
 assert.equal((await f.req(f.base,'PATCH',{project_type:'vin'})).status,400);assert.equal((await f.req(f.base,'PATCH',{volume_mode:'packing_list'})).status,400);
 assert.equal((await f.req(f.base,'PATCH',{name:'New yard project',yard:'Updated default yard',target:150})).status,200);
 const result=await f.create();assert.equal(result.status,201);assert.equal(result.data.yard,'Updated default yard');assert.equal(result.data.truck,'TEST-01');assert.equal(result.data.reference,'VIS-0001');assert.equal(result.data.expected_units,null);assert.equal(result.data.announcement_ready,true);
 await f.req(f.base,'PATCH',{yard:'Another yard'});w=await f.ws();assert.equal(w.truckVisits[0].yard,'Updated default yard');assert.equal(w.units.length,0);
 assert.equal((await f.req(`/api/projects/${f.legacy.id}/visits`,'POST',{carrier_id:'new',carrier_name:'No visit'})).status,400);
});
test('Truck bank deduplicates plates, reuses details, and keeps saved visit snapshots unchanged',async t=>{
 const f=await fixture(t);const {data:v}=await f.create();let w=await f.ws();assert.equal(w.truckBank.length,1);const c=w.carriers[0],bank=w.truckBank[0];
 assert.equal((await f.req(f.base+`/carriers/${c.id}/contact`,'PATCH',{contact_name:'Operations',contact_phone:'+31000',contact_email:'ops@example.com',notes:'Call on arrival'})).status,200);
 await f.create({driver:'Replacement Driver'});w=await f.ws();assert.equal(w.truckBank.length,1);assert.equal(w.truckBank[0].driver,'Replacement Driver');assert.equal(w.truckVisits.find(r=>r.id===v.id).driver,'Test Driver');
 await f.req(f.base+`/trucks/${bank.id}`,'PATCH',{driver:'Bank Driver',truck:'TEST-NEW'});w=await f.ws();assert.equal(w.truckVisits.find(r=>r.id===v.id).truck,'TEST-01');assert.equal(w.truckVisits.find(r=>r.id===v.id).needs_reannouncement,false);
 const driverOnly=await f.req(f.base+'/trucks','POST',{carrier_id:c.id,driver:'Driver Without Plate'});assert.equal(driverOnly.status,201);assert.equal(driverOnly.data.truck,'');
 const before=await f.ws();assert.equal((await f.req(f.base+'/trucks','POST',{carrier_id:c.id,truck:'',driver:''})).status,400);assert.deepEqual(await f.ws(),before);
});
test('Invalid visit plans fail before creating carriers or trucks; dates, quantities, slots and scope are checked',async t=>{
 const f=await fixture(t),before=await f.ws();for(const changes of [{pickup_date:'2026-02-31'},{pickup_date:'',pickup_time:'09:00'},{slot_end:'10:00'},{pickup_time:'12:00',slot_end:'11:00'},{expected_units:-1},{actual_units:1},{time_zone:'wrong/zone'},{etd:'2026-10-20T08:00:00Z',eta:'2026-10-19T08:00:00Z'},{etd:'bad'},{status:'announced'}]){const r=await f.create(changes);assert.equal(r.status,400,JSON.stringify({changes,result:r}));assert.deepEqual(await f.ws(),before);}
 const partial=await f.create({pickup_date:'',truck:'',driver:'',save_truck:false});assert.equal(partial.status,201);assert.equal(partial.data.announcement_ready,false);
 assert.equal((await f.req(f.base+'/visits/announce','POST',{visits:[{id:partial.data.id,signature:partial.data.announcement_signature}]})).status,400);
 const c=(await f.req(`/api/projects/${f.legacy.id}/carriers`,'POST',{name:'Other project carrier'})).data;
 assert.equal((await f.create({carrier_id:c.id})).status,404);assert.equal((await f.req(f.base+'/trucks','POST',{carrier_id:c.id,truck:'FOREIGN'})).status,404);
});
test('Plate and driver swaps retain visit identity, flag re-announcement, reject stale announcements, and retain the history',async t=>{
 const f=await fixture(t),{data:v}=await f.create({etd:'2026-10-20T08:00:00Z',pickup_time:'10:00',time_zone:'Europe/Amsterdam'}),path=f.base+`/visits/${v.id}`;
 const announce=signature=>f.req(f.base+'/visits/announce','POST',{visits:[{id:v.id,signature}]});assert.equal((await announce(v.announcement_signature)).status,200);
 let saved=(await f.ws()).truckVisits[0];assert.equal(saved.status,'announced');assert.equal(saved.needs_announcement,false);
 saved=(await f.req(path,'PATCH',{truck:'TEST-SWAP',driver:'Swap Driver',pickup_date:'2026-10-21',etd:'2026-10-21T08:00:00Z'})).data;assert.equal(saved.id,v.id);assert.equal(saved.status,'announced');assert.equal(saved.needs_reannouncement,true);assert.equal((await announce(v.announcement_signature)).status,409);
 assert.equal((await announce(saved.announcement_signature)).status,200);assert.equal((await f.ws()).truckVisits[0].needs_reannouncement,false);
 const history=(await f.req(path+'/events')).data;assert.ok(history.some(e=>e.description.includes('TEST-01 → TEST-SWAP')));assert.ok(history.some(e=>e.description.includes('Test Driver → Swap Driver')));
 await f.req(path,'PATCH',{notes:'Internal note only',etd:'2026-10-21T10:00:00+02:00'});assert.equal((await f.ws()).truckVisits[0].needs_reannouncement,false);
 await f.req(path,'PATCH',{status:'arrived'});saved=(await f.ws()).truckVisits[0];assert.ok(saved.arrived_at);assert.equal(saved.ata,'');
 saved=(await f.req(path,'PATCH',{driver:'Yard replacement'})).data;assert.equal(saved.needs_reannouncement,true);assert.equal((await announce(saved.announcement_signature)).status,200);assert.equal((await f.ws()).truckVisits[0].status,'arrived');
});
test('Spot-market dropouts can be cancelled and re-planned, with carrier replacement and fresh announcement requirements',async t=>{
 const f=await fixture(t),{data:v}=await f.create(),path=f.base+`/visits/${v.id}`;await f.req(f.base+'/visits/announce','POST',{visits:[{id:v.id,signature:v.announcement_signature}]});
 assert.equal((await f.req(path,'PATCH',{status:'cancelled',notes:'Driver dropped out'})).status,200);assert.equal((await f.ws()).truckVisits[0].needs_announcement,false);
 const r=await f.req(path,'PATCH',{status:'planned',carrier_id:'new',carrier_name:'Replacement carrier',truck_id:null,truck:'REPLACE-01',driver:'Replacement',save_truck:true});assert.equal(r.status,200);assert.equal(r.data.needs_reannouncement,true);assert.equal(r.data.carrier,'Replacement carrier');assert.equal((await f.ws()).truckBank.length,2);
});
test('Post-strip VINs attach to completed pickups, repeat safely, preserve actuals, and detach without deleting vehicle records',async t=>{
 const f=await fixture(t),{data:v}=await f.create({pickup_date:'2026-10-12',etd:'2026-10-12T08:00:00Z',eta:'2026-10-13T08:00:00Z',atd:'2026-10-12T08:15:00Z',ata:'2026-10-13T08:30:00Z',status:'completed',actual_units:2}),path=f.base+`/visits/${v.id}/vins`;
 assert.equal(v.actual_units,2);assert.equal((await f.req(path,'POST',{rows:[{vin:vin(1),model:'P145',notes:'Keep me'},{vin:vin(2)}]})).status,201);
 let w=await f.ws();assert.equal(w.units.length,2);assert.ok(w.units.every(u=>u.truck_visit_id===v.id&&u.status==='delivered'&&u.atd===v.atd&&u.ata===v.ata));
 await f.req(path,'POST',{rows:[{vin:vin(1),model:'',notes:''}]});w=await f.ws();assert.equal(w.units.length,2);assert.equal(w.units[0].model,'P145');assert.equal(w.units[0].notes,'Keep me');assert.equal(w.truckVisits[0].actual_units,2);
 const stable=await f.ws();assert.equal((await f.req(path,'POST',{rows:[{vin:vin(3)},{vin:'BAD'}]})).status,400);assert.deepEqual(await f.ws(),stable);
 assert.equal((await f.req(path+'/'+w.units[0].id,'DELETE')).status,200);w=await f.ws();assert.equal(w.units.length,2);assert.equal(w.units[0].truck_visit_id,null);assert.equal(w.units[0].ata,v.ata);
});
test('Linked VIN plans follow plate swaps, actual milestones stay intact, and invalid child chronology rolls back the whole update',async t=>{
 const f=await fixture(t),{data:v}=await f.create({etd:'2026-10-20T08:00:00Z',eta:'2026-10-25T08:00:00Z'}),path=f.base+`/visits/${v.id}`;
 await f.req(path+'/vins','POST',{rows:[{vin:vin(1),etd:'2026-10-23T08:00:00Z',notes:'VIN note',price:'95.50'}]});
 const before=await f.ws();assert.equal((await f.req(path,'PATCH',{truck:'BAD-SWAP',eta:'2026-10-22T08:00:00Z',save_truck:true})).status,400);assert.deepEqual(await f.ws(),before);
 assert.equal((await f.req(path,'PATCH',{truck:'GOOD-SWAP',eta:'2026-10-24T08:00:00Z'})).status,200);let w=await f.ws();assert.equal(w.units[0].truck,'GOOD-SWAP');assert.equal(w.units[0].notes,'VIN note');assert.equal(w.units[0].price,'95.50');
 const other=(await f.create({truck:'OTHER-PLATE'})).data;assert.equal((await f.req(f.base+`/visits/${other.id}/vins`,'POST',{rows:[{vin:vin(1)}]})).status,400);
 assert.equal((await f.req(f.base+`/visits/${other.id}/vins`,'POST',{rows:[{vin:vin(1)}],allow_move:true})).status,201);w=await f.ws();assert.equal(w.units[0].truck_visit_id,other.id);
});
test('Visit exports are scoped, escape spreadsheet formulas, and project deletion removes visits, bank entries and late VINs',async t=>{
 const f=await fixture(t),{data:v}=await f.create({notes:'=unsafe',expected_units:0});await f.req(f.base+`/visits/${v.id}/vins`,'POST',{rows:[{vin:vin(1)}]});
 const csv=await f.req(f.base+'/visits/export');assert.equal(csv.status,200);assert.ok(csv.data.includes('TEST-01'));assert.ok(csv.data.includes("'=unsafe"));assert.ok(csv.data.includes('Expected units'));
 assert.equal(visitMatrix([v],['expected_units'])[1][0],'0');assert.equal(visitMatrix([v],['actual_units'])[1][0],'');
 const other=(await f.req('/api/projects','POST',{name:'Other stripping',project_type:'stripping'})).data;assert.equal((await f.req(`/api/projects/${other.id}/visits/${v.id}`,'PATCH',{truck:'NO'})).status,404);assert.equal((await f.req(`/api/projects/${other.id}/visits/${v.id}/events`)).status,404);assert.equal((await f.req(`/api/projects/${other.id}/visits/announce`,'POST',{visits:[{id:v.id,signature:v.announcement_signature}]})).status,404);
 assert.equal((await f.req(f.base,'DELETE',{confirmName:f.p.name})).status,200);for(const table of ['truck_visits','project_trucks','units','events','carriers'])assert.equal(f.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id=?`).get(f.p.id).n,0,table);assert.equal((await f.req(`/api/projects/${f.legacy.id}/workspace`)).status,200);
});
test('Truck bank, bookings and announcement state persist across database reopen',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'tms-yard-')),file=join(dir,'tms.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));const f=await fixture(t,file),{data:v}=await f.create();await f.req(f.base+'/visits/announce','POST',{visits:[{id:v.id,signature:v.announcement_signature}]});const db=openDb(file);try{assert.equal(db.prepare('SELECT count(*) AS n FROM truck_visits').get().n,1);assert.equal(db.prepare('SELECT status FROM truck_visits WHERE id=?').get(v.id).status,'announced');assert.equal(db.prepare('SELECT count(*) AS n FROM project_trucks').get().n,1);}finally{db.close();}
});


test('Actual departure or arrival completes the pickup without replacing recorded milestone times',async t=>{
 const f=await fixture(t),{data:v}=await f.create({pickup_date:'2026-10-12',etd:'2026-10-12T08:00:00Z'}),path=f.base+`/visits/${v.id}`;
 const r=await f.req(path,'PATCH',{atd:'2026-10-12T08:45:00Z'});assert.equal(r.status,200);assert.equal(r.data.status,'completed');assert.equal(r.data.atd,'2026-10-12T08:45:00Z');assert.equal(r.data.needs_announcement,false);
 assert.equal((await f.req(path,'PATCH',{status:'cancelled'})).status,400);
 const another=(await f.create({pickup_date:'2026-10-12',truck:'ANOTHER'})).data;
 const arrived=await f.req(f.base+`/visits/${another.id}`,'PATCH',{ata:'2026-10-13T08:00:00Z'});assert.equal(arrived.status,200);assert.equal(arrived.data.status,'completed');assert.equal(arrived.data.atd,'');
});


test('Yard announcement milestones default to dates, while times can be included explicitly',()=>{
 const v={reference:'VIS-TEST',carrier:'Test carrier',truck:'TEST-01',pickup_date:'2026-10-22',pickup_time:'10:00',etd:'2026-10-22T08:00:00Z',eta:'2026-10-23T08:00:00Z',atd:'',ata:'',time_zone:'Europe/Amsterdam'};
 assert.equal(visitMatrix([v],['etd','eta'])[1][0],'2026-10-22');assert.equal(visitMatrix([v],['etd','eta'],{includeTime:true})[1][0],'2026-10-22 10:00');assert.equal(visitMatrix([v],['pickup_time'])[1][0],'10:00');
});

test('Saved route defaults fill new bookings, explicit blanks remain blank, and existing visit locations stay unchanged',async t=>{
 const f=await fixture(t);await f.req(f.base,'PATCH',{yard:'Loading yard',destination:'Unloading yard'});const first=await f.create();assert.equal(first.data.destination,'Unloading yard');assert.equal(first.data.yard,'Loading yard');
 await f.req(f.base,'PATCH',{yard:'Next loading',destination:'Next unloading'});const second=await f.create({truck:'TEST-02'});assert.equal(second.data.yard,'Next loading');assert.equal(second.data.destination,'Next unloading');assert.equal((await f.ws()).truckVisits.find(v=>v.id===first.data.id).destination,'Unloading yard');
 const blank=await f.create({truck:'TEST-03',destination:'',yard:''});assert.equal(blank.data.destination,'');assert.equal(blank.data.yard,'');
 assert.equal((await f.req(f.base,'PATCH',{destination:'X'.repeat(501)})).status,400);
});
test('Bulk truck booking is atomic, preserves shared notes, prepares announcements without inventing ETD, and retries safely',async t=>{
 const f=await fixture(t);await f.req(f.base,'PATCH',{destination:'Delivery yard'});
 const body={request_id:'bulk-1',common:{carrier_id:'new',carrier_name:'Batch carrier',yard_arrival_date:'2026-10-15',yard_arrival_time:'18:00',notes:'Today till 18:00 should make to arrive',save_truck:true},rows:[{truck:'1580NBK',trailer:'R2463BDC',driver:'Ruben Muñoz'},{truck:'5086MZF',trailer:'R1026BDC',driver:'Dyma Odintsov'},{truck:'6602MSD',trailer:'R6665BCX',driver:'Jeones Osoya'},{truck:'9574MZM',trailer:'R2458BDC',driver:'Juan Perez'}]};
 const result=await f.req(f.base+'/visits/bulk','POST',body);assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.data.visits.length,4);let w=await f.ws();assert.equal(w.truckVisits.length,4);assert.equal(w.truckBank.length,4);assert.equal(w.carriers.length,1);
 assert.ok(w.truckVisits.every(v=>v.yard==='Test yard'&&v.destination==='Delivery yard'&&v.yard_arrival_date==='2026-10-15'&&v.yard_arrival_time==='18:00'&&v.etd===''&&v.eta===''&&v.pickup_date===''&&v.announcement_ready&&v.notes===body.common.notes));
 const retry=await f.req(f.base+'/visits/bulk','POST',body);assert.equal(retry.status,200);assert.equal(retry.data.replayed,true);assert.deepEqual(retry.data.visits.map(v=>v.id),result.data.visits.map(v=>v.id));assert.deepEqual(await f.ws(),w);
 assert.equal((await f.req(f.base+'/visits/bulk','POST',{...body,common:{...body.common,notes:'changed'}})).status,409);assert.deepEqual(await f.ws(),w);
 const rePaste=await f.req(f.base+'/visits/bulk','POST',{...body,request_id:'bulk-repeat'});assert.equal(rePaste.status,409);assert.deepEqual(await f.ws(),w);
 assert.equal((await f.req(f.base+'/visits/announce','POST',{visits:result.data.visits.map(v=>({id:v.id,signature:v.announcement_signature}))})).status,200);w=await f.ws();assert.ok(w.truckVisits.every(v=>v.status==='announced'));
 const v=w.truckVisits[0],changed=await f.req(f.base+`/visits/${v.id}`,'PATCH',{yard_arrival_time:'19:00'});assert.equal(changed.status,200);assert.equal(changed.data.needs_reannouncement,true);
 assert.equal((await f.req(f.base+`/visits/${v.id}`,'PATCH',{status:'arrived'})).status,200);
 const csv=await f.req(f.base+'/visits/export');assert.ok(csv.data.includes('Arrive at yard by'));assert.ok(csv.data.includes('19:00'));
 assert.equal((await f.req(f.base,'DELETE',{confirmName:f.p.name})).status,200);assert.equal(f.db.prepare('SELECT count(*) AS n FROM visit_batches').get().n,0);
});
test('Invalid bulk rows, duplicate plates, scopes and arrival deadlines roll back carriers, bank, visits and activity together',async t=>{
 const f=await fixture(t),before=await f.ws(),valid={request_id:'invalid-batch',common:{carrier_id:'new',carrier_name:'No partial saves',yard_arrival_date:'2026-10-20',save_truck:true},rows:[{truck:'FIRST-01',driver:'First'},{truck:'SECOND-02',driver:'Second'}]};
 for(const changes of [{rows:[valid.rows[0],{truck:''}]},{rows:[valid.rows[0],{truck:'first-01'}]},{common:{...valid.common,yard_arrival_time:'25:00'}},{common:{...valid.common,yard_arrival_date:'2026-02-31'}},{common:{...valid.common,yard_arrival_date:'',yard_arrival_time:'18:00'}},{common:{...valid.common,carrier_id:'foreign'}}]){const r=await f.req(f.base+'/visits/bulk','POST',{...valid,...changes});assert.ok([400,404].includes(r.status),JSON.stringify(r));assert.deepEqual(await f.ws(),before);assert.equal(f.db.prepare('SELECT count(*) AS n FROM visit_batches').get().n,0);}
 assert.equal((await f.req(`/api/projects/${f.legacy.id}/visits/bulk`,'POST',valid)).status,400);
 const result=await f.req(f.base+'/visits/bulk','POST',valid);assert.equal(result.status,201);const next=await f.req(f.base+'/visits/bulk','POST',{...valid,request_id:'another-day',common:{...valid.common,yard_arrival_date:'2026-10-21'}});assert.equal(next.status,201);assert.equal((await f.ws()).truckVisits.length,4);
});
