import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCarrierGrid, previewCarrierRows } from '../client/src/carrier-importer.js';
const vin=i=>`LSFAM11A1RA${String(i).padStart(6,'0')}`;
const units=[1,2,3].map(i=>({vin:vin(i),carrier:'Carrier A'}));
test('Carrier TSV preserves blank-row load boundaries without treating quoted newlines as gaps',()=>{
  const grid=inspectCarrierGrid(`VIN No\tETD\tComments\n${vin(1)}\t12/10/2026\t"First line\n\nthird line"\n${vin(2)}\t12/10/2026\t\n\t\t\n\n${vin(3)}\t13/10/2026\t\n`);
  assert.equal(grid.rows.length,3);assert.equal(grid.hasGaps,true);assert.deepEqual(grid.groups,['0','0','1']);assert.equal(grid.rows[0][2],'First line\n\nthird line');
  const preview=previewCarrierRows(grid,grid.mapping,units,'Carrier A','dmy',true);assert.ok(preview.every(r=>!r.errors.length));assert.equal(preview[2].unit.group,'1');assert.ok(preview[0].unit.etd.includes('2026-10-12'));
  assert.ok(previewCarrierRows(grid,grid.mapping,units,'Carrier A','dmy',false).every(r=>!r.unit.group));
});
test('Carrier Markdown and VIN-only sheets retain groups; load references fill down within groups',()=>{
  let grid=inspectCarrierGrid(`| VIN | Loadbuild | ETA |\n| --- | --- | --- |\n| ${vin(1)} | Truck A | 12/10/2026 |\n| ${vin(2)} | | 12/10/2026 |\n\n| ${vin(3)} | Truck B | 13/10/2026 |`);
  assert.deepEqual(grid.mapping,['vin','load_reference','eta']);
  const preview=previewCarrierRows(grid,grid.mapping,units,'Carrier A','dmy',true);assert.deepEqual(preview.map(r=>r.unit.load_reference),['Truck A','Truck A','Truck B']);
  grid=inspectCarrierGrid(`${vin(1)}\n\n${vin(2)}\n${vin(3)}`);assert.deepEqual(grid.mapping,['vin']);assert.deepEqual(grid.groups,['0','1','1']);
});
test('Carrier preview flags unknown or differently assigned VINs while normalising dates and retaining blanks',()=>{
  const grid=inspectCarrierGrid(`VIN\tETD\tATA\n${vin(1)}\t\t13/10/2026\n${vin(2)}\t\t\n${vin(4)}\t\t`);
  const preview=previewCarrierRows(grid,grid.mapping,[{...units[0],etd:'2026-10-12T06:00:00Z'},{...units[1],carrier:'Carrier B'}],'Carrier A');
  assert.equal(preview[0].unit.etd,undefined);assert.equal(preview[0].errors.length,0);assert.match(preview[1].errors.join(' '),/Not assigned/);assert.match(preview[2].errors.join(' '),/Not in the packing list/);
});

test('A full 200-VIN sheet detects twelve six-unit loads and keeps the unbroken 128-VIN remainder unbuilt',()=>{
  const all=Array.from({length:200},(_,i)=>({vin:vin(i+1),carrier:'Valida'}));
  const header='Brand\tVIN\tModel\tAppointment #\tComments\tPOL-COUNTRY\tPOL-CITY\tPOL-ADDRESS\tPOD-COUNTRY\tPOD-CITY\tPOD-ADDRESS\tETD\tATD\tETA\tATA\tTruck plate\t\t';
  const data=all.map((u,i)=>(i>0&&i<72&&i%6===0?'\t\t\n':'')+['Geely',u.vin,'P145','','','Belgium','Antwerp','Port street','Belgium','Zeebrugge','Quay street',i<72?'2026/10/07':'','','','',i<72?'TEST-01':'','',''].join('\t')).join('\n');
  const grid=inspectCarrierGrid(`${header}\n${data}\n${'\t\t\n'.repeat(800)}`);
  assert.equal(grid.headers.length,16);assert.equal(grid.mapping[3],'reference');assert.equal(grid.rows.length,200);
  const preview=previewCarrierRows(grid,grid.mapping,all,'Valida','dmy',true);
  assert.equal(preview.filter(r=>r.classification==='load').length,72);assert.equal(preview.filter(r=>r.unit.load_action==='pool').length,128);
  const groups=new Map();for(const r of preview.filter(r=>r.classification==='load'))groups.set(r.unit.group,(groups.get(r.unit.group)||0)+1);
  assert.equal(groups.size,12);assert.ok([...groups.values()].every(n=>n===6));assert.ok(preview.every(r=>!r.errors.length));
});

test('An unbroken VIN batch stays unbuilt, trailing blank padding is ignored, and section treatment can be overridden',()=>{
  const grid=inspectCarrierGrid(`VIN\n${vin(1)}\n${vin(2)}\n${vin(3)}\n\n\n`);
  assert.equal(grid.hasGaps,false);let preview=previewCarrierRows(grid,grid.mapping,units,'Carrier A','dmy',true);assert.ok(preview.every(r=>r.unit.load_action==='pool'));
  preview=previewCarrierRows(grid,grid.mapping,units,'Carrier A','dmy',true,{'0':'load'});assert.ok(preview.every(r=>r.unit.group==='0'&&!r.unit.load_action));
});
