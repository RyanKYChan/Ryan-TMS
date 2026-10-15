import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTruckPaste } from '../client/src/truck-paste.js';
const message='1580NBK/R2463BDC Ruben Muñoz\n5086MZF/R1026BDC Dyma Odintsov\n6602MSD/R6665BCX Jeones Osoya\n9574MZM/R2458BDC Juan Perez\n\nToday till 18:00 should make to arrive';
test('The carrier message becomes four truck/trailer/driver bookings and one shared yard-arrival deadline',()=>{
 const parsed=parseTruckPaste(message,'2026-10-15');assert.equal(parsed.rows.length,4);assert.deepEqual(parsed.rows.map(r=>[r.truck,r.trailer,r.driver]),[['1580NBK','R2463BDC','Ruben Muñoz'],['5086MZF','R1026BDC','Dyma Odintsov'],['6602MSD','R6665BCX','Jeones Osoya'],['9574MZM','R2458BDC','Juan Perez']]);assert.deepEqual(parsed.arrival,{date:'2026-10-15',time:'18:00'});assert.equal(parsed.notes,'Today till 18:00 should make to arrive');assert.equal(parsed.unparsed.length,1);assert.deepEqual(parsed.warnings,[]);
});
test('Pastes support headered truck tables, spaced separators, driver phones, Unicode and CRLF',()=>{
 const table=parseTruckPaste('Truck plate\tTrailer plate\tDriver name\tDriver phone\r\n1580nbk\tR2463BDC\tRuben Muñoz\t+34001\r\n5086MZF/R1026BDC\t\tDyma Odintsov\t+34002','2026-10-15');assert.equal(table.rows.length,2);assert.equal(table.rows[0].truck,'1580NBK');assert.equal(table.rows[0].driver_phone,'+34001');assert.equal(table.rows[1].trailer,'R1026BDC');
 const plain=parseTruckPaste('1580NBK / R2463BDC  Ruben Muñoz\n5086MZF\tDyma Odintsov','2026-10-15');assert.equal(plain.rows.length,2);assert.equal(plain.rows[0].trailer,'R2463BDC');assert.equal(plain.rows[1].driver,'Dyma Odintsov');
});
test('Unknown lines stay visible, duplicates are flagged, and dates are inferred only from clear arrival instructions',()=>{
 const result=parseTruckPaste('1580NBK/R2463BDC Ruben\n1580nbk/R2463BDC Ruben\nMeet at gate B\nTomorrow arrive before 09:30','2026-12-31');assert.equal(result.rows.length,2);assert.equal(result.warnings.length,1);assert.equal(result.unparsed.length,2);assert.deepEqual(result.arrival,{date:'2027-01-01',time:'09:30'});
 for(const note of ['ETD today 18:00','Today loading 18:00','Arrival 31/02/2026 before 18:00','Arrive before 25:99'])assert.equal(parseTruckPaste(note,'2026-10-15').arrival,null,note);
 const conflict=parseTruckPaste('Today arrive by 18:00\nTomorrow arrive by 17:00','2026-10-15');assert.equal(conflict.arrival,null);assert.equal(conflict.warnings.length,1);
 assert.deepEqual(parseTruckPaste('Arrive 20/10/2026 by 18:00','2026-10-15').arrival,{date:'2026-10-20',time:'18:00'});
});
