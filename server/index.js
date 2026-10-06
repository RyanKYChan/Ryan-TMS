import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { createApp } from './app.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=openDb(process.env.TMS_DB_PATH || resolve(root,'data/tms.sqlite'));
const app=createApp(db);
let vite;
if(process.env.NODE_ENV==='production'){
  app.use(express.static(resolve(root,'dist')));
  app.get('/{*path}',(_req,res)=>res.sendFile(resolve(root,'dist/index.html')));
}else{
  const {createServer}=await import('vite');
  vite=await createServer({configFile:resolve(root,'vite.config.ts'),server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}
const port=Number(process.env.PORT || 3000);
const server=app.listen(port, process.env.HOST || '127.0.0.1',()=>console.log(`RYAN TMS listening on port ${port}`));
server.on('error',e=>{console.error(e.message);process.exit(1);});
async function close(){await vite?.close();server.close(()=>{db.close();process.exit(0);});server.closeIdleConnections();}
process.on('SIGTERM',close);process.on('SIGINT',close);
