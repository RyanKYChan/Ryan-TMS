import { useState } from 'react';
import { ArrowRight, Truck } from 'lucide-react';
import { api, Field, Modal } from './shared';
import type { Carrier, Unit } from './types';
type Review={rows:{id:string;vin:string;before:string;after:string;load:string;truck:string}[];snapshot:string;assigned:number;unchanged:number};
export default function CarrierAssignDialog({projectId,units,carriers,onClose,onDone}:{projectId:string;units:Unit[];carriers:Carrier[];onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [carrierId,setCarrierId]=useState(units.length&&carriers[0]?.id||'new'),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [review,setReview]=useState<Review|null>(null),[target,setTarget]=useState<Carrier|null>(null);
  async function prepare(){
    setBusy(true);setError('');try{
      const c=carrierId==='new'?await api<Carrier>(`/api/projects/${projectId}/carriers`,'POST',{name}):carriers.find(c=>c.id===carrierId)!;
      if(!units.length){await onDone(`Carrier ${c.name} added`);onClose();return;}
      setTarget(c);setReview(await api<Review>(`/api/projects/${projectId}/carriers/${c.id}/assign/preview`,'POST',{unitIds:units.map(u=>u.id)}));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function apply(){
    setBusy(true);setError('');try{
      const r=await api<{assigned:number;unchanged:number}>(`/api/projects/${projectId}/carriers/${target!.id}/assign`,'POST',{unitIds:units.map(u=>u.id),snapshot:review!.snapshot,confirmCarrierChanges:true});
      await onDone(`${r.assigned} vehicles assigned to ${target!.name}${r.unchanged?` · ${r.unchanged} already assigned`:''}`);onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Modal title={units.length?'Assign / change carrier':'Add carrier'} subtitle={units.length?`${units.length} selected vehicles · packing-list order`:'Create a carrier workspace.'} onClose={onClose}>
    <div className="modal-body">
      {review?<><p>{review.assigned} VINs will be assigned to <strong>{target!.name}</strong>. {review.unchanged} already assigned.</p><p>Previous planned load links and truck plates are removed when changing carrier. Routes, dates, notes, packing lists and history stay saved. Departed or delivered VINs cannot be reassigned.</p><div className="preview-table"><table><thead><tr><th>VIN</th><th>From</th><th>To</th><th>Load to remove</th></tr></thead><tbody>{review.rows.map(r=><tr key={r.id}><td className="mono">{r.vin}</td><td>{r.before||'Unassigned'}</td><td>{r.after}</td><td>{r.load||'None'}</td></tr>)}</tbody></table></div></>:<>
      {units.length>0&&<div className="info-box"><Truck size={20}/><div><strong>{units.length} vehicles selected</strong><p>First: {units[0].vin}<br/>Last: {units[units.length-1].vin}</p></div></div>}
      {units.length>0&&<Field label="Assign carrier *"><select value={carrierId} onChange={e=>setCarrierId(e.target.value)}>{carriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">+ New carrier</option></select></Field>}
      {(carrierId==='new'||!units.length)&&<Field label="Carrier name *"><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="Enter the carrier’s name" autoFocus/></Field>}
      {units.length>0&&<p>Select an existing carrier to move this whole batch. You’ll review every assignment and any planned load removals before confirming.</p>}
      </>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer"><button className="secondary" disabled={busy} onClick={()=>review?setReview(null):onClose()}>{review?'Back':'Cancel'}</button><button className="primary" disabled={busy||(!review&&(carrierId==='new'||!units.length)&&!name.trim())} onClick={review?apply:prepare}>{busy?'Saving…':review?`Confirm assignment · ${review.assigned} VINs`:units.length?'Review assignments':'Add carrier'}<ArrowRight size={16}/></button></div>
    </div>
  </Modal>;
}
