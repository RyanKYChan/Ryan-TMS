import { cleanVin, validateVin, validateUnit, validTimestamp } from '../../server/domain.js';
export const columns = [
  ['vin','VIN'],['brand','Brand'],['model','Model'],['reference','Reference'],['source_status','Sheet status'],
  ['notes','Comments / port comment'],['pol_country','POL country'],['origin','POL city'],['pol_zipcode','POL postcode'],['pol_address','POL address'],
  ['pod_country','POD country'],['destination','POD city'],['pod_zipcode','POD postcode'],['pod_address','POD address'],
  ['dealer','Dealer name'],['etd','ETD'],['atd','ATD'],['eta','ETA'],['ata','ATA'],['carrier','Carrier'],['truck','Truck plate'],['price','Price (EUR)'],['t1','T1'],
];
const normalize = s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={
  vin:'vin',vins:'vin',chassis:'vin',chassisnumber:'vin',vehicleidentificationnumber:'vin',brand:'brand',make:'brand',model:'model',reference:'reference',ref:'reference',status:'source_status',sheetstatus:'source_status',
  comments:'notes',comment:'notes',notes:'notes',portcomment:'notes',portcomments:'notes',
  polcountry:'pol_country',polcty:'origin',polcity:'origin',origin:'origin',polzipcode:'pol_zipcode',polpostcode:'pol_zipcode',poladdress:'pol_address',
  podcountry:'pod_country',podcity:'destination',podcty:'destination',destination:'destination',podzipcode:'pod_zipcode',podpostcode:'pod_zipcode',podaddress:'pod_address',
  dealername:'dealer',dealer:'dealer',etd:'etd',eta:'eta',atd:'atd',ata:'ata',carrier:'carrier',carriertruckplate:'carrier',truckplate:'truck',truck:'truck',priceeur:'price',price:'price',t1:'t1',t1yesno:'t1'
};
export function parseGrid(raw) {
  const input=raw.replace(/^\uFEFF/,'').trim();
  if(!input)return [];
  const delimiter=input.includes('\t')?'\t':input.includes(',')?',':'\t';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"'){
      if(quoted&&input[i+1]==='"'){cell+='"';i++;}
      else if(quoted || cell==='')quoted=!quoted;
      else cell+=c;
    }else if(c===delimiter&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&input[i+1]==='\n')i++;
      row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';
    }else cell+=c;
  }
  if(quoted)throw new Error('An opening quote has no closing quote. Copy the cells again.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
export function inspectGrid(raw) {
  const grid=parseGrid(raw);
  if(!grid.length)return {headers:[],mapping:[],rows:[],hasHeaders:false};
  const hasHeaders=grid[0].some(cell=>aliases[normalize(cell)]==='vin');
  const width=Math.max(...grid.map(r=>r.length));
  const headers=hasHeaders?Array.from({length:width},(_,i)=>grid[0][i]||`Column ${i+1}`):Array.from({length:width},(_,i)=>`Column ${i+1}`);
  const mapping=hasHeaders?headers.map(h=>aliases[normalize(h)]||''):headers.map((_,i)=>i===0?'vin':'');
  return {headers,mapping,rows:hasHeaders?grid.slice(1):grid,hasHeaders};
}
export function parseDate(value,order='dmy') {
  const s=value.trim();
  if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s)){
    const d=new Date(s);if(!validTimestamp(s))throw new Error(`Invalid date: ${s}`);return d.toISOString();
  }
  let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let y,month,day,h=0,min=0,sec=0;
  if(m){[,y,month,day,h='0',min='0',sec='0']=m;}
  else{
    m=s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if(!m)throw new Error(`Use YYYY-MM-DD or ${order==='dmy'?'DD/MM/YYYY':'MM/DD/YYYY'} for ${s}.`);
    const [,a,b,year,hour='0',minute='0',second='0']=m;
    y=year;month=order==='dmy'?b:a;day=order==='dmy'?a:b;h=hour;min=minute;sec=second;
  }
  const d=new Date(Number(y),Number(month)-1,Number(day),Number(h),Number(min),Number(sec));
  if(d.getFullYear()!==Number(y)||d.getMonth()!==Number(month)-1||d.getDate()!==Number(day)||d.getHours()!==Number(h)||d.getMinutes()!==Number(min)||d.getSeconds()!==Number(sec))throw new Error(`Invalid date: ${s}`);
  return d.toISOString();
}
export function parsePrice(value) {
  let s=value.replace(/EUR|€/gi,'').replace(/\s/g,'').trim();
  if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replaceAll('.','').replace(',','.'):s.replaceAll(',','');
  else if(s.includes(','))s=s.replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(s))throw new Error(`Invalid EUR price: ${value}`);
  return Number(s).toFixed(2);
}
export function previewRows(grid,mapping,existing=[],order='dmy') {
  const seen=new Set(),byVin=new Map(existing.map(u=>[u.vin,u]));
  return grid.map((row,index)=>{
    const unit={},errors=[];
    if(row.length>mapping.length)errors.push('This row has more cells than the column mapping.');
    row.forEach((cell,i)=>{
      const field=mapping[i],s=cell.trim();if(!field||!s)return;
      try{
        let value=s;
        if(['etd','eta','atd','ata'].includes(field))value=parseDate(s,order);
        if(field==='price')value=parsePrice(s);
        if(field==='t1'){
          const t=s.toLowerCase();if(['yes','y','true','1'].includes(t))value='yes';else if(['no','n','false','0'].includes(t))value='no';else throw new Error('T1 must be yes or no.');
        }
        if(field==='notes'&&unit.notes)unit.notes+='\n'+value;
        else if(unit[field]&&field!=='notes')errors.push(`More than one column is mapped to ${field}.`);
        else unit[field]=value;
      }catch(e){errors.push(e.message);}
    });
    unit.vin=cleanVin(unit.vin);const err=validateVin(unit.vin);if(err)errors.push(err);
    if(seen.has(unit.vin))errors.push('Duplicate VIN within this paste.');seen.add(unit.vin);
    const timeError=validateUnit({...byVin.get(unit.vin),...unit});if(timeError)errors.push(timeError);
    return {unit,errors,index:index+1,existing:byVin.has(unit.vin)};
  });
}
