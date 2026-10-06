import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Desktop launcher: serve the built app, then open the browser only when ready.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT || 3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535.');
const url=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[resolve(root,'server/index.js')],{
  cwd:root,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port)},
  stdio:['inherit','pipe','inherit'],
});
let output='',opened=false;
child.stdout.on('data',async data=>{
  process.stdout.write(data);
  output=(output+data.toString()).slice(-8000);
  if(opened||!output.includes(`RYAN TMS listening on port ${port}`))return;
  opened=true;
  try{
    const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(5000)});
    if(!response.ok||(await response.json()).ok!==true)throw new Error('The app did not pass its startup check.');
    console.log('Dashboard is ready. Keep this window open while using RYAN TMS.');
    if(process.env.TMS_OPEN_BROWSER==='0')return;
    if(process.platform==='win32'){
      const browser=spawn('cmd.exe',['/d','/c',`start "" msedge "${url}"`],{stdio:'ignore'});
      browser.on('error',()=>console.log(`Open Edge and enter ${url} in the address bar.`));
      browser.on('exit',code=>{if(code)console.log(`Open Edge and enter ${url} in the address bar.`);});
    }else{
      console.log(`Open your browser at ${url}.`);
    }
  }catch(e){console.error(e.message);process.exitCode=1;child.kill('SIGTERM');}
});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',code=>{if(code)process.exitCode=code;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
