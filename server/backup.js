import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { databasePath, backupDirectory } from './storage-paths.js';
import { inspectDatabase } from './database-safety.js';
const source=databasePath();
if(!existsSync(source))throw new Error(`No database found at ${source}. Import your data through the app first.`);
const destination=process.argv[2]?resolve(process.argv[2]):resolve(backupDirectory(source),`tms-${Date.now()}.sqlite`);
if(existsSync(destination))throw new Error('The backup destination already exists. Choose a new filename.');
mkdirSync(resolve(destination,'..'),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,destination);inspectDatabase(destination);console.log(`Database backup saved: ${destination}`);}finally{db.close();}
