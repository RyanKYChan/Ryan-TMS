import { useEffect, useState } from 'react';
import { api, Field, Modal } from './shared';
export type StorageInfo={ready:boolean;path:string;legacyPath:string|null;backupDirectory:string};
type Preview={token:string;path:string;projects:number;vins:number;loads:number;snapshot?:string};
export default function DataSettings({setup=false,initial,onClose}:{setup?:boolean;initial?:StorageInfo;onClose?:()=>void}){
  const [info,setInfo]=useState<StorageInfo|null>(initial||null),[path,setPath]=useState(initial?.legacyPath||''),[closed,setClosed]=useState(false),[review,setReview]=useState<Preview|null>(null),[restore,setRestore]=useState(false),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{if(!initial)api<StorageInfo>('/api/storage').then(setInfo).catch(e=>setError(e.message));},[initial]);
  async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function download(){
    type SaveHandle={createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>}>};
    const picker=(window as unknown as {showSaveFilePicker?:(options:object)=>Promise<SaveHandle>}).showSaveFilePicker;
    let handle:SaveHandle|undefined;
    if(picker){try{handle=await picker.call(window,{suggestedName:`ryan-tms-backup-${new Date().toISOString().slice(0,10)}.sqlite`,types:[{description:'SQLite database backup',accept:{'application/octet-stream':['.sqlite']}}]});}catch(e){if((e as Error).name==='AbortError')return;throw e;}}
    const r=await fetch('/api/storage/backup',{method:'POST'});if(!r.ok)throw new Error((await r.json()).error);
    const blob=await r.blob();
    if(handle){const writable=await handle.createWritable();await writable.write(blob);await writable.close();setMessage('Database backup saved to your chosen location.');return;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ryan-tms-backup-${new Date().toISOString().slice(0,10)}.sqlite`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setMessage('Consistent backup created. Choose where to save it in your browser. A safety copy is also kept in the backups folder.');
  }
  const body=<div className="modal-body">
    <p>{setup?'Import your existing operational data once. Future updates will open it automatically.':'This database is shared by all current Ryan-TMS installations for your Windows account.'}</p>
    <Field label="Active database location"><input readOnly value={info?.path||'Loading…'}/></Field>
    {info?.ready&&<><button className="secondary" disabled={busy} onClick={()=>run(download)}>Create & download database backup</button><p className="small muted">Use your browser’s Save as / download location prompt to choose a folder. Backups include all projects and committed WAL transactions. Automatic safety backups: {info.backupDirectory}</p>
      <Field label="Restore a Ryan-TMS database backup"><input type="file" accept=".sqlite,.db" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)run(async()=>{const r=await fetch('/api/storage/restore/preview',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const data=await r.json();if(!r.ok)throw new Error(data.error);setReview({...data,path:file.name});setRestore(true);setConfirmation('');});e.target.value='';}}/></Field><p className="small muted">Select a complete backup created by Ryan-TMS. Restoring replaces all projects; a safety backup of your current data is made first.</p></>}
    {info&&!info.ready&&!review&&<>
      <h3>Import Existing Database</h3><p>Close the previous Ryan-TMS command window first. Keep its entire data folder together, including any tms.sqlite-wal and tms.sqlite-shm files. Do not copy only tms.sqlite.</p>
      <Field label="Previous Ryan-TMS folder or database path"><input value={path} onChange={e=>setPath(e.target.value)} placeholder="C:\Users\…\Downloads\Ryan-TMS"/></Field>
      <button className="secondary" disabled={busy} onClick={()=>run(async()=>{const result=await api<{path:string}>('/api/storage/pick-folder','POST',{});if(result.path)setPath(result.path);})}>Choose previous folder…</button>
      <label className="remember-mapping"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/>I have closed the previous Ryan-TMS application</label>
      <button className="primary" disabled={busy||!closed||!path.trim()} onClick={()=>run(async()=>{setReview(await api<Preview>('/api/storage/import/preview','POST',{path,previousClosed:closed}));setRestore(false);})}>Inspect existing database</button>
      <details className="project-delete-area"><summary>Start without an existing database</summary><p>Only use this for a new installation. If you already have operational records, import them above.</p><Field label="Type NEW to start an empty database"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field><button className="secondary" disabled={busy||confirmation!=='NEW'} onClick={()=>run(async()=>{await api('/api/storage/initialize','POST',{confirm:true});window.location.reload();})}>Create new empty database</button></details>
    </>}
    {review&&<div className="info-box"><div><strong>{restore?'Restore backup':'Confirm database import'}</strong><p>Source: {review.path}</p><p>{review.projects} projects · {review.vins} VINs · {review.loads} loads</p><p>{restore?'Your current database will be backed up before replacement.':'The original database files remain in their original folder. A verified SQLite snapshot will be imported to the permanent location above.'}</p>
      {restore&&<Field label="Type RESTORE to replace all current data"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field>}
      <div className="modal-footer"><button className="secondary" disabled={busy} onClick={()=>{setReview(null);setConfirmation('');}}>Cancel</button><button className="primary" disabled={busy||(restore?confirmation!=='RESTORE':!closed)} onClick={()=>run(async()=>{await api(`/api/storage/${restore?'restore':'import'}`,'POST',{token:review.token,confirm:restore?confirmation:true,previousClosed:closed,snapshot:review.snapshot});window.location.reload();})}>{busy?'Working…':restore?'Confirm restore':'Confirm import'}</button></div>
    </div></div>}
    {message&&<p role="status">{message}</p>}{error&&<div className="error" role="alert">{error}</div>}
    {!setup&&<div className="modal-footer"><button className="secondary" disabled={busy} onClick={onClose}>Close</button></div>}
  </div>;
  return setup?<main className="data-setup panel"><h1>RYAN · Data & backups</h1>{body}</main>:<Modal title="Data & backups" subtitle="Persistent storage · all projects" onClose={()=>{if(!busy)onClose?.();}}>{body}</Modal>;
}
export function StorageGate({children}:{children:React.ReactNode}){
  const [info,setInfo]=useState<StorageInfo|null>(null),[error,setError]=useState('');
  useEffect(()=>{api<StorageInfo>('/api/storage').then(setInfo).catch(e=>setError(e.message));},[]);
  if(error)return <main className="data-setup panel"><h1>Database unavailable</h1><p role="alert">{error}</p><p>Your existing data has not been reset. Close other Ryan-TMS windows and restart, or check the launcher for the database path and error.</p><button onClick={()=>window.location.reload()}>Retry</button></main>;
  if(!info)return <main className="data-setup panel">Checking database…</main>;
  return info.ready?<>{children}</>:<DataSettings setup initial={info}/>;
}
