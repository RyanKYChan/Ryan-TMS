import { ProjectLoadSummary } from './Operations';
import { useState } from 'react';
import { ArrowRight, ClipboardPaste, Copy, Truck } from 'lucide-react';
import { Badge, Empty, formatDate } from './shared';
import type { Carrier, Unit, Workspace } from './types';
import CarrierUpdateDialog from './CarrierUpdateDialog';

export function CarrierProgress({ws,onOpen,onUnassigned}:{ws:Workspace;onOpen:(id:string)=>void;onUnassigned:()=>void}){
  const carriers=ws.carriers,unassigned=ws.units.filter(u=>!u.carrier);
  const groups=[...carriers.map(c=>({id:c.id,name:c.name,lastUpdate:c.last_update,units:ws.units.filter(u=>u.carrier.toLowerCase()===c.name.toLowerCase())})),...(unassigned.length?[{id:'unassigned',name:'Awaiting carrier assignment',lastUpdate:null,units:unassigned}]:[])];
  return <section className="panel carrier-progress"><div className="panel-heading"><div><h3>Progress by carrier <span className="count">{carriers.length}</span></h3><p>Assigned VINs, planning, actual movement, and the latest sheet check</p></div><Truck size={19}/></div>{groups.length?<div className="table-scroll"><table><thead><tr><th>Carrier</th><th>Assigned</th><th>Not load built</th><th>Awaiting plan</th><th>Scheduled</th><th>Ready to go</th><th>In transit</th><th>Delivered</th><th>ETD / ETA</th><th>ATD / ATA</th><th>Last sheet check</th></tr></thead><tbody>{groups.map(g=><tr key={g.id}><td><button className="load-link" onClick={()=>g.id==='unassigned'?onUnassigned():onOpen(g.id)} aria-label={`Open ${g.name}`}>{g.name}<ArrowRight size={13}/></button></td><td><b>{g.units.length}</b></td><td>{g.units.filter(u=>!u.load_id).length}</td><td>{g.units.filter(u=>u.status==='unscheduled').length}</td><td>{g.units.filter(u=>u.status==='scheduled').length}</td><td>{g.units.filter(u=>u.status==='ready').length}</td><td>{g.units.filter(u=>u.status==='in_transit').length}</td><td className="text-green">{g.units.filter(u=>u.status==='delivered').length}</td><td>{g.units.filter(u=>u.etd).length} / {g.units.filter(u=>u.eta).length}</td><td>{g.units.filter(u=>u.atd).length} / {g.units.filter(u=>u.ata).length}</td><td>{g.lastUpdate?formatDate(g.lastUpdate,true):'No sheet checked'}</td></tr>)}</tbody></table></div>:<p className="carrier-empty">Assign vehicles from the unit register to see progress here.</p>}</section>;
}

