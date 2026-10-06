import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
const vin=i=>`LSFAM11A1RA${String(i).padStart(6,'0')}`;
async function fixture(t,filename=':memory:'){
  const db=openDb(filename),server=createApp(db).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(url,method='GET',body){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};}
  const {data:ps}=await request('/api/projects');const p=ps[0].id;
  return {db,server,base,request,p,workspace:async()=> (await request(`/api/projects/${p}/workspace`)).data,importRows:async(rows,name='PL-001')=>request(`/api/projects/${p}/import`,'POST',{packingList:name,rows})};
}
test('400-unit import is repeatable, scoped to a project, and blank cells preserve values',async t=>{
  const f=await fixture(t),rows=Array.from({length:400},(_,i)=>({vin:vin(i+1),brand:'MAXUS',notes:'Keep me',t1:'yes',price:'95.50'}));
  let r=await f.importRows(rows);assert.equal(r.status,201);assert.deepEqual(r.data,{added:400,updated:0});
  r=await f.importRows(rows.map(u=>({vin:u.vin,notes:'',model:'Deliver 9'})));assert.deepEqual(r.data,{added:0,updated:400});
  let w=await f.workspace();assert.equal(w.units.length,400);assert.equal(w.packingLists.length,1);assert.equal(w.units[0].notes,'Keep me');
  const {data:p2}=await f.request('/api/projects','POST',{name:'Next spot',target:100});
  r=await f.request(`/api/projects/${p2.id}/import`,'POST',{packingList:'PL-002',rows:[{vin:vin(1)}]});assert.equal(r.data.added,1);
  const {data:w2}=await f.request(`/api/projects/${p2.id}/workspace`);assert.equal(w2.units.length,1);assert.equal((await f.workspace()).units.length,400);
});
test('Invalid and duplicate imports fail atomically without creating a packing list',async t=>{
  const f=await fixture(t);
  for(const rows of [[{vin:vin(1)},{vin:'BAD'}],[{vin:vin(1)},{vin:vin(1)}],[{vin:vin(1),etd:'2026-02-31T12:00:00Z'}],[{vin:vin(1),t1:'maybe'}],[{vin:vin(1),price:'-1'}]]){
    const r=await f.importRows(rows);assert.equal(r.status,400);const w=await f.workspace();assert.equal(w.units.length,0);assert.equal(w.packingLists.length,0);
  }
});
test('Load assignment enforces project isolation, unique selection, capacity and actual milestones',async t=>{
  const f=await fixture(t);await f.importRows([{vin:vin(1)},{vin:vin(2)},{vin:vin(3)}]);
  let w=await f.workspace(),ids=w.units.map(u=>u.id);
  const {data:l}=await f.request(`/api/projects/${f.p}/loads`,'POST',{reference:'MX-001',capacity:2,origin:'Zeebrugge',destination:'Utrecht',carrier:'Carrier',truck:'AB123',etd:'2026-10-12T08:00:00Z',eta:'2026-10-13T08:00:00Z'});
  const path=`/api/projects/${f.p}/loads/${l.id}`;
  assert.equal((await f.request(path+'/assign','POST',{unitIds:ids})).status,400);
  assert.equal((await f.request(path+'/assign','POST',{unitIds:[ids[0],ids[0]]})).status,400);
  assert.equal((await f.request(path+'/assign','POST',{unitIds:[ids[0],ids[1]]})).status,200);
  w=await f.workspace();assert.equal(w.units[0].status,'scheduled');assert.equal(w.units[0].carrier,'Carrier');assert.equal(w.units[0].destination,'Utrecht');
  assert.equal((await f.request(path,'PATCH',{capacity:1})).status,400);
  assert.equal((await f.request(path+'/milestone','POST',{field:'atd',value:'2026-10-12T09:00:00Z'})).status,200);
  assert.equal((await f.workspace()).units[0].status,'in_transit');
  assert.equal((await f.request(`/api/projects/${f.p}/units/${ids[0]}/unassign`,'POST',{})).status,400);
  assert.equal((await f.request(path+'/milestone','POST',{field:'ata',value:'2026-10-11T09:00:00Z'})).status,400);
  assert.equal((await f.workspace()).units[0].ata,'');
  assert.equal((await f.request(path+'/milestone','POST',{field:'ata',value:'2026-10-13T10:00:00Z'})).status,200);
  w=await f.workspace();assert.equal(w.units.filter(u=>u.status==='delivered').length,2);assert.equal(w.units[2].status,'unscheduled');
  const {data:p2}=await f.request('/api/projects','POST',{name:'Other',target:1});await f.request(`/api/projects/${p2.id}/import`,'POST',{packingList:'Other',rows:[{vin:vin(10)}]});
  const {data:w2}=await f.request(`/api/projects/${p2.id}/workspace`);
  assert.equal((await f.request(path+'/assign','POST',{unitIds:[w2.units[0].id]})).status,404);
});
test('Re-import retains actual dates and load; unit edits and removal are validated',async t=>{
  const f=await fixture(t);await f.importRows([{vin:vin(1),etd:'2026-10-12T08:00:00Z',eta:'2026-10-13T08:00:00Z'}]);
  let w=await f.workspace(),id=w.units[0].id;
  const {data:l}=await f.request(`/api/projects/${f.p}/loads`,'POST',{reference:'L1',capacity:8});
  await f.request(`/api/projects/${f.p}/loads/${l.id}/assign`,'POST',{unitIds:[id]});
  await f.importRows([{vin:vin(1),notes:'Updated notes'}],'PL-002');
  w=await f.workspace();assert.equal(w.units[0].load_id,l.id);assert.equal(w.units[0].packing_list,'PL-002');
  assert.equal((await f.request(`/api/projects/${f.p}/units/${id}`,'PATCH',{etd:'2026-10-14T08:00:00Z',eta:'2026-10-13T08:00:00Z'})).status,400);
  assert.equal((await f.request(`/api/projects/${f.p}/units/${id}/unassign`,'POST',{})).status,200);
  assert.equal((await f.workspace()).units[0].status,'unscheduled');
  await f.request(`/api/projects/${f.p}/units/${id}`,'PATCH',{atd:'2026-10-12T08:00:00Z',ata:'2026-10-13T08:00:00Z'});
  await f.importRows([{vin:vin(1),atd:'',ata:'',brand:'MAXUS'}]);assert.equal((await f.workspace()).units[0].ata,'2026-10-13T08:00:00Z');
});
test('Load updates sync planning without replacing actual dates; existing milestones are preserved',async t=>{
  const f=await fixture(t);await f.importRows([{vin:vin(1)},{vin:vin(2)}]);
  let w=await f.workspace();const ids=w.units.map(u=>u.id);
  const {data:l}=await f.request(`/api/projects/${f.p}/loads`,'POST',{reference:'L1',capacity:8});const path=`/api/projects/${f.p}/loads/${l.id}`;
  await f.request(path+'/assign','POST',{unitIds:ids});
  await f.request(`/api/projects/${f.p}/units/${ids[0]}`,'PATCH',{atd:'2026-10-12T07:00:00Z'});
  const r=await f.request(path+'/milestone','POST',{field:'atd',value:'2026-10-12T08:00:00Z'});assert.equal(r.data.updated,1);
  await f.request(path,'PATCH',{origin:'Antwerp',destination:'Rotterdam',carrier:'New Carrier',etd:'2026-10-12T06:00:00Z',eta:'2026-10-13T10:00:00Z'});
  w=await f.workspace();assert.equal(w.units[0].origin,'Antwerp');assert.equal(w.units[0].carrier,'New Carrier');assert.equal(w.units[0].atd,'2026-10-12T07:00:00Z');
});
test('CSV export includes customer fields and neutralizes spreadsheet formulas',async t=>{
  const f=await fixture(t);await f.importRows([{vin:vin(1),notes:'=HYPERLINK("test")',pol_address:'Port street',pod_address:'Dealer street',price:'95.50',t1:'no'}]);
  const r=await fetch(f.base+`/api/projects/${f.p}/export`),csv=await r.text();assert.equal(r.status,200);
  assert.match(csv,/Price\(EUR\)/);assert.match(csv,/POL-ADDRESS/);assert.match(csv,/Dealer street/);assert.match(csv,/'=HYPERLINK/);assert.equal(csv.split('\r\n').length,2);
});
test('SQLite retains units after the database is closed and reopened',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ryan-tms-')),filename=join(dir,'db.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let db=openDb(filename);const id=db.prepare('SELECT id FROM projects LIMIT 1').get().id;
  db.prepare('INSERT INTO units(id,project_id,vin,created_at,updated_at) VALUES(?,?,?,?,?)').run('unit-1',id,vin(1),new Date().toISOString(),new Date().toISOString());db.close();
  db=openDb(filename);assert.equal(db.prepare('SELECT vin FROM units').get().vin,vin(1));assert.equal(db.prepare('SELECT count(*) AS n FROM projects').get().n,1);db.close();
});
test('Unique references return a conflict and no duplicate load is created',async t=>{
  const f=await fixture(t);const body={reference:'SAME'};
  assert.equal((await f.request(`/api/projects/${f.p}/loads`,'POST',body)).status,201);
  assert.equal((await f.request(`/api/projects/${f.p}/loads`,'POST',body)).status,409);
  assert.equal((await f.workspace()).loads.length,1);
});
test('Bulk editing fills, sets and clears POL/POD for 400 units while retaining VINs and other fields',async t=>{
  const f=await fixture(t);await f.importRows(Array.from({length:400},(_,i)=>({vin:vin(i+1),origin:i===0?'Keep origin':'',notes:'Keep notes',price:'95.50'})));
  let w=await f.workspace(),ids=w.units.map(u=>u.id);
  let r=await f.request(`/api/projects/${f.p}/units/bulk`,'POST',{unitIds:ids,changes:[{field:'origin',mode:'fill',value:'Kallo'},{field:'destination',mode:'set',value:'Zeebrugge'},{field:'t1',mode:'set',value:'yes'}]});
  assert.equal(r.status,200);assert.equal(r.data.updated,400);w=await f.workspace();assert.equal(w.units[0].origin,'Keep origin');assert.equal(w.units[1].origin,'Kallo');assert.equal(w.units[399].destination,'Zeebrugge');assert.equal(w.units[0].vin,vin(1));assert.equal(w.units[0].notes,'Keep notes');assert.equal(w.units[0].price,'95.50');
  r=await f.request(`/api/projects/${f.p}/units/bulk`,'POST',{unitIds:ids,changes:[{field:'origin',mode:'fill',value:'Other'}]});assert.deepEqual(r.data,{updated:0,unchanged:400});
  r=await f.request(`/api/projects/${f.p}/units/bulk`,'POST',{unitIds:[ids[0]],changes:[{field:'price',mode:'clear'}]});assert.equal(r.status,200);assert.equal((await f.workspace()).units[0].price,'');assert.equal((await f.workspace()).units[1].price,'95.50');
});
test('Bulk edits validate every vehicle before writing and reject cross-project IDs and protected fields',async t=>{
  const f=await fixture(t);await f.importRows([{vin:vin(1)},{vin:vin(2),atd:'2026-10-13T08:00:00Z'}]);let w=await f.workspace(),ids=w.units.map(u=>u.id);
  const endpoint=`/api/projects/${f.p}/units/bulk`;
  assert.equal((await f.request(endpoint,'POST',{unitIds:ids,changes:[{field:'ata',mode:'set',value:'2026-10-12T08:00:00Z'}]})).status,400);assert.ok((await f.workspace()).units.every(u=>!u.ata));
  for(const changes of [[{field:'vin',mode:'set',value:vin(3)}],[{field:'load_id',mode:'set',value:'fake'}],[{field:'origin',mode:'set',value:''}],[{field:'t1',mode:'set',value:'maybe'}],[{field:'origin',mode:'set',value:'Kallo'},{field:'origin',mode:'set',value:'Other'}]])assert.equal((await f.request(endpoint,'POST',{unitIds:ids,changes})).status,400);
  const {data:p2}=await f.request('/api/projects','POST',{name:'Other project'});await f.request(`/api/projects/${p2.id}/import`,'POST',{packingList:'Other',rows:[{vin:vin(10)}]});const {data:w2}=await f.request(`/api/projects/${p2.id}/workspace`);
  assert.equal((await f.request(endpoint,'POST',{unitIds:[ids[0],w2.units[0].id],changes:[{field:'origin',mode:'set',value:'Kallo'}]})).status,404);assert.equal((await f.workspace()).units[0].origin,'');
});
