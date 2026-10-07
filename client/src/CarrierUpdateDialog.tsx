import { ScheduleRiskPreview } from './Operations';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ClipboardPaste, Check } from 'lucide-react';
import { inspectCarrierGrid, previewCarrierRows } from './carrier-importer.js';
import { columns } from './importer.js';
import { api, Badge, Field, Modal, formatDate, timezone } from './shared';
import type { Carrier, Stage, Unit } from './types';

type Change={field:string;before:string;after:string};
type Review={risks:{field:string;before:string;after:string;vin:string;unit_id:string;load_reference:string;carrier:string;deltaMinutes:number}[];snapshot:string;rows:{vin:string;unit:Unit;notice:string;classification:'load'|'pool';changes:Change[];beforeStatus:Stage;afterStatus:Stage;loadBefore:string;loadAfter:string}[];groups:{reference:string;new:boolean;unitCount:number;vins:string[]}[];counts:{matched:number;changed:number;unchanged:number;loadsCreated:number;loadMoves:number;loadsReleased:number;built:number;pool:number}};
const label=(f:string)=>f==='load'?'Load':columns.find(([field])=>field===f)?.[1]||f;
const display=(f:string,v:string)=>v?['etd','eta','atd','ata'].includes(f)?formatDate(v,true):v:'blank';

