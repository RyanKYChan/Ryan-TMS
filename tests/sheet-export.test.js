import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementFields, carrierFields, exportColumns, exportDate, exportMatrix, matrixHtml, matrixText } from '../client/src/sheet-export.js';
import { parseGrid } from '../client/src/importer.js';
import { inspectCarrierGrid, previewCarrierRows } from '../client/src/carrier-importer.js';
const vin=i=>`LSFAM11A1RA${String(i).padStart(6,'0')}`;

test('Carrier exports retain all 400 VIN details and quoted multiline cells without including commercial fields by default',()=>{
  const units=Array.from({length:400},(_,i)=>({vin:vin(i+1),model:'P145',brand:'MAXUS',reference:`REF-${i+1}`,notes:'Keys checked\nComment with "quotes"\tand a tab',pol_address:'Port road, 9130 Kallo',origin:'Kallo',destination:'Zeebrugge',carrier:'Carrier A',price:'95.50',revenue:'125.75',etd:'2026-10-11T23:30:00Z'}));
  const before=JSON.stringify(units),matrix=exportMatrix(units,carrierFields),parsed=parseGrid(matrixText(matrix));
  assert.equal(parsed.length,401);assert.equal(parsed[1][carrierFields.indexOf('vin')],vin(1));assert.equal(parsed[400][carrierFields.indexOf('vin')],vin(400));assert.equal(parsed[1][carrierFields.indexOf('model')],'P145');assert.equal(parsed[1][carrierFields.indexOf('notes')],units[0].notes);assert.equal(parsed[1][carrierFields.indexOf('etd')],'2026-10-12');
  assert.ok(!carrierFields.includes('price'));assert.ok(!carrierFields.includes('revenue'));assert.equal(JSON.stringify(units),before);
});

test('Export groups preserve distinct per-VIN trucks and ETDs, separate built loads, and leave an unbuilt remainder',()=>{
  const units=[{vin:vin(1),carrier:'Carrier A',load_id:null},{vin:vin(2),carrier:'Carrier A',load_id:'a',load_ref:'LOAD-A',truck:'TEST-1',etd:'2026-10-12T08:00:00Z'},{vin:vin(3),carrier:'Carrier A',load_id:'b',load_ref:'LOAD-B',truck:'TEST-2',etd:'2026-10-13T08:00:00Z'},{vin:vin(4),carrier:'Carrier A',load_id:'a',load_ref:'LOAD-A',truck:'TEST-3',etd:'2026-10-12T09:00:00Z'}];
  const matrix=exportMatrix(units,announcementFields,{groupLoads:true,includeTime:true});assert.equal(matrix.length,7);assert.equal(matrix[1][announcementFields.indexOf('vin')],vin(2));assert.equal(matrix[2][announcementFields.indexOf('truck')],'TEST-3');assert.equal(matrix[2][announcementFields.indexOf('etd')],'2026-10-12 11:00');assert.ok(matrix[3].every(v=>v===''));assert.equal(matrix[6][announcementFields.indexOf('vin')],vin(1));
  const grid=inspectCarrierGrid(matrixText(matrix));const preview=previewCarrierRows(grid,grid.mapping,units,'Carrier A','dmy',true);assert.deepEqual(preview.map(r=>r.classification),['load','load','load','pool']);assert.equal(preview[3].unit.load_action,'pool');
  const ungrouped=exportMatrix(units,['vin'],{groupLoads:false,headers:false});assert.deepEqual(ungrouped,units.map(u=>[u.vin]));
});

test('Local and ISO export dates keep calendar dates, winter offset and exact instants explicit',()=>{
  assert.equal(exportDate('2026-10-11T23:30:00Z','Europe/Amsterdam',false,true),'2026-10-12 01:30');
  assert.equal(exportDate('2026-11-01T08:00:00Z','Europe/Amsterdam',false,true),'2026-11-01 09:00');
  assert.equal(exportDate('2026-10-12T10:00:00+02:00','Europe/Amsterdam',true,true),'2026-10-12T08:00:00.000Z');assert.equal(exportDate('','Europe/Amsterdam'),'');
});

test('Clipboard HTML escapes markup, spreadsheet text neutralises formulas and CSV preserves quoted values and zero prices',()=>{
  const matrix=exportMatrix([{vin:vin(1),model:'P145',notes:'<img src=x onerror=alert(1)>\n=still text',reference:'=HYPERLINK("https://example.com")',price:'0',revenue:'100.01',truck:'',etd:''}],['vin','notes','reference','price','revenue','truck','etd']);
  const parsed=parseGrid(matrixText(matrix,','));assert.equal(parsed[1][2],"'=HYPERLINK(\"https://example.com\")");assert.equal(parsed[1][1],matrix[1][1]);assert.equal(parsed[1][3],'0');assert.equal(parsed[1][4],'100.01');assert.equal(parsed[1][5],'');assert.equal(parsed[1][6],'');
  const html=matrixHtml(matrix);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('<br>'));assert.ok(html.includes('<thead>'));assert.ok(!matrixHtml(matrix.slice(1),false).includes('<thead>'));
  assert.throws(()=>exportMatrix([],['vin','vin']));assert.throws(()=>exportMatrix([],['not_a_field']));assert.equal(exportColumns.find(([f])=>f==='model')[1],'Model');
});


test('Spreadsheet exports keep leading-zero codes and long numeric VINs as text',()=>{
  const matrix=exportMatrix([{vin:'12345678901234567',pol_zipcode:'01234',reference:'00017',price:'0'}],['vin','pol_zipcode','reference','price']);
  assert.deepEqual(parseGrid(matrixText(matrix))[1],["'12345678901234567","'01234","'00017",'0']);
  assert.equal(matrix[1][0],'12345678901234567');
});


test('Exports default all milestones to local calendar dates and retain times only when requested',()=>{
  const units=[{vin:vin(1),etd:'2026-10-11T23:30:00Z',eta:'2026-11-01T23:30:00Z',atd:'2026-10-12T08:45:00Z',ata:''}],fields=['vin','etd','eta','atd','ata'];
  const before=JSON.stringify(units),dates=exportMatrix(units,fields);
  assert.deepEqual(dates[1],[vin(1),'2026-10-12','2026-11-02','2026-10-12','']);
  assert.deepEqual(exportMatrix(units,fields,{includeTime:true})[1],[vin(1),'2026-10-12 01:30','2026-11-02 00:30','2026-10-12 10:45','']);
  assert.equal(exportMatrix(units,fields,{includeTime:true,isoDates:true})[1][1],'2026-10-11T23:30:00.000Z');
  assert.equal(exportMatrix(units,fields,{isoDates:true})[1][1],'2026-10-12');
  assert.equal(parseGrid(matrixText(dates,','))[1][1],'2026-10-12');assert.ok(matrixHtml(dates).includes('2026-10-12'));assert.ok(!matrixHtml(dates).includes('01:30'));assert.equal(JSON.stringify(units),before);
});
