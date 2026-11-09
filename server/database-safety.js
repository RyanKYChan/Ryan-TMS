import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { backupDirectory } from './storage-paths.js';
export const SCHEMA_VERSION=2;
export function acquireDatabaseLock(filename){
  mkdirSync(dirname(filename),{recursive:true});
  const lock=filename+'.lock';
  for(let attempt=0;attempt<2;attempt++){
    try{
      const fd=openSync(lock,'wx',0o600),token=randomUUID();
      try{writeFileSync(fd,JSON.stringify({pid:process.pid,token}));}finally{closeSync(fd);}
      return ()=>{try{if(JSON.parse(readFileSync(lock,'utf8')).token===token)unlinkSync(lock);}catch(e){if(e.code!=='ENOENT')throw e;}};
    }catch(e){
      if(e.code!=='EEXIST')throw e;
      let owner;try{owner=JSON.parse(readFileSync(lock,'utf8'));}catch{throw new Error(`Database lock cannot be verified: ${lock}. Close all Ryan-TMS windows before investigating it.`);}
      let stopped=false;
      try{process.kill(owner.pid,0);}catch(err){if(err.code==='ESRCH')stopped=true;}
      // Linux container supervisors can leave an exited process as a zombie.
      // It holds no SQLite handles and must not block restart indefinitely.
      if(!stopped&&process.platform==='linux'){try{stopped=readFileSync(`/proc/${owner.pid}/stat`,'utf8').split(') ').at(-1).startsWith('Z ');}catch{}}
      if(stopped){unlinkSync(lock);continue;}
      throw new Error(`Ryan-TMS is already using this database (process ${owner.pid}). Close the previous app before opening another version.`);
    }
  }
  throw new Error('Could not acquire the database lock.');
}
export function validateDatabase(db,{allowEmpty=false}={}){
  const checks=db.prepare('PRAGMA quick_check').all();
  if(checks.length!==1||Object.values(checks[0])[0]!=='ok')throw new Error('SQLite integrity check failed. The database was not imported.');
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>SCHEMA_VERSION)throw new Error(`This database needs a newer Ryan-TMS version (schema ${version}). Update the application.`);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
  if(!tables.length&&allowEmpty)return;
  for(const name of ['projects','packing_lists','units','loads','events'])if(!tables.includes(name))throw new Error('This is not a complete Ryan-TMS database. No data was changed.');
  for(const [table,columns] of Object.entries({projects:['id','name','target'],units:['id','project_id','vin','carrier','load_id','packing_list_id'],loads:['id','project_id','reference'],events:['id','project_id','description']})){
    const fields=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name));
    if(columns.some(c=>!fields.has(c)))throw new Error(`The Ryan-TMS ${table} table is incompatible. No data was changed.`);
  }
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Database contains broken record links. Restore a valid backup.');
}
export function inspectDatabase(filename){
  if(!existsSync(filename))throw new Error(`Database not found: ${filename}`);
  const db=new DatabaseSync(filename,{readOnly:true});
  try{validateDatabase(db);return {path:resolve(filename),schema:db.prepare('PRAGMA user_version').get().user_version,projects:db.prepare('SELECT count(*) AS n FROM projects').get().n,vins:db.prepare('SELECT count(*) AS n FROM units').get().n,loads:db.prepare('SELECT count(*) AS n FROM loads').get().n};}finally{db.close();}
}
// VACUUM INTO is SQLite's consistent snapshot operation, including committed WAL pages.
// It fails rather than replacing an existing file and runs synchronously before DDL.
export function snapshotDatabase(db,filename){
  mkdirSync(dirname(filename),{recursive:true});
  db.exec(`VACUUM INTO '${filename.replaceAll("'","''")}'`);
  inspectDatabase(filename);
  return filename;
}
export function safetyBackup(db,filename,reason){
  return snapshotDatabase(db,resolve(backupDirectory(filename),`tms-${reason}-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`));
}
