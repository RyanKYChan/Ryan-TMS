import { useState } from 'react';
import { MapPin, Clock3, Truck, CheckCircle2 } from 'lucide-react';
import type { Unit, Event } from './types';
import { api, Modal, Field, Badge, formatDate, toInput, toIso, timezone } from './shared';
const general:[keyof Unit,string][]=[['brand','Brand'],['model','Model'],['reference','Reference'],['dealer','Dealer name'],['carrier','Carrier'],['truck','Truck plate']];
const pol:[keyof Unit,string][]=[['pol_country','Country'],['origin','City'],['pol_zipcode','Postcode'],['pol_address','Address']];
const pod:[keyof Unit,string][]=[['pod_country','Country'],['destination','City'],['pod_zipcode','Postcode'],['pod_address','Address']];
export default function UnitDrawer({unit,projectId,events,onClose,onDone}:{unit:Unit;projectId:string;events:Event[];onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [form,setForm]=useState<Record<string,string>>({...Object.fromEntries(Object.entries(unit).filter(([,v])=>typeof v==='string')),etd:toInput(unit.etd),eta:toInput(unit.eta),atd:toInput(unit.atd),ata:toInput(unit.ata)}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const set=(f:string,v:string)=>setForm(x=>({...x,[f]:v}));
  const fields=(items:[keyof Unit,string][])=>items.map(([f,l])=><Field key={f} label={l}><input value={form[f]||''} onChange={e=>set(f,e.target.value)} maxLength={500}/></Field>);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
    await api(`/api/projects/${projectId}/units/${unit.id}`,'PATCH',{...form,...Object.fromEntries(['etd','eta','atd','ata'].map(f=>[f,toIso(form[f])]))});
    await onDone('Unit details saved');onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function removeLoad(){setBusy(true);setError('');try{await api(`/api/projects/${projectId}/units/${unit.id}/unassign`,'POST',{});await onDone('Unit removed from load; planned dates cleared');onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal drawer title={unit.vin} subtitle={`${unit.brand||'Vehicle'} ${unit.model} · ${unit.packing_list||'No packing list'}`} onClose={onClose}>
    <form onSubmit={save} className="modal-body">
      <div className="drawer-status"><Badge stage={unit.status}/><span className="muted small">{unit.load_ref?<><Truck size={14}/>{unit.load_ref}</>:'Awaiting load assignment'}</span></div>
      <h3 className="form-section-title">Vehicle details</h3><div className="form-grid">{fields(general)}
        <Field label="Price (EUR)"><input type="number" min="0" step="0.01" max="10000000" value={form.price||''} onChange={e=>set('price',e.target.value)}/></Field>
        <Field label="T1 customs document"><select value={form.t1||''} onChange={e=>set('t1',e.target.value)}><option value="">Not specified</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
      </div>
      <h3 className="form-section-title"><MapPin size={15}/>Port of loading (POL)</h3><div className="form-grid">{fields(pol)}</div>
      <h3 className="form-section-title"><MapPin size={15}/>Place of delivery (POD)</h3><div className="form-grid">{fields(pod)}</div>
      <h3 className="form-section-title"><Clock3 size={15}/>Transport milestones</h3><p className="small muted">Times use {timezone}. Actual dates take precedence over sheet status.</p>
      <div className="form-grid milestones">{(['etd','eta','atd','ata'] as const).map(f=><Field key={f} label={`${f.toUpperCase()} · ${f==='etd'?'Estimated departure':f==='eta'?'Estimated arrival':f==='atd'?'Actual departure':'Actual arrival'}`}><div className="date-input"><input type="datetime-local" value={form[f]} onChange={e=>set(f,e.target.value)}/>{f.startsWith('a')&&<button type="button" title="Use current time" onClick={()=>set(f,toInput(new Date().toISOString()))}>Now</button>}</div></Field>)}</div>
      <Field label="Sheet status"><input value={form.source_status||''} onChange={e=>set('source_status',e.target.value)} list="sheet-statuses"/><datalist id="sheet-statuses"><option value="Unscheduled"/><option value="Scheduled"/><option value="In transit"/><option value="Delivered"/></datalist></Field>
      <Field label="Comments & port comments"><textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} maxLength={2000} rows={3} placeholder="Operational notes, exceptions, or delivery instructions"/></Field>
      {unit.load_id&&!['in_transit','delivered'].includes(unit.status)&&<button type="button" className="text-button danger" disabled={busy} onClick={removeLoad}>Remove from load & clear planned dates</button>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer sticky-footer"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save changes'}<CheckCircle2 size={16}/></button></div>
      <h3 className="form-section-title">Activity history</h3><div className="activity-list">{events.filter(e=>e.unit_id===unit.id).slice(0,10).map(e=><div className="activity" key={e.id}><i/><div><p>{e.description}</p><span>{formatDate(e.created_at,true)}</span></div></div>)}{!events.some(e=>e.unit_id===unit.id)&&<p className="muted small">No recent activity in the project’s last 50 events.</p>}</div>
    </form>
  </Modal>;
}