export default function CarrierUpdateDialog({projectId,carrier,units,onClose,onDone}:{projectId:string;carrier:Carrier;units:Unit[];onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [raw,setRaw]=useState(''),[headerMode,setHeaderMode]=useState('auto'),[order,setOrder]=useState('dmy'),[groupLoads,setGroupLoads]=useState(true),[overrides,setOverrides]=useState<Record<number,string>>({}),[sectionOverrides,setSectionOverrides]=useState<Record<string,'load'|'pool'>>({}),[changesOnly,setChangesOnly]=useState(false);
  const [review,setReview]=useState<Review|null>(null),[payload,setPayload]=useState<unknown>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const bodyRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{bodyRef.current?.closest('dialog')?.scrollTo({top:0});},[review]);
  const inspected=useMemo(()=>{try{return {grid:inspectCarrierGrid(raw,{headerMode}),error:''};}catch(e){return {grid:null,error:(e as Error).message};}},[raw,headerMode]);
  const grid=inspected.grid,mapping=grid?.mapping.map((f,i)=>overrides[i]??f)||[];
  const preview=grid?previewCarrierRows(grid,mapping,units,carrier.name,order,groupLoads,sectionOverrides):[],invalid=preview.filter(r=>r.errors.length);
  const groupingAvailable=!!grid?.rows.length;
  const sectionMap=new Map<string,typeof preview>();for(const row of preview){if(!sectionMap.has(row.section))sectionMap.set(row.section,[]);sectionMap.get(row.section)!.push(row);}
  const sections=[...sectionMap].map(([id,rows])=>({id,rows,type:rows[0].classification,reference:rows[0].loadReference}));
  const built=preview.filter(r=>r.classification==='load').length,pool=preview.filter(r=>r.classification==='pool').length;
  const shown=review?review.rows.filter(r=>!changesOnly||r.changes.length):[];
  async function prepare(){
    setBusy(true);setError('');try{
      const body={rows:preview.map(r=>r.unit),groupLoads};
      const result=await api<Review>(`/api/projects/${projectId}/carriers/${carrier.id}/updates/preview`,'POST',body);
      setPayload(body);setReview(result);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function apply(){
    setBusy(true);setError('');try{
      const r=await api<Review['counts']>(`/api/projects/${projectId}/carriers/${carrier.id}/updates`,'POST',{...(payload as object),snapshot:review!.snapshot});
      await onDone(`${carrier.name}: ${r.changed} changed · ${r.unchanged} unchanged · ${r.loadsCreated} loads created`);onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Modal wide title={`Update ${carrier.name} from sheet`} subtitle="Paste whenever the carrier’s Google Sheet changes. Review, then apply." onClose={onClose}>
    <div className="modal-body" ref={bodyRef}>
      {!review?<>
        <div className="info-box"><ClipboardPaste size={20}/><div><strong>Paste the full carrier batch, including the unassigned VINs.</strong><p>Gaps separate load builds. The unbroken remainder without planning details stays unassigned to a load. Blank dates preserve saved dates; VINs omitted from a paste stay in place.</p></div></div>
        <textarea className="paste-area" aria-label="Paste carrier sheet" value={raw} onChange={e=>{setRaw(e.target.value);setOverrides({});setSectionOverrides({});setError('');}} placeholder={'VIN\tLoad\tETD\tETA\tATD\tATA\nLSFAM11A1RA000001\tTruck 01\t12/10/2026 08:00\t13/10/2026 12:00\t\t'}/>
        <div className="form-grid"><Field label="Header row"><select value={headerMode} onChange={e=>{setHeaderMode(e.target.value);setOverrides({});}}><option value="auto">Detect automatically</option><option value="yes">First row contains headers</option><option value="no">No headers · data only</option></select></Field><Field label="Date format"><select value={order} onChange={e=>setOrder(e.target.value)}><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option></select></Field></div>
        {grid&&grid.rows.length>0&&<>
          <details className="mapping" open={mapping.some(f=>!f)}><summary>Column mapping · {mapping.filter(Boolean).length} of {mapping.length} matched</summary><div className="mapping-grid">{grid?.headers.map((h,i)=><Field key={i} label={h}><select value={mapping[i]||''} onChange={e=>setOverrides(m=>({...m,[i]:e.target.value}))}><option value="">Ignore column</option>{[...columns,['load_reference','Load reference']].map(([f,l])=><option key={f} value={f}>{l}</option>)}</select></Field>)}</div></details>
          {mapping.some(f=>!f)&&<p className="import-warning">{mapping.filter(f=>!f).length} column(s) will be ignored. Map them above if needed.</p>}
          <label className="remember-mapping"><input type="checkbox" checked={groupLoads} disabled={!groupingAvailable} onChange={e=>setGroupLoads(e.target.checked)}/>Sync planned load membership from this full sheet</label>
          <p className="small muted">Load references and gap-separated groups are read automatically. A dated/trucked prefix before the unassigned remainder is a load too. Trailing empty rows are ignored. Turn off membership sync to update fields only. Dates use {timezone}.</p>
          <div className="review-summary"><div><b>{preview.length}</b><span>VINs in full sheet</span></div><div><b>{sections.filter(s=>s.type==='load').length}</b><span>Detected loads</span></div><div><b>{built}</b><span>VINs on load builds</span></div><div><b>{pool}</b><span>Not load built</span></div></div>
          {groupLoads&&<div className="sheet-sections">{sections.map((section,i)=><div className="sheet-section" key={section.id}><div><strong>{section.reference||`Sheet section ${i+1}`}</strong><span>{section.rows.length} VINs · {section.rows.filter(r=>r.unit.etd).length} ETDs · {section.rows.filter(r=>r.unit.truck).length} truck plates</span></div><Field label={`Section ${i+1} treatment`}><select value={section.type} onChange={e=>setSectionOverrides(o=>({...o,[section.id]:e.target.value as 'load'|'pool'}))}><option value="load">Load build</option><option value="pool">Unassigned to a load</option></select></Field></div>)}</div>}
          <div className="preview-table sheet-table"><table><thead><tr><th>Row</th><th>Load treatment</th>{grid.headers.map((h,i)=><th key={i}>{h}</th>)}<th>Match</th></tr></thead><tbody>{preview.map((r,i)=><tr key={r.index} className={r.classification==='pool'?'pool-row':''}><td>{r.index}</td><td><span className={`sheet-tag ${r.classification}`}>{r.classification==='load'?r.loadReference||`Load section ${sections.findIndex(s=>s.id===r.section)+1}`:r.classification==='pool'?'Not load built':'Keep saved load'}</span></td>{grid.rows[i].map((cell,j)=><td className={mapping[j]==='vin'?'mono vin-cell':'sheet-cell'} key={j}>{cell||'—'}</td>)}<td>{r.errors.length?<span className="import-invalid">{r.errors.join(' ')}</span>:<span className="import-valid"><Check size={13}/>Matched</span>}</td></tr>)}</tbody></table></div>
        </>}
        {(inspected.error||invalid.length>0)&&<div className="error" role="alert">{inspected.error||`Fix ${invalid.length} row(s) before continuing. ${invalid.slice(0,3).map(r=>`${r.unit.vin}: ${r.errors.join(' ')}`).join(' ')}`}</div>}
      </>:<>
        <div className="review-summary"><div><b>{review.counts.matched}</b><span>Matched VINs</span></div><div><b>{review.counts.changed}</b><span>Changed VINs</span></div><div><b>{review.counts.unchanged}</b><span>Unchanged</span></div><div><b>{review.counts.loadsCreated}</b><span>New load builds</span></div><div><b>{review.counts.built}</b><span>VINs on loads</span></div><div><b>{review.counts.pool}</b><span>Not load built</span></div></div>
        <ScheduleRiskPreview risks={review.risks}/>{review.groups.length>0&&<div className="proposed-loads"><h3>Load groups to apply</h3>{review.groups.map(g=><div className="proposed-load" key={g.reference}><strong>{g.reference}</strong><span>{g.unitCount} VINs · {g.new?'Create load':'Use existing load'}</span></div>)}</div>}
        {review.counts.loadMoves>0&&<p className="import-warning">{review.counts.loadMoves} planned vehicle(s) will move from an existing load to the proposed group. Old load records remain in the load register.</p>}
        {review.counts.loadsReleased>0&&<p className="import-warning">{review.counts.loadsReleased} planned VIN(s) are now in the unassigned remainder and will be removed from their load. Their saved dates are kept. Departed and delivered load assignments are retained.</p>}
        <label className="remember-mapping"><input type="checkbox" checked={changesOnly} onChange={e=>setChangesOnly(e.target.checked)}/>Show changed VINs only</label>
        <p className="small muted">Only the changes below will be saved. Packing-list membership and VIN order stay the same. A checked paste is recorded even when nothing changed.</p>
        <div className="preview-table changes-table sheet-table"><table><thead><tr><th>VIN</th><th>Status after update</th><th>Load after update</th><th>Changes</th>{columns.filter(([f])=>f!=='vin').map(([f,l])=><th key={f}>{l}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={r.vin} className={r.classification==='pool'?'pool-row':''}><td className="mono vin-cell">{r.vin}</td><td><Badge stage={r.afterStatus}/></td><td><span className={`sheet-tag ${r.classification}`}>{r.loadAfter||'Not load built'}</span>{r.notice&&<p className="small muted">{r.notice}</p>}</td><td>{r.changes.length?<details className="change-details" open={r.changes.length<=3}><summary>{r.changes.length} field{r.changes.length===1?'':'s'} changed</summary>{r.changes.map(change=><div className="field-change" key={change.field}><b>{label(change.field)}</b><span>{display(change.field,change.before)} <ArrowRight size={12}/> {display(change.field,change.after)}</span></div>)}</details>:<span className="muted">No change</span>}</td>{columns.filter(([f])=>f!=='vin').map(([f])=><td className="sheet-cell" key={f}>{display(f,String(r.unit[f as keyof Unit]||''))}</td>)}</tr>)}</tbody></table></div>
      </>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer">{review?<><button className="secondary" disabled={busy} onClick={()=>{setReview(null);setError('');}}>Back to paste</button><button className="primary" disabled={busy} onClick={apply}>{busy?'Applying…':`Apply update · ${review.counts.changed} changed`}<Check size={16}/></button></>:<><span>{preview.length} VINs detected</span><button className="primary" onClick={prepare} disabled={busy||!preview.length||preview.length>10000||invalid.length>0||!mapping.includes('vin')}>{busy?'Checking saved data…':'Review changes'}<ArrowRight size={16}/></button></>}</div>
    </div>
  </Modal>;
}
