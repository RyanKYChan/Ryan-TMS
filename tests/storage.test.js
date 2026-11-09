import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { openDb } from '../server/db.js';
import { createStorage } from '../server/storage.js';
import { databasePath } from '../server/storage-paths.js';
import { inspectDatabase, SCHEMA_VERSION } from '../server/database-safety.js';
const vin='LSFAM11A1RA000001';
function temp(t){const path=mkdtempSync(join(tmpdir(),'ryan-storage-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
function seed(filename){
  const db=openDb(filename),p=db.prepare('SELECT id FROM projects').get().id;
  db.prepare("UPDATE projects SET name='Real operations',yard='Kallo',destination='Zeebrugge' WHERE id=?").run(p);
  db.prepare("INSERT INTO packing_lists(id,project_id,name,created_at) VALUES('pl',?,'Operational packing list','2026-01-01')").run(p);
  db.prepare("INSERT INTO carriers(id,project_id,name,created_at,contact_phone) VALUES('carrier',?,'Carrier A','2026-01-01','0123')").run(p);
  db.prepare("INSERT INTO loads(id,project_id,reference,carrier,created_at,cost) VALUES('load',?,'Load 1','Carrier A','2026-01-01','100')").run(p);
  db.prepare("INSERT INTO units(id,project_id,vin,carrier,packing_list_id,load_id,notes,atd,created_at,updated_at) VALUES('unit',?,?,'Carrier A','pl','load','Saved notes','2026-10-10T10:00:00Z','2026-01-01','2026-01-01')").run(p,vin);
  db.prepare("INSERT INTO events(id,project_id,unit_id,description,created_at) VALUES('history',?,'unit','Operational history','2026-01-01')").run(p);
  db.close();return p;
}
async function serve(t,options){
  const storage=createStorage(options),app=express();app.use('/api/storage',storage.router);app.use(storage.middleware);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));storage.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,body)=>{const r=await fetch(base+'/api/storage'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
  return {storage,base,request};
}
test('Persistent Windows path does not depend on extraction folder or current directory; explicit override stays isolated',()=>{
  const env={LOCALAPPDATA:'C:/Users/Operator/AppData/Local'};
  const a=databasePath({env,platform:'win32',root:'/Downloads/v1'}),b=databasePath({env,platform:'win32',root:'/Downloads/v2'});
  assert.equal(a,b);assert.match(a,/Ryan-TMS[\\/]data[\\/]tms.sqlite$/);
  assert.throws(()=>databasePath({env:{},platform:'win32'}),/LOCALAPPDATA/);
  assert.equal(databasePath({env:{TMS_DB_PATH:'test.sqlite'},root:'/isolated'}),'/isolated/test.sqlite');
});
test('Versioned legacy upgrade creates a consistent pre-migration backup and preserves operational records',t=>{
  const dir=temp(t),path=join(dir,'data/tms.sqlite');seed(path);
  const old=new DatabaseSync(path);old.exec('PRAGMA user_version=0; ALTER TABLE projects DROP COLUMN destination;');old.close();
  const upgraded=openDb(path);assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);
  assert.equal(upgraded.prepare('SELECT notes FROM units').get().notes,'Saved notes');assert.equal(upgraded.prepare('SELECT description FROM events').get().description,'Operational history');upgraded.close();
  const backups=readdirSync(join(dir,'data/backups'));assert.equal(backups.length,1);
  const backup=new DatabaseSync(join(dir,'data/backups',backups[0]),{readOnly:true});assert.equal(backup.prepare('PRAGMA user_version').get().user_version,0);assert.equal(backup.prepare('SELECT vin FROM units').get().vin,vin);backup.close();
  openDb(path).close();assert.equal(readdirSync(join(dir,'data/backups')).length,1);
});
test('Newer schema, corrupt or empty existing databases are refused without reset; multiple versions cannot open the same database',t=>{
  const dir=temp(t),path=join(dir,'tms.sqlite');seed(path);
  const db=openDb(path);assert.throws(()=>openDb(path),/already using/);db.close();
  const future=new DatabaseSync(path);future.exec('PRAGMA user_version=99');future.close();
  assert.throws(()=>openDb(path),/newer Ryan-TMS/);const check=new DatabaseSync(path);assert.equal(check.prepare('SELECT count(*) AS n FROM units').get().n,1);check.close();
  const bad=join(dir,'broken.sqlite');writeFileSync(bad,'not sqlite');assert.throws(()=>openDb(bad));assert.equal(readFileSync(bad,'utf8'),'not sqlite');
  const empty=join(dir,'empty.sqlite');writeFileSync(empty,'');assert.throws(()=>openDb(empty),/not a complete/);
});
test('First launch imports committed WAL records with confirmation, keeps the source, and survives updates from another folder',async t=>{
  const dir=temp(t),oldRoot=join(dir,'Downloads/old/Ryan-TMS'),source=join(oldRoot,'data/tms.sqlite'),target=join(dir,'AppData/Ryan-TMS/data/tms.sqlite');const p=seed(source);
  // An abruptly closed legacy process leaves committed changes in the WAL.
  const child=spawn(process.execPath,['--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE units SET notes='Committed in WAL'");console.log('written');setInterval(()=>{},1000);`,source],{stdio:['ignore','pipe','pipe']});
  await once(child.stdout,'data');child.kill('SIGKILL');await once(child,'exit');assert.ok(existsSync(source+'-wal'));
  const f=await serve(t,{filename:target,root:oldRoot});assert.equal(f.storage.status().ready,false);assert.equal(existsSync(target),false);
  assert.equal((await f.request('/import/preview',{path:oldRoot})).status,400);
  const review=await f.request('/import/preview',{path:oldRoot,previousClosed:true});assert.equal(review.status,200);assert.equal(review.data.vins,1);assert.equal(review.data.path,source);
  assert.equal((await f.request('/import',{token:review.data.token,previousClosed:true})).status,400);
  assert.equal((await f.request('/import',{token:review.data.token,previousClosed:true,confirm:true})).status,200);
  const workspace=await (await fetch(f.base+`/api/projects/${p}/workspace`)).json();assert.equal(workspace.units[0].notes,'Committed in WAL');assert.equal(workspace.units[0].carrier,'Carrier A');assert.equal(workspace.units[0].atd,'2026-10-10T10:00:00Z');assert.equal(workspace.events[0].description,'Operational history');
  assert.ok(existsSync(source));assert.equal(inspectDatabase(source).vins,1);f.storage.close();
  const next=createStorage({filename:target,root:join(dir,'Downloads/new/Ryan-TMS')});assert.equal(next.status().ready,true);next.close();
  const verify=new DatabaseSync(target,{readOnly:true});assert.equal(verify.prepare('SELECT notes FROM units').get().notes,'Committed in WAL');verify.close();
  unlinkSync(target);assert.throws(()=>createStorage({filename:target,root:oldRoot}),/expected database is missing/);
});
test('Backup downloads, invalid restore rejection, explicit confirmation, stale review protection and restore safety backups',async t=>{
  const dir=temp(t),path=join(dir,'data/tms.sqlite'),p=seed(path),f=await serve(t,{filename:path,root:dir});
  const response=await fetch(f.base+'/api/storage/backup',{method:'POST'});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
  const snapshot=join(dir,'download.sqlite');writeFileSync(snapshot,bytes);assert.equal(inspectDatabase(snapshot).vins,1);
  async function preview(content=bytes){const r=await fetch(f.base+'/api/storage/restore/preview',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:content});return {status:r.status,data:await r.json()};}
  assert.equal((await preview(Buffer.from('bad backup'))).status,400);
  const review=await preview();assert.equal(review.status,200);
  assert.equal((await f.request('/restore',{token:review.data.token,snapshot:review.data.snapshot})).status,400);
  await fetch(f.base+`/api/projects/${p}/units/unit`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes:'Updated after backup'})});
  assert.equal((await f.request('/restore',{token:review.data.token,snapshot:review.data.snapshot,confirm:'RESTORE'})).status,400);
  const fresh=await preview();assert.equal((await f.request('/restore',{token:fresh.data.token,snapshot:fresh.data.snapshot,confirm:'RESTORE'})).status,200);
  const w=await (await fetch(f.base+`/api/projects/${p}/workspace`)).json();assert.equal(w.units[0].notes,'Saved notes');assert.ok(readdirSync(join(dir,'data/backups')).some(n=>n.includes('before-restore')));
  const backupName=readdirSync(join(dir,'data/backups')).find(n=>n.includes('before-restore'));const safety=new DatabaseSync(join(dir,'data/backups',backupName));assert.equal(safety.prepare('SELECT notes FROM units').get().notes,'Updated after backup');safety.close();
  assert.equal((await fetch(f.base+'/api/storage/backup',{method:'POST',headers:{Origin:'http://unrelated.example'}})).status,403);
});

