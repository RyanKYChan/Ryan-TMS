import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Load, Unit } from './types';
import { Modal, Field, api, formatDate } from './shared';
export default function AssignDialog({unitIds,loads,units,projectId,onClose,onDone}:{unitIds:string[];loads:Load[];units:Unit[];projectId:string;onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [id,setId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=loads.find(l=>l.id===id);
  const invalid=units.filter(u=>unitIds.includes(u.id)&&(u.load_id||['in_transit','delivered'].includes(u.status)));
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api(`/api/projects/${projectId}/loads/${id}/assign`,'POST',{unitIds});await onDone(`${unitIds.length} units assigned to ${selected?.reference}`);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal title="Assign to a load" subtitle={`${unitIds.length} selected vehicles · plan their next movement`} onClose={onClose}><form className="modal-body" onSubmit={submit}>
    <Field label="Load *"><select required value={id} onChange={e=>setId(e.target.value)}><option value="">Choose a load</option>{loads.map(l=><option value={l.id} key={l.id}>{l.reference} · {l.capacity-units.filter(u=>u.load_id===l.id).length} spaces</option>)}</select></Field>
    {selected&&<div className="info-box"><div><strong>{selected.origin||'Origin not set'} → {selected.destination||'Destination not set'}</strong><p>{selected.carrier||'Carrier not set'} · ETD {formatDate(selected.etd,true)} · ETA {formatDate(selected.eta,true)}</p></div></div>}
    {invalid.length>0&&<div className="error">{invalid.length} selected units already have a load or are in transit/delivered. Clear those selections first.</div>}
    {!loads.length&&<p className="muted">Create a load in Load builds first.</p>}{error&&<div className="error" role="alert">{error}</div>}
    <div className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!id||!!invalid.length}>{busy?'Assigning…':'Assign vehicles'}<ArrowRight size={16}/></button></div>
  </form></Modal>;
}
