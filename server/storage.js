import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { databasePath, appRoot, backupDirectory } from './storage-paths.js';
import { acquireDatabaseLock, inspectDatabase, validateDatabase, snapshotDatabase, safetyBackup } from './database-safety.js';

export function createStorage({filename=databasePath(),root=appRoot,autoCreate=!!process.env.TMS_DB_PATH}={}){
  const release=acquireDatabaseLock(filename),marker=filename+'.initialized';
  const legacy=resolve(root,'data/tms.sqlite');
  let db=null,application=null,busy=false,closed=false;
  const pending=new Map();
  function connect(){db=openDb(filename,{lock:false});application=createApp(db);writeFileSync(marker,'Ryan-TMS persistent database\n',{flag:'w'});}
  try{
    if(existsSync(filename))connect();
    else if(existsSync(marker))throw new Error(`The expected database is missing: ${filename}. Restore it from a backup; an empty database will not be created.`);
    else if(autoCreate)connect();
  }catch(e){try{db?.close();}finally{release();}throw e;}
  const status=()=>({ready:!!db,path:filename,legacyPath:existsSync(legacy)&&legacy!==filename?legacy:null,backupDirectory:backupDirectory(filename)});
  function close(){if(closed)return;db?.close();db=null;closed=true;for(const item of pending.values())if(item.stage&&existsSync(item.stage))unlinkSync(item.stage);release();}
  function stagePath(){return join(dirname(filename),`.import-${randomUUID()}.sqlite`);}
  function remember(item){for(const [key,value] of pending)if(Date.now()-value.created>3600000){if(value.stage&&existsSync(value.stage))unlinkSync(value.stage);pending.delete(key);}const token=randomUUID();pending.set(token,{...item,created:Date.now()});return token;}
  function sourceSignature(path){return [path,path+'-wal'].map(p=>{if(!existsSync(p))return 'missing';const s=statSync(p,{bigint:true});return `${s.ino}:${s.size}:${s.mtimeNs}`;}).join('|');}
  function sourcePath(input){
    if(typeof input!=='string'||!input.trim())throw new Error('Choose the previous Ryan-TMS folder or a backup file.');
    const path=resolve(input.trim().replace(/^"|"$/g,''));
    const candidates=[path,join(path,'data/tms.sqlite'),join(path,'Ryan-TMS/data/tms.sqlite')];
    for(const candidate of candidates){try{inspectDatabase(candidate);return candidate;}catch(e){if(candidate===path&&/\.sqlite$/i.test(path))throw e;}}
    throw new Error('No valid data/tms.sqlite was found in that folder. Select the previous Ryan-TMS folder.');
  }
  function checkpoint(){
    const result=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if(result.busy)throw new Error('Another process is using the database. Close all other Ryan-TMS versions and retry.');
  }
  function install(stage,{restore=false}={}){
    // Upgrade the staged copy first. Failure leaves the active database untouched.
    const candidate=openDb(stage);candidate.close();inspectDatabase(stage);
    let previous=null;
    if(db){
      safetyBackup(db,filename,'before-restore');checkpoint();db.close();db=null;application=null;
      previous=join(backupDirectory(filename),`tms-replaced-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`);
      try{renameSync(filename,previous);}catch(e){connect();throw e;}
    }else if(existsSync(filename))throw new Error('A database now exists at the destination. Restart Ryan-TMS to use it.');
    try{renameSync(stage,filename);connect();}
    catch(e){
      db?.close();db=null;application=null;
      // Keep the rejected database for diagnosis. Never delete the previous one.
      if(existsSync(filename))renameSync(filename,stage+'.failed');
      if(previous){renameSync(previous,filename);connect();}
      throw e;
    }
    return {restored:restore,...status()};
  }
  const router=express.Router();
  // Browser requests to data-management endpoints must originate from this app.
  router.use((req,res,next)=>{
    const origin=req.headers.origin;
    if(origin&&origin!==`http://${req.headers.host}`)return res.status(403).json({error:'Open data settings in the local Ryan-TMS app.'});
    if(busy)return res.status(503).json({error:'Database maintenance is in progress. Please retry.'});
    next();
  });
  router.use(express.json({limit:'16kb'}));
  router.get('/',(_req,res)=>res.json(status()));
  router.post('/pick-folder',async(_req,res,next)=>{
    try{
      if(process.platform!=='win32')throw new Error('Folder picker is available on Windows. Enter the folder path instead.');
      const script="Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = 'Select the previous Ryan-TMS folder (close that app first)'; if ($picker.ShowDialog() -eq 'OK') { [Console]::Write($picker.SelectedPath) }";
      const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:120000});
      res.json({path:stdout.trim()});
    }catch(e){next(e);}
  });
  router.post('/import/preview',(req,res,next)=>{
    try{
      if(db)throw new Error('A persistent database is already active. Use backup and restore to replace it.');
      if(req.body.previousClosed!==true)throw new Error('Close the previous application and confirm before inspecting its database.');
      const source=sourcePath(req.body.path);
      if(source===resolve(filename))throw new Error('This is the destination database. Restart the app to use it.');
      const details=inspectDatabase(source),token=remember({source,signature:sourceSignature(source)});res.json({...details,token});
    }catch(e){next(e);}
  });
  router.post('/import',(req,res,next)=>{
    let stage,sourceDb,unlock;
    try{
      const item=pending.get(req.body.token);
      if(db||!item?.source||req.body.confirm!==true||req.body.previousClosed!==true)throw new Error('Review the source and confirm that the previous app is closed before importing.');
      busy=true;unlock=acquireDatabaseLock(item.source);
      if(item.signature!==sourceSignature(item.source))throw new Error('The source database changed after inspection. Close the previous app and inspect it again.');
      stage=stagePath();
      sourceDb=new DatabaseSync(item.source,{readOnly:true});validateDatabase(sourceDb);snapshotDatabase(sourceDb,stage);sourceDb.close();sourceDb=null;
      res.json(install(stage));pending.delete(req.body.token);
    }catch(e){next(e);}finally{sourceDb?.close();unlock?.();if(stage&&existsSync(stage))unlinkSync(stage);busy=false;}
  });
  router.post('/initialize',(req,res,next)=>{
    try{
      if(db||existsSync(filename)||existsSync(marker))throw new Error('An existing database must be used or restored. It will not be replaced.');
      if(req.body.confirm!==true)throw new Error('Confirm that you want to start a new empty database.');
      connect();res.json(status());
    }catch(e){next(e);}
  });
  router.post('/backup',(_req,res,next)=>{
    try{
      if(!db)throw new Error('Import or create a database first.');
      const path=safetyBackup(db,filename,'manual');res.download(path,`ryan-tms-backup-${new Date().toISOString().slice(0,10)}.sqlite`);
    }catch(e){next(e);}
  });
  router.post('/restore/preview',express.raw({type:'application/octet-stream',limit:'256mb'}),(req,res,next)=>{
    let stage;
    try{
      if(!db)throw new Error('Import or create a database first.');
      if(!Buffer.isBuffer(req.body)||!req.body.length)throw new Error('Select a Ryan-TMS SQLite backup file.');
      stage=stagePath();writeFileSync(stage,req.body,{flag:'wx',mode:0o600});
      const details=inspectDatabase(stage),token=remember({stage});stage=null;
      res.json({...details,token,snapshot:snapshotDatabaseState()});
    }catch(e){next(e);}finally{if(stage&&existsSync(stage))unlinkSync(stage);}
  });
  function snapshotDatabaseState(){return `${db.prepare('PRAGMA data_version').get().data_version}:${db.prepare('SELECT total_changes() AS n').get().n}`;}
  router.post('/restore',(req,res,next)=>{
    try{
      const item=pending.get(req.body.token);
      if(!db||!item?.stage||req.body.confirm!=='RESTORE')throw new Error('Review a backup and type RESTORE to confirm.');
      if(req.body.snapshot!==snapshotDatabaseState())throw new Error('Data changed after the restore preview. Select the backup again to review.');
      busy=true;res.json(install(item.stage,{restore:true}));pending.delete(req.body.token);
    }catch(e){next(e);}finally{busy=false;}
  });
  router.use((err,_req,res,_next)=>res.status(400).json({error:err.message}));
  function middleware(req,res,next){if(busy)return res.status(503).json({error:'Database maintenance in progress.'});if(application)return application(req,res,next);if(req.path.startsWith('/api/'))return res.status(503).json({error:'Import your existing database or explicitly start a new database in Data & backups.'});next();}
  return {router,middleware,status,close};
}
