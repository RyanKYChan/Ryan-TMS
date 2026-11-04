import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function databasePath({env=process.env,platform=process.platform,home=homedir(),root=appRoot}={}){
  if(env.TMS_DB_PATH)return resolve(root,env.TMS_DB_PATH);
  if(platform==='win32'){
    if(!env.LOCALAPPDATA)throw new Error('LOCALAPPDATA is unavailable. The database location cannot be determined.');
    return join(env.LOCALAPPDATA,'Ryan-TMS','data','tms.sqlite');
  }
  return join(env.XDG_DATA_HOME||join(home,'.local','share'),'Ryan-TMS','data','tms.sqlite');
}
export const backupDirectory=filename=>join(dirname(filename),'backups');