export default function CarrierWorkspace({ws,initialCarrier,onDone,onUnit,onLoad,onRegister,onAdd}:{ws:Workspace;initialCarrier:string;onDone:(message:string)=>Promise<void>;onUnit:(id:string)=>void;onLoad:(id:string)=>void;onRegister:(name:string|null)=>void;onAdd:()=>void}){
  const [carrierId,setCarrierId]=useState(initialCarrier),[pasting,setPasting]=useState(false),[copyMessage,setCopyMessage]=useState(''),[search,setSearch]=useState('');
  const c=ws.carriers.find(c=>c.id===carrierId),assigned=c?ws.units.filter(u=>u.carrier.toLowerCase()===c.name.toLowerCase()):[];
  const visible=assigned.filter(u=>`${u.vin} ${u.load_ref||''} ${u.truck} ${u.origin} ${u.destination}`.toLowerCase().includes(search.toLowerCase()));
  const updates=ws.carrierUpdates.filter(u=>u.carrier_id===carrierId);
  const open=(id:string)=>{setCarrierId(id);setSearch('');setCopyMessage('');};
  async function copy(){try{await navigator.clipboard.writeText(assigned.map(u=>u.vin).join('\n'));setCopyMessage(`${assigned.length} VINs copied in packing-list order`);}catch{setCopyMessage('Clipboard unavailable. Select and copy the VINs from the table.');}}
  return <>
    <ProjectLoadSummary ws={ws}/>
    <CarrierProgress ws={ws} onOpen={open} onUnassigned={()=>onRegister(null)}/>
    {!ws.carriers.length?<section className="panel"><Empty icon={<Truck size={30}/>} heading="Split your packing list between carriers" body="Open the unit register, enter how many VINs to select, and assign a carrier. Each carrier gets its own sheet update area here." action="Open unit register" onAction={()=>onRegister(null)}/></section>:<>
      <div className="carrier-switch"><label htmlFor="carrier-workspace">Carrier workspace</label><select id="carrier-workspace" value={c?.id||''} onChange={e=>open(e.target.value)}><option value="">Choose a carrier</option>{ws.carriers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="secondary" onClick={onAdd}>Add carrier</button></div>
      {c&&<>
        <section className="panel carrier-detail"><div className="panel-heading"><div><h3>{c.name}</h3><p>{assigned.length} assigned VINs · {new Set(assigned.map(u=>u.load_id).filter(Boolean)).size} load builds · packing-list order</p></div><div className="heading-actions"><button className="secondary" disabled={!assigned.length} onClick={copy}><Copy size={15}/>Copy VINs</button><button className="primary" disabled={!assigned.length} onClick={()=>setPasting(true)}><ClipboardPaste size={16}/>Paste sheet update</button></div></div>
          {copyMessage&&<p className="copy-message" role="status">{copyMessage}</p>}
          <div className="carrier-register-tools"><div className="search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search this carrier’s VINs or loads…" aria-label="Search carrier vehicles"/></div><button className="text-button" onClick={()=>onRegister(c.name)}>Open register for selection / bulk edit<ArrowRight size={14}/></button></div>
          {assigned.length?<><div className="table-scroll"><table className="carrier-unit-table"><thead><tr><th>#</th><th>VIN</th><th>Status</th><th>Load build</th><th>ETD</th><th>ETA</th><th>ATD</th><th>ATA</th><th>Truck</th></tr></thead><tbody>{visible.map(u=><tr key={u.id}><td>{assigned.indexOf(u)+1}</td><td><button className="vin-link" onClick={()=>onUnit(u.id)}>{u.vin}</button></td><td><Badge stage={u.status}/></td><td>{u.load_id?<button className="load-link" onClick={()=>onLoad(u.load_id!)}>{u.load_ref}</button>:<span className="muted">Not built</span>}</td>{(['etd','eta','atd','ata'] as const).map(f=><td className="date-cell" key={f}>{formatDate(u[f],true)}</td>)}<td>{u.truck||'—'}</td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing all {visible.length} matching vehicles · no 50-row limit</span></div></>:<Empty icon={<Truck size={26}/>} heading="No VINs assigned yet" body="Select the next batch from the packing list and assign it to this carrier." action="Assign from unit register" onAction={()=>onRegister(null)}/>}
        </section>
        <section className="panel carrier-history"><div className="panel-heading"><div><h3>Sheet checks</h3><p>When this carrier was checked and how much changed</p></div></div>{updates.length?<div className="table-scroll"><table><thead><tr><th>Checked at</th><th>VINs in paste</th><th>Changed</th><th>Unchanged</th><th>New loads</th></tr></thead><tbody>{updates.map(u=><tr key={u.id}><td>{formatDate(u.created_at,true)}</td><td>{u.row_count}</td><td>{u.changed_count}</td><td>{u.row_count-u.changed_count}</td><td>{u.loads_created}</td></tr>)}</tbody></table></div>:<p className="carrier-empty">No sheet checks yet. Paste the carrier’s sheet whenever you want to check for changes.</p>}</section>
      </>}
    </>}
    {pasting&&c&&<CarrierUpdateDialog projectId={ws.project.id} carrier={c} units={ws.units} onClose={()=>setPasting(false)} onDone={onDone}/>}
  </>;
}
