import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGrid, previewRows, parseGrid, parseDate, parsePrice, matchHeader, normalizeHeader, inferAddressDetails } from '../client/src/importer.js';
const vin='LSFAM11A1RA000001';
test('Maps the customer sheet, merges comments, and preserves port/dealer details',()=>{
  const headers=['Brand','VIN','Model','Reference','Status','Comments','Port Comment','POL-COUNTRY','POL-CTY','POL-ZIPCODE','POL-ADDRESS','POD-COUNTRY','POD-CITY','POD -ZIPCODE','POD-ADDRESS','Dealer name','ETD','ATD','ETA','ATA','carrier','Truck plate','Price(EUR)','T1'];
  const data=['MAXUS',vin,'Deliver 9','REF-01','Scheduled','Check keys','T1 at port','BE','Zeebrugge','8380','Port road','NL','Utrecht','3542','Dealer street','Dealer A','12/10/2026 08:00','','13/10/2026 12:00','','Carrier A','AB-123','€ 1.234,56','YES'];
  const grid=inspectGrid(headers.join('\t')+'\n'+data.join('\t'));
  assert.equal(grid.hasHeaders,true);assert.equal(grid.mapping.filter(Boolean).length,headers.length);
  const [row]=previewRows(grid.rows,grid.mapping);
  assert.deepEqual(row.errors,[]);assert.equal(row.unit.notes,'Check keys\nT1 at port');
  assert.equal(row.unit.origin,'Zeebrugge');assert.equal(row.unit.destination,'Utrecht');assert.equal(row.unit.pol_zipcode,'8380');assert.equal(row.unit.pod_zipcode,'3542');
  assert.equal(row.unit.carrier,'Carrier A');assert.equal(row.unit.truck,'AB-123');assert.equal(row.unit.price,'1234.56');assert.equal(row.unit.t1,'yes');
});
test('VIN-only paste normalizes case and detects duplicates and invalid VINs',()=>{
  const grid=inspectGrid(`${vin.toLowerCase()}\n${vin}\nINVALID`);
  const rows=previewRows(grid.rows,grid.mapping,[{vin}]);
  assert.equal(rows[0].unit.vin,vin);assert.equal(rows[0].existing,true);assert.deepEqual(rows[0].errors,[]);
  assert.match(rows[1].errors.join(),/Duplicate/);assert.match(rows[2].errors.join(),/17/);
});
test('Quoted TSV and CSV support embedded newlines, delimiters and escaped quotes',()=>{
  assert.deepEqual(parseGrid(`VIN\tComments\r\n${vin}\t"At port\nCheck \"\"keys\"\""`),[['VIN','Comments'],[vin,'At port\nCheck "keys"']]);
  assert.deepEqual(parseGrid(`VIN,Comments\n${vin},"Hello, world"`),[['VIN','Comments'],[vin,'Hello, world']]);
  assert.throws(()=>parseGrid('VIN\t"unterminated'),/closing quote/);
});
test('Dates reject impossible dates and respect the selected day/month order',()=>{
  assert.equal(new Date(parseDate('06/10/2026','dmy')).getMonth(),9);
  assert.equal(new Date(parseDate('06/10/2026','mdy')).getMonth(),5);
  assert.throws(()=>parseDate('31/02/2026'),/Invalid date/);
  assert.throws(()=>parseDate('2026-02-31T12:00:00Z'),/Invalid date/);
  assert.equal(parseDate('2026-10-12T08:00:00+02:00'),'2026-10-12T06:00:00.000Z');
});
test('Prices support European and international formats without guessing negative values',()=>{
  assert.equal(parsePrice('EUR 95,50'),'95.50');assert.equal(parsePrice('1,234.56'),'1234.56');
  assert.throws(()=>parsePrice('-10'),/Invalid/);assert.throws(()=>parsePrice('1.234'),/Invalid/);
});
test('Preview validates updates against existing milestones and rejects malformed T1',()=>{
  const grid=inspectGrid(`VIN\tATD\tT1\n${vin}\t14/10/2026\tperhaps`);
  const [row]=previewRows(grid.rows,grid.mapping,[{vin,ata:'2026-10-13T12:00:00Z'}]);
  assert.match(row.errors.join(),/T1/);assert.match(row.errors.join(),/ATA/);
});
test('The user’s generic VIN No / Loading / Unloading packing list fills POL and POD automatically',()=>{
  const loading='Pantank Haven 1223, Hazopweg 163, 9130 Kallo';
  const unloading='Canada   quay 527, CLdN Ports Zeebrugge NV, Barlenhuisstraat 2, 8380 Zeebrugge';
  const header=['VIN No','Model','Loading\u00a0','Unloading\u00a0'];
  const data=['LB3P11SD4TH395104','P145',loading,unloading];
  for(const input of [header.join('\t')+'\n'+data.join('\t'),`| ${header.join(' | ')} |\n| --- | --- | --- | --- |\n| ${data.join(' | ')} |`,header.join(' | ')+'\n'+data.join(' | ')]){
    const grid=inspectGrid(input);assert.equal(grid.hasHeaders,true);assert.deepEqual(grid.mapping,['vin','model','pol_address','pod_address']);assert.equal(grid.rows.length,1);
    const [r]=previewRows(grid.rows,grid.mapping);assert.deepEqual(r.errors,[]);assert.equal(r.unit.pol_address,loading);assert.equal(r.unit.pod_address,unloading);
    assert.equal(r.unit.origin,'Kallo');assert.equal(r.unit.pol_zipcode,'9130');assert.equal(r.unit.destination,'Zeebrugge');assert.equal(r.unit.pod_zipcode,'8380');assert.equal(r.unit.pol_country,undefined);
  }
});
test('Header variations and remembered custom mappings are recognised without swapping POL and POD',()=>{
  assert.equal(matchHeader('VIN number'),'vin');assert.equal(matchHeader('POL Postal Code'),'pol_zipcode');assert.equal(matchHeader('POD - Country code'),'pod_country');assert.equal(matchHeader('POD full address'),'pod_address');
  assert.equal(matchHeader('Arrival location',{[normalizeHeader('Arrival location')]:'pod_address'}),'pod_address');assert.equal(matchHeader('Address'),'');
  const grid=inspectGrid('Packing list for vessel X\nBrand\tVehicle ID\tModel\nMAXUS\t'+vin+'\tDeliver 9');
  assert.equal(grid.hasHeaders,true);assert.equal(grid.skippedRows,1);assert.deepEqual(grid.mapping,['brand','vin','model']);
  const forced=inspectGrid('Brand\tVehicle ID\tModel\nMAXUS\t'+vin+'\tDeliver 9',{headerMode:'yes'});assert.deepEqual(forced.mapping,['brand','vin','model']);
  const title=inspectGrid('Packing list for vessel X\nVIN No\tModel\n'+vin+'\tP145');assert.equal(title.skippedRows,1);assert.equal(title.rows.length,1);
});
test('Parsing preserves leading blank columns, quoted tabs in CSV, and semicolon spreadsheets',()=>{
  const grid=inspectGrid('\t'+vin+'\tP145\n\tLSFAM11A1RA000002\tP145',{headerMode:'no'});assert.equal(grid.rows[0][0],'');assert.equal(grid.mapping[1],'vin');
  assert.deepEqual(parseGrid(`VIN,Comments\n${vin},"A\tB"`),[['VIN','Comments'],[vin,'A\tB']]);
  assert.deepEqual(inspectGrid(`VIN No;Model;Loading;Unloading\n${vin};P145;9130 Kallo;8380 Zeebrugge`).mapping,['vin','model','pol_address','pod_address']);
});
test('Shared route details fill missing values but preserve pasted and existing data',()=>{
  const grid=inspectGrid(`VIN\tPOL-CITY\n${vin}\tKallo\nLSFAM11A1RA000002\t`);
  const defaults={origin:'Zeebrugge',destination:'Utrecht',pol_address:'Port road, 8380 Zeebrugge',pod_country:'NL'};
  const rows=previewRows(grid.rows,grid.mapping,[{vin,destination:'Rotterdam'}],'dmy',defaults);
  assert.equal(rows[0].unit.origin,'Kallo');assert.equal(rows[0].unit.destination,undefined);assert.equal(rows[1].unit.origin,'Zeebrugge');assert.equal(rows[1].unit.destination,'Utrecht');assert.equal(rows[1].unit.pol_zipcode,'8380');
});
test('Address inference preserves explicit cities, and does not guess a country from a postcode',()=>{
  assert.deepEqual(inferAddressDetails('Port address, 9130 Kallo','pol'),{origin:'Kallo',pol_zipcode:'9130'});
  assert.deepEqual(inferAddressDetails('Street 2, 1234 AB Utrecht NL','pod'),{destination:'Utrecht',pod_zipcode:'1234 AB',pod_country:'NL'});
  assert.deepEqual(inferAddressDetails('Unknown compound','pod'),{});
  const grid=inspectGrid(`VIN\tLoading\tPOL-CITY\n${vin}\tPort road, 9130 Kallo\tAntwerp`);assert.equal(previewRows(grid.rows,grid.mapping)[0].unit.origin,'Antwerp');
});
