import { useMemo, useState } from 'react';
import { ClipboardPaste, ArrowRight, Check, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { inspectGrid, previewRows, columns } from './importer.js';
import { api, Modal, Field, timezone } from './shared';
import type { Unit } from './types';
export default function ImportDialog({projectId,units,onClose,onDone}:{projectId:string;units:Unit[];onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [raw,setRaw]=useState(''),[name,setName]=useState(''),[step,setStep]=useState(0),[mapping,setMapping]=useState<string[]>([]),[order,setOrder]=useState('dmy'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const inspected=useMemo(()=>{try{return {grid:inspectGrid(raw),error:''};}catch(e){return {grid:null,error:(e as Error).message};}},[raw]);
  const grid=inspected.grid;
  const preview=useMemo(()=>grid?previewRows(grid.rows,mapping,units,order):[],[grid,mapping,units,order]);
  const invalid=preview.filter(r=>r.errors.length),newCount=preview.filter(r=>!r.existing).length;
  async function submit(){
    setBusy(true);setError('');try{
      const r=await api<{added:number;updated:number}>(`/api/projects/${projectId}/import`,'POST',{packingList:name,rows:preview.map(r=>r.unit)});
      await onDone(`${r.added} units imported · ${r.updated} existing units updated`);onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Modal wide title="Import from your sheet" subtitle="Copy your cells in Google Sheets. Paste them here. Keep everything in one place." onClose={onClose}>
    <div className="steps"><span className={step===0?'active':'complete'}><b>{step===0?'1':<Check size={12}/>}</b>Paste data</span><ArrowRight size={15}/><span className={step===1?'active':''}><b>2</b>Review & import</span></div>
    {step===0?<div className="modal-body">
      <Field label="Packing list name *"><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="e.g. MAXUS · Vessel arrival 01"/></Field>
      <div className="paste-label"><span><FileSpreadsheet size={17}/>Sheet data</span><span>Headers optional · VINs alone work too</span></div>
      <textarea className="paste-area" value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'Brand\tVIN\tModel\tReference\tETD\tETA\tT1\nMAXUS\tLSFAM11A1RA000001\tDeliver 9\tSPOT-001\t12/10/2026\t13/10/2026\tYes'} aria-label="Paste sheet data"/>
      <div className="info-box"><ClipboardPaste size={19}/><div><strong>Your usual sheet columns are supported.</strong><p>Brand, VIN, Model, Reference, Status, port and dealer addresses, all four milestones, Carrier, Truck plate, Price(EUR), and T1. Comments and Port Comment are merged.</p></div></div>
      {inspected.error&&<div className="error" role="alert">{inspected.error}</div>}
      <div className="modal-footer"><span>{grid?.rows.length||0} rows detected</span><button className="primary" disabled={!name.trim()||!grid?.rows.length||!!inspected.error||grid.rows.length>10000} onClick={()=>{setMapping(grid!.mapping);setStep(1);}}>Review data<ArrowRight size={16}/></button></div>
    </div>:<div className="modal-body">
      <div className="review-summary"><div><b>{newCount}</b><span>New units</span></div><div><b>{preview.length-newCount}</b><span>Existing VINs</span></div><div className={invalid.length?'text-red':'text-green'}><b>{invalid.length}</b><span>Rows to fix</span></div><Field label="Date format"><select value={order} onChange={e=>setOrder(e.target.value)}><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option></select></Field></div>
      <details className="mapping" open={!mapping.includes('vin')}><summary>Column mapping · {mapping.filter(Boolean).length} of {mapping.length} columns matched</summary><div className="mapping-grid">{grid?.headers.map((h,i)=><Field key={i} label={h}><select value={mapping[i]||''} onChange={e=>setMapping(m=>m.map((v,j)=>i===j?e.target.value:v))}><option value="">Ignore column</option>{columns.map(([f,l])=><option key={f} value={f}>{l}</option>)}</select></Field>)}</div></details>
      <p className="muted small">Existing VINs are updated within this project. Blank cells preserve existing data; supplied values replace it. Importing into a new list moves the unit to that list. Dates without a timezone use {timezone}.</p>
      <div className="preview-table"><table><thead><tr><th>Row</th><th>VIN</th><th>Brand / model</th><th>Route</th><th>Result</th></tr></thead><tbody>{preview.slice(0,100).map(r=><tr key={r.index}><td>{r.index}</td><td className="mono">{r.unit.vin||'Missing VIN'}</td><td>{r.unit.brand} {r.unit.model}</td><td>{r.unit.origin||'—'} → {r.unit.destination||'—'}</td><td>{r.errors.length?<span className="import-invalid"><AlertCircle size={13}/>{r.errors.join(' ')}</span>:<span className="import-valid"><Check size={13}/>{r.existing?'Update':'Ready'}</span>}</td></tr>)}</tbody></table></div>
      {preview.length>100&&<p className="small muted">Showing the first 100 of {preview.length} rows. All rows are validated and imported.</p>}
      {!mapping.includes('vin')&&<div className="error">Map a column to VIN to continue.</div>}
      {invalid.length>0&&<div className="error" role="alert">Fix {invalid.length} row(s) before importing. {invalid.slice(0,5).map(r=>`Row ${r.index}: ${r.errors.join(' ')}`).join(' ')}</div>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer"><button className="secondary" disabled={busy} onClick={()=>setStep(0)}>Back to paste</button><button className="primary" onClick={submit} disabled={busy||invalid.length>0||!preview.length||!mapping.includes('vin')}>{busy?'Importing…':`Import ${preview.length} units`}<ArrowRight size={16}/></button></div>
    </div>}
  </Modal>;
}
