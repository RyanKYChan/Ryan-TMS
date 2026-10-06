import { cleanVin, validateVin, validateUnit, validTimestamp } from '../../server/domain.js';
export const columns = [
  ['vin','VIN'],['brand','Brand'],['model','Model'],['reference','Reference'],['source_status','Sheet status'],
  ['notes','Comments / port comment'],['pol_country','POL country'],['origin','POL city'],['pol_zipcode','POL postcode'],['pol_address','POL address'],
  ['pod_country','POD country'],['destination','POD city'],['pod_zipcode','POD postcode'],['pod_address','POD address'],
  ['dealer','Dealer name'],['etd','ETD'],['atd','ATD'],['eta','ETA'],['ata','ATA'],['carrier','Carrier'],['truck','Truck plate'],['price','Price (EUR)'],['t1','T1'],
];
export const normalizeHeader = s=>s.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const aliases={
  vin:'vin',vins:'vin',chassis:'vin',chassisnumber:'vin',vehicleidentificationnumber:'vin',brand:'brand',make:'brand',model:'model',reference:'reference',ref:'reference',status:'source_status',sheetstatus:'source_status',
  comments:'notes',comment:'notes',notes:'notes',portcomment:'notes',portcomments:'notes',
  polcountry:'pol_country',polcty:'origin',polcity:'origin',origin:'origin',polzipcode:'pol_zipcode',polpostcode:'pol_zipcode',poladdress:'pol_address',
  podcountry:'pod_country',podcity:'destination',podcty:'destination',destination:'destination',podzipcode:'pod_zipcode',podpostcode:'pod_zipcode',podaddress:'pod_address',
  dealername:'dealer',dealer:'dealer',etd:'etd',eta:'eta',atd:'atd',ata:'ata',carrier:'carrier',carriertruckplate:'carrier',truckplate:'truck',truck:'truck',priceeur:'price',price:'price',t1:'t1',t1yesno:'t1'
};
Object.assign(aliases,{
  vinnumber:'vin',vinno:'vin',vinnr:'vin',vin17:'vin',vehiclevin:'vin',chassisno:'vin',chassisnr:'vin',chassisid:'vin',chassisvin:'vin',vehiclenumber:'vin',
  vehiclebrand:'brand',vehiclemake:'brand',vehiclemodel:'model',modelname:'model',modeldescription:'model',bookingreference:'reference',customerreference:'reference',referencenumber:'reference',
  vehiclestatus:'source_status',transportstatus:'source_status',shipmentstatus:'source_status',remarks:'notes',remark:'notes',portremarks:'notes',portnotes:'notes',commentsportcomment:'notes',
  pol:'origin',pod:'destination',portofloading:'origin',portofdischarge:'destination',loadingport:'origin',deliverycity:'destination',loadingcity:'origin',pickupcity:'origin',collectioncity:'origin',dischargeport:'destination',
  loadingcountry:'pol_country',origincountry:'pol_country',pickupcountry:'pol_country',collectioncountry:'pol_country',deliverycountry:'pod_country',destinationcountry:'pod_country',
  loadingaddress:'pol_address',originaddress:'pol_address',pickupaddress:'pol_address',collectionaddress:'pol_address',deliveryaddress:'pod_address',destinationaddress:'pod_address',
  loadingpostcode:'pol_zipcode',originpostcode:'pol_zipcode',pickuppostcode:'pol_zipcode',deliverypostcode:'pod_zipcode',destinationpostcode:'pod_zipcode',
  loading:'pol_address',unloading:'pod_address',loadinglocation:'pol_address',unloadinglocation:'pod_address',loadingpoint:'pol_address',unloadingpoint:'pod_address',
  unloadingaddress:'pod_address',unloadingcity:'destination',unloadingcountry:'pod_country',unloadingpostcode:'pod_zipcode',
  dealercompany:'dealer',dealercompanyname:'dealer',dealerlocation:'dealer',transportcompany:'carrier',haulier:'carrier',transporter:'carrier',carriername:'carrier',
  truckregistration:'truck',trucklicenseplate:'truck',trucklicenceplate:'truck',licenseplate:'truck',licenceplate:'truck',registrationplate:'truck',numberplate:'truck',truckplatenumber:'truck',
  transportprice:'price',transportpriceeur:'price',priceineur:'price',rateeur:'price',costeur:'price',eur:'price',t1required:'t1',t1document:'t1',t1yesorno:'t1',
  estimateddeparture:'etd',estimateddeparturedate:'etd',planneddeparture:'etd',actualdeparture:'atd',actualdeparturedate:'atd',
  estimatedarrival:'eta',estimatedarrivaldate:'eta',plannedarrival:'eta',actualarrival:'ata',actualarrivaldate:'ata'
});
export function matchHeader(header,saved={}){
  const h=normalizeHeader(header),known=columns.map(([f])=>f);
  if(Object.hasOwn(saved,h)&&(saved[h]===''||known.includes(saved[h])))return saved[h];
  if(aliases[h])return aliases[h];
  // Recognise route fields by their explicit side and meaning, without guessing unqualified addresses.
  for(const [prefix,city,country,zip,address] of [['pol','origin','pol_country','pol_zipcode','pol_address'],['pod','destination','pod_country','pod_zipcode','pod_address']]){
    if(h.startsWith(prefix)){
      const suffix=h.slice(prefix.length).replace(/^(?:portofloading|portofdischarge)/,'');
      if(['city','cty','town','location','port','portname','cityname'].includes(suffix))return city;
      if(['country','countrycode','countryname'].includes(suffix))return country;
      if(['zip','zipcode','postal','postalcode','postcode','postalzipcode'].includes(suffix))return zip;
      if(['address','fulladdress','street','streetaddress','addressline','addressline1'].includes(suffix))return address;
    }
  }
  const milestone=h.match(/^(etd|eta|atd|ata)(?:date|time|datetime|estimateddeparture|estimatedarrival|actualdeparture|actualarrival)$/);
  return milestone?milestone[1]:'';
}
export function parseGrid(raw) {
  const input=raw.replace(/^\uFEFF/,'');
  if(!input.trim())return [];
  const lines=input.split(/\r?\n/).filter(line=>line.trim());
  const pipeHeader=lines.length&&lines[0].includes('|')&&!lines[0].includes('\t')&&lines[0].split('|').some(cell=>matchHeader(cell.trim())==='vin');
  if(lines.length&&(/^\s*\|.*\|\s*$/.test(lines[0])||pipeHeader)){
    return lines.map(line=>{
      const cells=[];let cell='';
      for(let i=0;i<line.length;i++){
        if(line[i]==='\\'&&line[i+1]==='|'){cell+='|';i++;}
        else if(line[i]==='|'){cells.push(cell.trim());cell='';}else cell+=line[i];
      }
      cells.push(cell.trim());if(cells[0]==='')cells.shift();if(cells.at(-1)==='')cells.pop();return cells;
    }).filter(row=>row.some(cell=>cell&&!/^:?-{3,}:?$/.test(cell)));
  }
  // Only inspect unquoted delimiters, so a tab in a quoted CSV comment cannot shift all columns.
  const scores={'\t':0,',':0,';':0};let inQuotes=false;
  for(let i=0;i<input.length;i++){
    if(input[i]==='"'){if(inQuotes&&input[i+1]==='"')i++;else inQuotes=!inQuotes;}
    else if(!inQuotes&&Object.hasOwn(scores,input[i]))scores[input[i]]++;
  }
  const delimiter=scores['\t']?'\t':scores[';']&&scores[';']>=scores[',']?';':scores[',']?',':'\t';
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
export function inspectGrid(raw,options={}) {
  const grid=parseGrid(raw);
  if(!grid.length)return {headers:[],mapping:[],rows:[],hasHeaders:false};
  const saved=options.savedMappings||{};
  const looksLikeHeader=row=>row.some(cell=>matchHeader(cell,saved)==='vin')||(row.filter(cell=>matchHeader(cell,saved)).length>=2&&row.every(c=>!!validateVin(cleanVin(c))));
  const headerRow=options.headerMode==='no'?-1:options.headerMode==='yes'?0:grid.slice(0,10).findIndex(looksLikeHeader);
  // An unfamiliar VIN label can still be identified from the actual VINs in that column.
  const firstMappings=grid[0].map(h=>matchHeader(h,saved));
  const looksLikeHeaders=firstMappings.filter(Boolean).length>=2&&grid[0].every(c=>!!validateVin(cleanVin(c)));
  const hasHeaders=headerRow>=0||(options.headerMode!=='no'&&looksLikeHeaders);
  const index=headerRow>=0?headerRow:0;
  const width=Math.max(...grid.map(r=>r.length));
  const headers=hasHeaders?Array.from({length:width},(_,i)=>grid[index][i]||`Column ${i+1}`):Array.from({length:width},(_,i)=>`Column ${i+1}`);
  const rows=hasHeaders?grid.slice(index+1):grid;
  const mapping=hasHeaders?headers.map(h=>matchHeader(h,saved)):headers.map(()=> '');
  if(!mapping.includes('vin')){
    const sample=rows.slice(0,20);
    const candidates=headers.map((_,i)=>i).filter(i=>sample.length&&sample.filter(r=>!validateVin(cleanVin(r[i]))).length>=Math.max(1,sample.length/2));
    if(candidates.length===1&&(!mapping[candidates[0]]))mapping[candidates[0]]='vin';
    else if(!hasHeaders&&width===1)mapping[0]='vin';
  }
  return {headers,mapping,rows,hasHeaders,skippedRows:hasHeaders?index:0};
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
export function inferAddressDetails(address,side){
  const match=address.replace(/\s+/g,' ').trim().match(/\b(\d{4}\s?[A-Z]{2}|\d{4,5})\s+([A-Za-zÀ-ÖØ-öø-ÿ' .-]+?)(?:[,;]?\s+(Belgium|België|Netherlands|Nederland|Germany|France|BE|NL|DE|FR))?$/);
  if(!match)return {};
  const [,postcode,city,country]=match;
  if(!city.trim()||city.trim().length>80)return {};
  const fields={ [side==='pol'?'origin':'destination']:city.trim(),[side+'_zipcode']:postcode };
  const countries={belgium:'BE',belgie:'BE',be:'BE',netherlands:'NL',nederland:'NL',nl:'NL',germany:'DE',de:'DE',france:'FR',fr:'FR'};
  if(country)fields[side+'_country']=countries[normalizeHeader(country)];
  return fields;
}
export function previewRows(grid,mapping,existing=[],order='dmy',defaults={}) {
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
    unit.vin=cleanVin(unit.vin);
    const old=byVin.get(unit.vin),defaulted=[],inferred=[];
    for(const [field,value] of Object.entries(defaults)){
      if(field!=='vin'&&columns.some(([f])=>f===field)&&typeof value==='string'&&value.trim()&&!unit[field]&&!old?.[field]){
        unit[field]=value.trim();defaulted.push(field);
      }
    }
    for(const side of ['pol','pod']){
      if(unit[side+'_address'])for(const [field,value] of Object.entries(inferAddressDetails(unit[side+'_address'],side))){
        if(!unit[field]&&!old?.[field]){unit[field]=value;inferred.push(field);}
      }
    }
    const err=validateVin(unit.vin);if(err)errors.push(err);
    if(seen.has(unit.vin))errors.push('Duplicate VIN within this paste.');seen.add(unit.vin);
    const timeError=validateUnit({...byVin.get(unit.vin),...unit});if(timeError)errors.push(timeError);
    return {unit,errors,index:index+1,existing:byVin.has(unit.vin),defaulted,inferred};
  });
}