test('Failed schema upgrades roll back and a failed safety backup prevents schema changes',t=>{
  const dir=temp(t),path=join(dir,'data/tms.sqlite');seed(path);
  const legacy=new DatabaseSync(path);legacy.exec('PRAGMA user_version=0; ALTER TABLE projects DROP COLUMN destination; DROP INDEX units_project; CREATE TABLE units_project(dummy TEXT);');legacy.close();
  assert.throws(()=>openDb(path));
  let check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,0);assert.equal(check.prepare('SELECT vin FROM units').get().vin,vin);assert.ok(!check.prepare('PRAGMA table_info(projects)').all().some(c=>c.name==='destination'));check.exec('DROP TABLE units_project');check.close();
  const backups=join(dir,'data/backups');assert.ok(readdirSync(backups).some(n=>n.includes('before-schema')));rmSync(backups,{recursive:true});writeFileSync(backups,'cannot create a backup folder here');
  assert.throws(()=>openDb(path));check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA user_version').get().user_version,0);assert.equal(check.prepare('SELECT notes FROM units').get().notes,'Saved notes');check.close();
});
test('A second process is blocked, and an abruptly closed process lock can be recovered',async t=>{
  const dir=temp(t),path=join(dir,'tms.sqlite');seed(path);
  const moduleUrl=new URL('../server/db.js',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {openDb} from ${JSON.stringify(moduleUrl)};const db=openDb(process.argv[1]);console.log('locked');setInterval(()=>{},1000);`,path],{stdio:['ignore','pipe','pipe']});
  try{await once(child.stdout,'data');assert.throws(()=>openDb(path),/already using/);}finally{child.kill('SIGKILL');await once(child,'exit');}
  assert.ok(existsSync(path+'.lock'));const db=openDb(path);assert.equal(db.prepare('SELECT vin FROM units').get().vin,vin);db.close();assert.equal(existsSync(path+'.lock'),false);
});

test('v0.10 schema migration backs up before adding list planning, preserves all records and persists planning across restarts',async t=>{
  const dir=temp(t),path=join(dir,'data/tms.sqlite');seed(path);
  const old=new DatabaseSync(path);old.exec("PRAGMA user_version=1; ALTER TABLE events DROP COLUMN packing_list_id;");
  for(const col of ['priority','planning_state','objective','hold_reason','next_action','review_date'])old.exec(`ALTER TABLE packing_lists DROP COLUMN ${col}`);
  const records=old.prepare('SELECT * FROM units').all();old.close();
  let db=openDb(path);assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);assert.deepEqual(db.prepare('SELECT * FROM units').all(),records);const list=db.prepare('SELECT * FROM packing_lists').get();assert.equal(list.priority,'normal');assert.equal(list.planning_state,'active');assert.equal(db.prepare('SELECT count(*) AS n FROM events').get().n,1);
  db.exec("UPDATE packing_lists SET priority='urgent',planning_state='on_hold',hold_reason='Awaiting contract',next_action='Contact client',review_date='2026-11-12'");db.close();
  const name=readdirSync(join(dir,'data/backups')).find(n=>n.includes('before-schema-2'));assert.ok(name);const backup=new DatabaseSync(join(dir,'data/backups',name));assert.equal(backup.prepare('PRAGMA user_version').get().user_version,1);assert.ok(!backup.prepare('PRAGMA table_info(packing_lists)').all().some(c=>c.name==='priority'));backup.close();
  db=openDb(path);assert.equal(db.prepare('SELECT hold_reason FROM packing_lists').get().hold_reason,'Awaiting contract');assert.deepEqual(db.prepare('SELECT * FROM units').all(),records);db.close();
});
