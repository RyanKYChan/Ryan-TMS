import { inspectGrid, normalizeHeader, previewRows } from './importer.js';

const loadHeaders=new Set(['load','loadid','loadref','loadreference','loadnumber','loadno','loadnr','loadbuild','loadbuilds','loadbuildnumber','trip','tripid','tripnumber','movement','movementreference']);
export function inspectCarrierGrid(raw,options={}){
  const grid=inspectGrid(raw,{...options,preserveBlankRows:true});
  const rows=[],groups=[];let group=0,gap=false;
  for(const row of grid.rows){
    if(row.every(cell=>!cell.trim())){if(rows.length)gap=true;continue;}
    if(gap){group++;gap=false;}
    rows.push(row);groups.push(String(group));
  }
  const mapping=grid.headers.map((h,i)=>loadHeaders.has(normalizeHeader(h))?'load_reference':grid.mapping[i]);
  return {...grid,rows,groups,mapping,hasGaps:group>0};
}
export function previewCarrierRows(grid,mapping,units,carrier,order='dmy',groupLoads=false){
  const preview=previewRows(grid.rows,mapping.map(f=>f==='load_reference'?'':f),units,order);
  const loadIndex=mapping.indexOf('load_reference');
  let previousGroup='',lastReference='';
  return preview.map((r,i)=>{
    const old=units.find(u=>u.vin===r.unit.vin),errors=[...r.errors];
    if(!old)errors.push('Not in the packing list. Import this VIN first.');
    else if(String(old.carrier).toLowerCase()!==carrier.toLowerCase())errors.push(`Not assigned to ${carrier}. Assign it from the unit register first.`);
    if(r.unit.carrier&&r.unit.carrier.toLowerCase()!==carrier.toLowerCase())errors.push('The pasted carrier does not match this workspace.');
    const group=grid.groups[i];
    if(group!==previousGroup){lastReference='';previousGroup=group;}
    const reference=loadIndex<0?'':String(grid.rows[i][loadIndex]||'').trim();
    if(reference)lastReference=reference;
    const unit={...r.unit};
    if(groupLoads){
      if(lastReference)unit.load_reference=lastReference;
      else if(grid.hasGaps)unit.group=group;
    }
    return {...r,unit,errors,group,loadReference:groupLoads?lastReference:''};
  });
}
