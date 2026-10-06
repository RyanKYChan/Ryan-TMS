import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGrid, previewRows, parseGrid, parseDate, parsePrice } from '../client/src/importer.js';
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
