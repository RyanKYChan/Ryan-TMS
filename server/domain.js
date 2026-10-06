export const FIELDS = ['vin','brand','model','reference','source_status','notes','pol_country','origin','pol_zipcode','pol_address','pod_country','destination','pod_zipcode','pod_address','dealer','etd','eta','atd','ata','carrier','truck','price','t1'];
export function status(unit) {
  if (unit.ata) return 'delivered';
  if (unit.atd) return 'in_transit';
  const s=String(unit.source_status||'').toLowerCase().replaceAll('_',' ').trim();
  if(['delivered','completed'].includes(s))return 'delivered';
  if(['in transit','departed','loaded'].includes(s))return 'in_transit';
  if (unit.load_id || unit.etd || ['scheduled','planned'].includes(s)) return 'scheduled';
  return 'unscheduled';
}
export function cleanVin(v) { return String(v ?? '').trim().toUpperCase(); }
export function validateVin(v) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? null : 'VIN must have 17 letters or digits (no I, O, or Q).';
}
export function validTimestamp(value) {
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i);
  if(!m||!Number.isFinite(Date.parse(value)))return false;
  const [,y,mo,d,h,min,sec='0']=m;
  const date=new Date(Date.UTC(+y,+mo-1,+d,+h,+min,+sec));
  return date.getUTCFullYear()===+y&&date.getUTCMonth()===+mo-1&&date.getUTCDate()===+d&&date.getUTCHours()===+h&&date.getUTCMinutes()===+min&&date.getUTCSeconds()===+sec;
}
export function validateUnit(unit) {
  for (const f of ['etd','eta','atd','ata']) {
    if (unit[f] && !validTimestamp(unit[f])) return `${f.toUpperCase()} must be a valid ISO date and time with a timezone.`;
  }
  if (unit.etd && unit.eta && Date.parse(unit.eta) < Date.parse(unit.etd)) return 'ETA must be on or after ETD.';
  if (unit.atd && unit.ata && Date.parse(unit.ata) < Date.parse(unit.atd)) return 'ATA must be on or after ATD.';
  if(unit.price && (!/^\d+(\.\d{1,2})?$/.test(unit.price) || Number(unit.price)>10000000)) return 'Price must be a positive EUR amount with at most two decimals.';
  if(unit.t1 && !['yes','no'].includes(unit.t1))return 'T1 must be yes, no, or blank.';
  return null;
}
export const BULK_FIELDS=FIELDS.filter(f=>f!=='vin');
export function planBulkEdit(units,changes){
  if(!Array.isArray(changes)||!changes.length||changes.length>BULK_FIELDS.length)throw new Error('Choose at least one field to change.');
  const seen=new Set();
  const validated=changes.map(change=>{
    if(!change||!BULK_FIELDS.includes(change.field)||seen.has(change.field))throw new Error('Choose unique editable fields. VIN and load assignment cannot be bulk edited.');
    seen.add(change.field);
    if(!['set','fill','clear'].includes(change.mode))throw new Error('Choose Set value, Fill blanks, or Clear.');
    const value=change.mode==='clear'?'':change.value;
    if(typeof value!=='string'||value.length>(change.field==='notes'?2000:500))throw new Error(`Invalid value for ${change.field}.`);
    if(change.mode!=='clear'&&!value.trim())throw new Error(`Enter a value for ${change.field}, or choose Clear.`);
    return {...change,value:value.trim()};
  });
  return units.map(unit=>{
    const update={};
    for(const c of validated){
      if(c.mode==='fill'&&unit[c.field])continue;
      if(unit[c.field]!==c.value)update[c.field]=c.value;
    }
    const error=validateUnit({...unit,...update});if(error)throw new Error(`${unit.vin}: ${error}`);
    return {unit,update};
  });
}
export function exportCsv(rows) {
  const headers=['Brand','VIN','Model','Reference','Status','Comments','POL-COUNTRY','POL-CTY','POL-ZIPCODE','POL-ADDRESS','POD-COUNTRY','POD-CITY','POD-ZIPCODE','POD-ADDRESS','Dealer name','ETD','ATD','ETA','ATA','Carrier','Truck plate','Price(EUR)','T1','Packing list','Load','Sheet status'];
  const fields=['brand','vin','model','reference','status','notes','pol_country','origin','pol_zipcode','pol_address','pod_country','destination','pod_zipcode','pod_address','dealer','etd','atd','eta','ata','carrier','truck','price','t1','packing_list','load_ref','source_status'];
  const escape = (v) => {
    let s = String(v ?? '');
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"','""') + '"';
  };
  return headers.map(escape).join(',') + '\r\n' + rows.map(r => fields.map(f=>escape(r[f])).join(',')).join('\r\n');
}
