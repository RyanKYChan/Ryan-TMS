import { useMemo, useState } from 'react';
import { ArrowRight, ClipboardPaste, Check } from 'lucide-react';
import { inspectCarrierGrid, previewCarrierRows } from './carrier-importer.js';
import { columns } from './importer.js';
import { api, Badge, Field, Modal, formatDate, timezone } from './shared';
import type { Carrier, Stage, Unit } from './types';

type Change={field:string;before:string;after:string};
type Review={snapshot:string;rows:{vin:string;changes:Change[];beforeStatus:Stage;afterStatus:Stage;loadBefore:string;loadAfter:string}[];groups:{reference:string;new:boolean;unitCount:number;vins:string[]}[];counts:{matched:number;changed:number;unchanged:number;loadsCreated:number;loadMoves:number}};
const label=(f:string)=>f==='load'?'Load':columns.find(([field])=>field===f)?.[1]||f;
const display=(f:string,v:string)=>v?['etd','eta','atd','ata'].includes(f)?formatDate(v,true):v:'blank';

export default function CarrierUpdateDialog({projectId,carrier,units,onClose,onDone}:{projectId:string;carrier:Carrier;units:Unit[];onClose:()=>void;onDone:(message:string)=>Promise<void>}){
  const [raw,setRaw]=useState(''),[headerMode,setHeaderMode]=useState('auto'),[order,setOrder]=useState('dmy'),[groupLoads,setGroupLoads]=useState(true),[overrides,setOverrides]=useState<Record<number,string>>({});
  const [review,setReview]=useState<Review|null>(null),[payload,setPayload]=useState<unknown>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const inspected=useMemo(()=>{try{return {grid:inspectCarrierGrid(raw,{headerMode}),error:''};}catch(e){return {grid:null,error:(e as Error).message};}},[raw,headerMode]);
  const grid=inspected.grid,mapping=grid?.mapping.map((f,i)=>overrides[i]??f)||[];
  const preview=grid?previewCarrierRows(grid,mapping,units,carrier.name,order,groupLoads):[],invalid=preview.filter(r=>r.errors.length);
  const groupingAvailable=!!grid&&(grid.hasGaps||mapping.includes('load_reference'));
  async function prepare(){
    setBusy(true);setError('');try{
      const body={rows:preview.map(r=>r.unit),groupLoads:groupLoads&&groupingAvailable};
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
    <div className="modal-body">
      {!review?<>
        <div className="info-box"><ClipboardPaste size={20}/><div><strong>Match existing VINs and track the changes.</strong><p>Blank cells preserve saved values. VINs missing from this paste stay in the carrier’s workspace. Copy the blank rows too if they separate load builds.</p></div></div>
        <textarea className="paste-area" aria-label="Paste carrier sheet" value={raw} onChange={e=>{setRaw(e.target.value);setOverrides({});setError('');}} placeholder={'VIN\tLoad\tETD\tETA\tATD\tATA\nLSFAM11A1RA000001\tTruck 01\t12/10/2026 08:00\t13/10/2026 12:00\t\t'}/>
        <div className="form-grid"><Field label="Header row"><select value={headerMode} onChange={e=>{setHeaderMode(e.target.value);setOverrides({});}}><option value="auto">Detect automatically</option><option value="yes">First row contains headers</option><option value="no">No headers · data only</option></select></Field><Field label="Date format"><select value={order} onChange={e=>setOrder(e.target.value)}><option value="dmy">Day / month / year</option><option value="mdy">Month / day / year</option></select></Field></div>
        {grid&&grid.rows.length>0&&<>
          <details className="mapping" open={mapping.some(f=>!f)}><summary>Column mapping · {mapping.filter(Boolean).length} of {mapping.length} matched</summary><div className="mapping-grid">{grid?.headers.map((h,i)=><Field key={i} label={h}><select value={mapping[i]||''} onChange={e=>setOverrides(m=>({...m,[i]:e.target.value}))}><option value="">Ignore column</option>{[...columns,['load_reference','Load reference']].map(([f,l])=><option key={f} value={f}>{l}</option>)}</select></Field>)}</div></details>
          {mapping.some(f=>!f)&&<p className="import-warning">{mapping.filter(f=>!f).length} column(s) will be ignored. Map them above if needed.</p>}
          <label className="remember-mapping"><input type="checkbox" checked={groupLoads&&groupingAvailable} disabled={!groupingAvailable} onChange={e=>setGroupLoads(e.target.checked)}/>Apply load groups from {mapping.includes('load_reference')?'load references and blank rows':'blank-row gaps'}</label>
          <p className="small muted">{groupingAvailable?'The next screen shows each proposed load. Repeating the same groups reuses saved loads. Planned vehicles can move between groups; departed or delivered vehicles keep their load.':'No load references or separating gaps detected. Saved load assignments will be kept.'} Dates use {timezone}.</p>
          <div className="preview-table"><table><thead><tr><th>Row</th><th>VIN</th><th>Group / load</th><th>Result</th></tr></thead><tbody>{preview.map(r=><tr key={r.index}><td>{r.index}</td><td className="mono">{r.unit.vin||'Missing VIN'}</td><td>{r.loadReference||(groupLoads&&grid.hasGaps?`Group ${Number(r.group)+1}`:'Keep saved load')}</td><td>{r.errors.length?<span className="import-invalid">{r.errors.join(' ')}</span>:<span className="import-valid"><Check size={13}/>Matched</span>}</td></tr>)}</tbody></table></div>
        </>}
        {(inspected.error||invalid.length>0)&&<div className="error" role="alert">{inspected.error||`Fix ${invalid.length} row(s) before continuing. ${invalid.slice(0,3).map(r=>`${r.unit.vin}: ${r.errors.join(' ')}`).join(' ')}`}</div>}
      </>:<>
        <div className="review-summary"><div><b>{review.counts.matched}</b><span>Matched VINs</span></div><div><b>{review.counts.changed}</b><span>Changed VINs</span></div><div><b>{review.counts.unchanged}</b><span>Unchanged</span></div><div><b>{review.counts.loadsCreated}</b><span>New load builds</span></div></div>
        {review.groups.length>0&&<div className="proposed-loads"><h3>Load groups to apply</h3>{review.groups.map(g=><div className="proposed-load" key={g.reference}><strong>{g.reference}</strong><span>{g.unitCount} VINs · {g.new?'Create load':'Use existing load'}</span></div>)}</div>}
        {review.counts.loadMoves>0&&<p className="import-warning">{review.counts.loadMoves} planned vehicle(s) will move from an existing load to the proposed group. Old load records remain in the load register.</p>}
        <p className="small muted">Only the changes below will be saved. Packing-list membership and VIN order stay the same. A checked paste is recorded even when nothing changed.</p>
        <div className="preview-table changes-table"><table><thead><tr><th>VIN</th><th>Status after update</th><th>Changes</th></tr></thead><tbody>{review.rows.map(r=><tr key={r.vin}><td className="mono">{r.vin}</td><td><Badge stage={r.afterStatus}/></td><td>{r.changes.length?r.changes.map(change=><div className="field-change" key={change.field}><b>{label(change.field)}</b><span>{display(change.field,change.before)} <ArrowRight size={12}/> {display(change.field,change.after)}</span></div>):<span className="muted">No change</span>}</td></tr>)}</tbody></table></div>
      </>}
      {error&&<div className="error" role="alert">{error}</div>}
      <div className="modal-footer">{review?<><button className="secondary" disabled={busy} onClick={()=>{setReview(null);setError('');}}>Back to paste</button><button className="primary" disabled={busy} onClick={apply}>{busy?'Applying…':`Apply update · ${review.counts.changed} changed`}<Check size={16}/></button></>:<><span>{preview.length} VINs detected</span><button className="primary" onClick={prepare} disabled={busy||!preview.length||preview.length>10000||invalid.length>0||!mapping.includes('vin')}>{busy?'Checking saved data…':'Review changes'}<ArrowRight size={16}/></button></>}</div>
    </div>
  </Modal>;
}
