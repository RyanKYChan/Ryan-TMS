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
  // Sheets often include hundreds of empty rows and empty columns in the copied range.
  // They are padding, not load boundaries or unmatched data columns.
  const keep=grid.headers.map((h,i)=>i).filter(i=>!(grid.hasHeaders&&grid.headers[i]===`Column ${i+1}`&&rows.every(r=>!String(r[i]||'').trim())));
  return {...grid,headers:keep.map(i=>grid.headers[i]),rows:rows.map(r=>keep.map(i=>r[i]||'')),groups,mapping:keep.map(i=>mapping[i]),hasGaps:group>0};
}
export function previewCarrierRows(grid,mapping,units,carrier,order='dmy',groupLoads=false,overrides={}){
  const preview=previewRows(grid.rows,mapping.map(f=>f==='load_reference'?'':f),units,order);
  const loadIndex=mapping.indexOf('load_reference');
  let previousGroup='',lastReference='';
  const base=preview.map((r,i)=>{
    const old=units.find(u=>u.vin===r.unit.vin),errors=[...r.errors];
    if(!old)errors.push('Not in the packing list. Import this VIN first.');
    else if(String(old.carrier).toLowerCase()!==carrier.toLowerCase())errors.push(`Not assigned to ${carrier}. Assign it from the unit register first.`);
    if(r.unit.carrier&&r.unit.carrier.toLowerCase()!==carrier.toLowerCase())errors.push('The pasted carrier does not match this workspace.');
    const group=grid.groups[i];
    if(group!==previousGroup){lastReference='';previousGroup=group;}
    const reference=loadIndex<0?'':String(grid.rows[i][loadIndex]||'').trim();
    if(reference)lastReference=reference;
    return {...r,unit:{...r.unit},errors,group,loadReference:lastReference};
  });
  const lastGroup=grid.groups.at(-1);
  let previous='',run=0,previousPlanned=null;
  return base.map(r=>{
    const activity=['etd','eta','atd','ata','truck'].some(f=>r.unit[f])||['scheduled','planned','loaded','in transit','delivered','completed'].includes(String(r.unit.source_status||'').toLowerCase());
    // Interior gaps close a load. The final unbroken remainder is the unbuilt pool;
    // a dated/trucked prefix before that pool can still be the last load.
    let classification=r.loadReference?'load':grid.hasGaps&&(r.group!==lastGroup||activity)?'load':'pool';
    const boundary=`${r.group}:${r.loadReference}`;
    if(boundary!==previous){run=0;previousPlanned=null;previous=boundary;}
    if(r.group===lastGroup&&!r.loadReference&&previousPlanned!==null&&previousPlanned!==classification)run++;
    previousPlanned=classification;
    const section=r.loadReference?`ref:${r.loadReference.toLowerCase()}`:run?`${r.group}:${run}`:r.group;
    classification=overrides[section]||classification;
    if(groupLoads){
      if(classification==='load'){
        if(r.loadReference)r.unit.load_reference=r.loadReference;
        else r.unit.group=section;
      }else r.unit.load_action='pool';
    }
    return {...r,group:section,section,classification:groupLoads?classification:'keep',loadReference:groupLoads?r.loadReference:''};
  });
}
