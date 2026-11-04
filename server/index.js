import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStorage } from './storage.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const storage=createStorage();
const app=express();
app.disable('x-powered-by');
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.use('/api/storage',storage.router);
app.use(storage.middleware);
console.log(`Database location: ${storage.status().path}`);
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
async function close(){await vite?.close();server.close(()=>{storage.close();process.exit(0);});server.closeIdleConnections();}
process.on('SIGTERM',close);process.on('SIGINT',close);
