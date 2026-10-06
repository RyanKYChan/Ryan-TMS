import { useState } from 'react';
import { ArrowRight, Truck } from 'lucide-react';
import { api, Field, Modal } from './shared';
import type { Carrier, Unit } from './types';

export default function CarrierAssignDialog({projectId,units,carriers,onClose,onDone}:{projectId:string;units:Unit[];carriers:Carrier[];onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [carrierId,setCarrierId]=useState(units.length&&carriers[0]?.id||'new'),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(){
    setBusy(true);setError('');
    try{
      const c=carrierId==='new'?await api<Carrier>(`/api/projects/${projectId}/carriers`,'POST',{name}):carriers.find(c=>c.id===carrierId)!;
      if(units.length){
        const r=await api<{assigned:number;unchanged:number}>(`/api/projects/${projectId}/carriers/${c.id}/assign`,'POST',{unitIds:units.map(u=>u.id)});
        await onDone(`${r.assigned} vehicles assigned to ${c.name}${r.unchanged?` · ${r.unchanged} already assigned`:''}`);
      }else await onDone(`Carrier ${c.name} added`);
      onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Modal title={units.length?'Assign vehicles to a carrier':'Add carrier'} subtitle={units.length?`${units.length} selected vehicles · packing-list order`:'Create a separate workspace for this carrier’s sheet updates.'} onClose={onClose}>
    <div className="modal-body">
      {units.length>0&&<div className="info-box"><Truck size={20}/><div><strong>{units.length} vehicles selected</strong><p>First: {units[0].vin}<br/>Last: {units[units.length-1].vin}</p></div></div>}
      {units.length>0&&<Field label="Assign carrier *"><select value={carrierId} onChange={e=>setCarrierId(e.target.value)}>{carriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">+ New carrier</option></select></Field>}
      {(carrierId==='new'||!units.length)&&<Field label="Carrier name *"><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="Enter the carrier’s name" autoFocus/></Field>}
      {units.length>0&&<p className="small muted">Assignment keeps the packing list, route, dates, and notes. Vehicles can have a carrier before they have a load. To change a vehicle already on a load, change the carrier in Load builds or remove it from its load first.</p>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy||((carrierId==='new'||!units.length)&&!name.trim())} onClick={submit}>{busy?'Saving…':units.length?`Assign ${units.length} vehicles`:'Add carrier'}<ArrowRight size={16}/></button></div>
    </div>
  </Modal>;
}
