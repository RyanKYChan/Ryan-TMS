import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.TMS_DB_PATH||resolve(root,'data/tms.sqlite');
if(!existsSync(source))throw new Error('No TMS database exists yet. Start the app first.');
const destination=resolve(root,'data/backups',`tms-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
mkdirSync(dirname(destination),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,destination);console.log(`Database backup saved: ${destination}`);}finally{db.close();}
