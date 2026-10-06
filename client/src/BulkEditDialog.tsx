import { useMemo, useState } from 'react';
import { ArrowRight, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import type { Unit } from './types';
import { columns } from './importer.js';
import { planBulkEdit } from '../../server/domain.js';
import { api, Modal, Field, toIso, timezone } from './shared';
import { SuggestedInput } from './RouteFields';
type Change={field:string;mode:string;value:string};
export default function BulkEditDialog({units,suggestions,projectId,onClose,onDone}:{units:Unit[];suggestions:Unit[];projectId:string;onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [changes,setChanges]=useState<Change[]>([{field:'origin',mode:'set',value:''}]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const choices=columns.filter(([f])=>f!=='vin');
  const preview=useMemo(()=>{
    try{
      const normalized=changes.map(c=>({...c,value:c.mode==='clear'?'':['etd','eta','atd','ata'].includes(c.field)?toIso(c.value):c.value}));
      const plan=planBulkEdit(units,normalized) as {unit:Unit;update:Record<string,string>}[];
      return {normalized,plan,error:'',updated:plan.filter(p=>Object.keys(p.update).length).length};
    }catch(e){return {normalized:[],plan:[],error:(e as Error).message,updated:0};}
  },[changes,units]);
  const set=(index:number,patch:Partial<Change>)=>setChanges(cs=>cs.map((c,i)=>i===index?{...c,...patch}:c));
  function add(){const f=choices.find(([f])=>!changes.some(c=>c.field===f));if(f)setChanges(cs=>[...cs,{field:f[0],mode:'set',value:''}]);}
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const result=await api<{updated:number;unchanged:number}>(`/api/projects/${projectId}/units/bulk`,'POST',{unitIds:units.map(u=>u.id),changes:preview.normalized});
    await onDone(`${result.updated} vehicles updated · ${result.unchanged} unchanged`);onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal wide title={`Bulk edit ${units.length} vehicles`} subtitle="Apply shared details to every selected VIN. Only the fields you add below will change." onClose={onClose}>
    <form className="modal-body" onSubmit={submit}>
      <div className="info-box"><div><strong>Set a value, fill blanks, or explicitly clear a field.</strong><p>POL/POD, carrier, truck, price, T1, notes and milestones can be edited together. Times use {timezone}. VIN and load assignment stay unchanged.</p></div></div>
      <div className="bulk-change-list">{changes.map((c,i)=><div className="bulk-change" key={i}>
        <Field label={`Field ${i+1}`}><select value={c.field} onChange={e=>set(i,{field:e.target.value,value:''})}>{choices.map(([f,label])=><option key={f} value={f} disabled={changes.some((other,j)=>j!==i&&other.field===f)}>{label}</option>)}</select></Field>
        <Field label={`Action ${i+1}`}><select value={c.mode} onChange={e=>set(i,{mode:e.target.value})}><option value="set">Set value on all selected</option><option value="fill">Fill blank values only</option><option value="clear">Clear this field</option></select></Field>
        <Field label={`Value ${i+1}`}>
          {c.mode==='clear'?<div className="static-field">This field will be cleared</div>:['etd','eta','atd','ata'].includes(c.field)?<input type="datetime-local" value={c.value} onChange={e=>set(i,{value:e.target.value})}/>:c.field==='t1'?<select value={c.value} onChange={e=>set(i,{value:e.target.value})}><option value="">Choose Yes or No</option><option value="yes">Yes</option><option value="no">No</option></select>:c.field==='price'?<input type="number" min="0" step="0.01" value={c.value} onChange={e=>set(i,{value:e.target.value})}/>:c.field==='notes'?<textarea rows={2} maxLength={2000} value={c.value} onChange={e=>set(i,{value:e.target.value})}/>:<SuggestedInput field={c.field} value={c.value} onChange={value=>set(i,{value})} units={suggestions} placeholder="Value to apply"/>}
        </Field>
        <button type="button" className="icon-button" onClick={()=>setChanges(cs=>cs.filter((_,j)=>j!==i))} aria-label={`Remove field ${i+1}`}><Trash2 size={16}/></button>
      </div>)}</div>
      <button type="button" className="secondary" disabled={changes.length===choices.length} onClick={add}><Plus size={15}/>Add another field</button>
      <h3 className="form-section-title">Review before applying</h3>
      {preview.error?<p className="bulk-hint">{preview.error}</p>:<><p className="small muted">{preview.updated} of {units.length} selected vehicles will change. {units.length-preview.updated} already match or have values retained by Fill blanks.</p><div className="preview-table"><table><thead><tr><th>VIN</th><th>Changes</th></tr></thead><tbody>{preview.plan.slice(0,20).map(({unit,update})=><tr key={unit.id}><td className="mono">{unit.vin}</td><td>{Object.entries(update).map(([f,v])=>`${columns.find(([field])=>field===f)?.[1]}: ${v||'(clear)'}`).join(' · ')||'No change'}</td></tr>)}</tbody></table></div>{units.length>20&&<p className="small muted">Preview shows 20 vehicles; all {units.length} selected vehicles are validated.</p>}</>}
      {units.some(u=>u.load_id)&&<p className="small muted">Some vehicles belong to loads. These changes apply to vehicle records only; a later load edit can resynchronise its planned route and dates.</p>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!!preview.error||!preview.updated}>{busy?'Applying…':`Apply to ${units.length} vehicles`}<CheckCircle2 size={16}/></button></div>
    </form>
  </Modal>;
}
