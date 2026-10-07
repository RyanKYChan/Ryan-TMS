import { useState } from 'react';
import { Truck, ArrowRight, Plus, Check, Search } from 'lucide-react';
import type { Load, Unit } from './types';
import { api, Modal, Field, Badge, formatDate, toInput, toIso, timezone } from './shared';
export default function LoadDialog({load,units,projectId,onClose,onDone}:{load?:Load;units:Unit[];projectId:string;onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [form,setForm]=useState({reference:load?.reference||'',carrier:load?.carrier||'',truck:load?.truck||'',driver:load?.driver||'',capacity:load?.capacity||8,origin:load?.origin||'',destination:load?.destination||'',etd:toInput(load?.etd||''),eta:toInput(load?.eta||''),notes:load?.notes||'',cost:load?.cost||'',revenue:load?.revenue||''});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(''),[milestone,setMilestone]=useState('atd'),[time,setTime]=useState(toInput(new Date().toISOString()));
  const assigned=units.filter(u=>u.load_id===load?.id);
  const available=units.filter(u=>!u.load_id&&!['in_transit','delivered'].includes(u.status)&&`${u.vin} ${u.model} ${u.destination}`.toLowerCase().includes(search.toLowerCase()));
  const set=(f:string,v:string|number)=>setForm(x=>({...x,[f]:v}));
  async function action(fn:()=>Promise<unknown>,message:string,close=false){setBusy(true);setError('');try{await fn();await onDone(message);setSelected([]);if(close)onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function save(e:React.FormEvent){e.preventDefault();void action(()=>api(`/api/projects/${projectId}/loads${load?'/'+load.id:''}`,load?'PATCH':'POST',{...form,...(!load?{cost:form.cost||undefined,revenue:form.revenue||undefined}:{}),etd:toIso(form.etd),eta:toIso(form.eta)}),load?'Load updated; route, carrier and planned dates synced to its units':'Load created',true);}
  return <Modal wide title={load?load.reference:'Build a new load'} subtitle={load?'Plan the movement, assign vehicles, and record actual milestones.':'Create a movement for transport or shunting. Assign vehicles after saving.'} onClose={onClose}>
    <div className="modal-body">
      <form onSubmit={save}><div className="form-grid three">
        <Field label="Load reference *"><input required maxLength={100} value={form.reference} onChange={e=>set('reference',e.target.value)} placeholder="e.g. MX-001"/></Field>
        <Field label="Carrier"><input maxLength={100} value={form.carrier} onChange={e=>set('carrier',e.target.value)} placeholder="Transport company"/></Field>
        <Field label="Capacity (units) *"><input required type="number" min={Math.max(1,assigned.length)} max={500} value={form.capacity} onChange={e=>set('capacity',Number(e.target.value))}/></Field>
        <Field label="Truck plate"><input maxLength={100} value={form.truck} onChange={e=>set('truck',e.target.value)}/></Field>
        <Field label="Driver / contact"><input maxLength={100} value={form.driver} onChange={e=>set('driver',e.target.value)}/></Field>
        <div className="field"><span>Planning timezone</span><div className="static-field">{timezone}</div></div>
      </div><div className="route-form"><Field label="Origin / POL city"><input maxLength={100} value={form.origin} onChange={e=>set('origin',e.target.value)} placeholder="Port or compound"/></Field><ArrowRight size={20}/><Field label="Destination / POD city"><input maxLength={100} value={form.destination} onChange={e=>set('destination',e.target.value)} placeholder="Dealer or destination"/></Field></div>
      <div className="form-grid"><Field label="ETD · Estimated departure"><input type="datetime-local" value={form.etd} onChange={e=>set('etd',e.target.value)}/></Field><Field label="ETA · Estimated arrival"><input type="datetime-local" value={form.eta} onChange={e=>set('eta',e.target.value)}/></Field></div>
      <div className="form-grid"><Field label="Load cost (EUR)"><input type="number" min="0" max="10000000" step="0.01" value={form.cost} onChange={e=>set('cost',e.target.value)} placeholder={load?'':'Uses project default when blank'}/></Field><Field label="Load revenue (EUR)"><input type="number" min="0" max="10000000" step="0.01" value={form.revenue} onChange={e=>set('revenue',e.target.value)} placeholder={load?'':'Uses project default when blank'}/></Field></div>
      <Field label="Load notes"><textarea rows={2} maxLength={2000} value={form.notes} onChange={e=>set('notes',e.target.value)}/></Field>
      {load&&<p className="muted small">Saving a load updates route, carrier, truck, ETD and ETA on all assigned units. Actual milestones remain per unit.</p>}
      <div className="modal-footer"><span className="muted small">{load?`${assigned.length} / ${load.capacity} units assigned`:'Vehicle details stay with the project'}</span><button className="primary" disabled={busy}>{busy?'Saving…':load?'Save load changes':'Create load'}<Truck size={16}/></button></div></form>
      {load&&<>
        <h3 className="form-section-title">Assigned vehicles <span className="count">{assigned.length}</span></h3>
        {assigned.length?<div className="preview-table assigned-table"><table><thead><tr><th>VIN</th><th>Model</th><th>Status</th><th>ATD</th><th>ATA</th></tr></thead><tbody>{assigned.map(u=><tr key={u.id}><td className="mono">{u.vin}</td><td>{u.model||'—'}</td><td><Badge stage={u.status}/></td><td>{formatDate(u.atd,true)}</td><td>{formatDate(u.ata,true)}</td></tr>)}</tbody></table></div>:<p className="muted">No units assigned yet. Select vehicles below to build this load.</p>}
        {assigned.length>0&&<div className="milestone-bar"><Field label="Record for units missing this milestone"><select value={milestone} onChange={e=>setMilestone(e.target.value)}><option value="atd">ATD · Actual departure</option><option value="ata">ATA · Actual arrival</option></select></Field><Field label="Actual date and time"><input type="datetime-local" value={time} onChange={e=>setTime(e.target.value)}/></Field><button className="secondary" disabled={busy||!time} onClick={()=>action(()=>api(`/api/projects/${projectId}/loads/${load.id}/milestone`,'POST',{field:milestone,value:toIso(time)}),'Milestone recorded for units with no existing value')}>Record<Check size={15}/></button></div>}
        <h3 className="form-section-title"><Plus size={16}/>Add vehicles to this load</h3><div className="search"><Search size={16}/><input placeholder="Find an available VIN, model, or destination…" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search available units"/></div>
        <div className="unit-picker">{available.map(u=><label key={u.id} className={selected.includes(u.id)?'selected':''}><input type="checkbox" checked={selected.includes(u.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,u.id]:s.filter(id=>id!==u.id))}/><span className="mono">{u.vin}</span><span>{u.model||'Vehicle'}</span><span>{u.destination||'No destination'}</span></label>)}{!available.length&&<p className="muted small">No available units match. Import more vehicles or change your search.</p>}</div>
        <div className="modal-footer"><span>{selected.length} selected · {load.capacity-assigned.length} spaces remaining</span><button className="primary" disabled={busy||!selected.length||selected.length>load.capacity-assigned.length} onClick={()=>action(()=>api(`/api/projects/${projectId}/loads/${load.id}/assign`,'POST',{unitIds:selected}),`${selected.length} units assigned to ${load.reference}`)}>Assign to load<ArrowRight size={16}/></button></div>
      </>}
      {error&&<div className="error" role="alert">{error}</div>}
    </div>
  </Modal>;
}
