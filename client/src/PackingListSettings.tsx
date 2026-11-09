import { useState } from 'react';
import { api, Field, Modal } from './shared';
import type { PackingList } from './types';
export default function PackingListSettings({projectId,list,onClose,onDone}:{projectId:string;list:PackingList;onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [form,setForm]=useState(list),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const set=(field:string,value:string)=>setForm(f=>({...f,[field]:value}));
  const path=`/api/projects/${projectId}/packing-lists/${list.id}`;
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const {priority,planning_state,objective,hold_reason,next_action,review_date,snapshot}=form;await api(path,'PATCH',{priority,planning_state,objective,hold_reason,next_action,review_date,snapshot});await onDone('Packing-list priority and planning details saved');onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal title="Packing-list planning" subtitle={list.name} onClose={()=>{if(!busy)onClose();}}><div className="modal-body"><form onSubmit={save}>
    <div className="form-grid"><Field label="Packing-list priority"><select value={form.priority} onChange={e=>set('priority',e.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field><Field label="Planning state"><select value={form.planning_state} onChange={e=>set('planning_state',e.target.value)}><option value="active">Open</option><option value="on_hold">On hold</option></select></Field></div>
    <Field label="Onward objective"><textarea maxLength={2000} rows={3} value={form.objective} onChange={e=>set('objective',e.target.value)} placeholder="Where should this batch go, and what needs to happen?"/></Field>
    {form.planning_state==='on_hold'&&<><Field label="Common hold reason"><select value="" onChange={e=>set('hold_reason',e.target.value)}><option value="">Choose a reason to fill below…</option>{['Awaiting client contract for onward transport or storage','Awaiting onward transport','Awaiting storage arrangement','Awaiting client instructions'].map(r=><option key={r}>{r}</option>)}</select></Field><Field label="Hold reason *"><textarea required maxLength={2000} rows={3} value={form.hold_reason} onChange={e=>set('hold_reason',e.target.value)}/></Field></>}
    <Field label="Next action"><textarea rows={2} maxLength={2000} value={form.next_action} onChange={e=>set('next_action',e.target.value)} placeholder="For example: ask the client to confirm the transport or storage contract."/></Field>
    <Field label="Review on"><input type="date" value={form.review_date} onChange={e=>set('review_date',e.target.value)}/></Field>
    <p className="small muted">These details apply to this packing list. Putting it on hold records the operational context; VINs, carriers, dates and load assignments keep their saved values. Date and data-quality alerts remain visible.</p>
    {error&&<div className="error" role="alert">{error}<button type="button" className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{setForm(await api<PackingList>(path));setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Reload saved details</button></div>}
    <div className="modal-footer"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save packing-list planning'}</button></div>
  </form></div></Modal>;
}
