import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { openDb } from '../../server/db.js';

test('First-time import, database settings, backup save and confirmed restore work through the browser',async({page})=>{
  test.setTimeout(60000);
  const dir=mkdtempSync(join(tmpdir(),'ryan-browser-storage-')),source=join(dir,'old/Ryan-TMS/data/tms.sqlite');
  const db=openDb(source);db.exec("UPDATE projects SET name='Imported operations'");db.close();
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const env={...process.env,XDG_DATA_HOME:join(dir,'persistent'),NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port)};delete env.TMS_DB_PATH;
  const child=spawn(process.execPath,['server/index.js'],{cwd:resolve('.'),env,stdio:'pipe'});let logs='';child.stderr.on('data',s=>logs+=s);child.stdout.on('data',s=>logs+=s);
  const url=`http://127.0.0.1:${port}`;
  try{
    for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(logs);try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    await page.goto(url);await expect(page.getByRole('heading',{name:'RYAN · Data & backups'})).toBeVisible();
    await page.getByLabel('Previous Ryan-TMS folder or database path').fill(join(dir,'old/Ryan-TMS'));
    await expect(page.getByRole('button',{name:'Inspect existing database'})).toBeDisabled();await page.getByRole('checkbox',{name:'I have closed the previous Ryan-TMS application'}).check();await page.getByRole('button',{name:'Inspect existing database'}).click();
    await expect(page.getByText(`Source: ${source}`,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Confirm import',exact:true}).click();await expect(page.getByRole('heading',{name:'Operations overview'})).toBeVisible();await expect(page.getByLabel('Active project')).toContainText('Imported operations');
    await page.getByRole('button',{name:'Data & backups',exact:true}).click();await expect(page.getByLabel('Active database location')).toHaveValue(join(dir,'persistent/Ryan-TMS/data/tms.sqlite'));
    await page.evaluate(()=>{window.showSaveFilePicker=undefined;});const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Create & download database backup'}).click();const backup=await downloaded;const backupPath=await backup.path();
    await page.getByLabel('Restore a Ryan-TMS database backup').setInputFiles(backupPath);await expect(page.getByRole('button',{name:'Confirm restore',exact:true})).toBeDisabled();await page.getByLabel('Type RESTORE to replace all current data').fill('RESTORE');await page.getByRole('button',{name:'Confirm restore',exact:true}).click();await expect(page.getByRole('heading',{name:'Operations overview'})).toBeVisible();await expect(page.getByLabel('Active project')).toContainText('Imported operations');
  }finally{child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');rmSync(dir,{recursive:true,force:true});}
});
