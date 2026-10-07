import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, Modal, Field } from './shared';
import type { Project } from './types';
export default function ProjectDialog({onClose,onCreated}:{onClose:()=>void;onCreated:(p:Project)=>void}){
  const [name,setName]=useState(''),[customer,setCustomer]=useState(''),[target,setTarget]=useState(400),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);try{const p=await api<Project>('/api/projects','POST',{name,customer,target});onCreated(p);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal title="Start a new project" subtitle="A fresh workspace for your next spot request, transport project, or shunting operation." onClose={onClose}>
    <form onSubmit={submit} className="modal-body"><Field label="Project name *"><input required value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="e.g. Maxus · Autumn arrivals"/></Field><Field label="Customer / brand"><input value={customer} onChange={e=>setCustomer(e.target.value)} maxLength={100} placeholder="e.g. MAXUS"/></Field><Field label="Expected units *"><input required type="number" min={1} max={100000} value={target} onChange={e=>setTarget(Number(e.target.value))}/></Field><p className="muted small">VINs, packing lists, loads, and activity are kept separately for each project. The expected count is a planning target, not an import limit. Project settings lets you rename the project, change this estimate, or use the packing-list total later.</p>{error&&<div className="error" role="alert">{error}</div>}<div className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Creating…':'Create project'}<Plus size={16}/></button></div></form>
  </Modal>;
}
