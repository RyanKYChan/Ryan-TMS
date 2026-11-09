import test from 'node:test';
import assert from 'node:assert/strict';
import { packingProgress } from '../client/src/packing-progress.js';
const unit=(id,extra={})=>({id,vin:id,packing_list_id:'focus',carrier:'',load_id:null,etd:'',eta:'',atd:'',ata:'',origin:'Terminal',destination:'',...extra});
const now=Date.parse('2026-11-09T10:00:00Z');
test('A stationary list has a complete pipeline, real planning gaps, no invented movements and its own denominator',()=>{
  const p=packingProgress('focus',[unit('1'),unit('2'),unit('other',{packing_list_id:'other',ata:'2026-11-01T10:00:00Z'})],[],now);
  assert.equal(p.total,2);assert.equal(p.noMovement,true);assert.equal(p.counts.unscheduled,2);assert.equal(p.deliveredPercent,0);assert.equal(p.queues.noCarrier.length,2);assert.equal(p.queues.noEtd.length,2);assert.equal(p.queues.noRoute.length,2);assert.equal(p.actuals.length,0);assert.equal(p.schedule.length,0);
});
test('Mixed stages, actuals, passed dates, future milestones, carrier breakdowns and shared loads are scoped to one list',()=>{
  const rows=[unit('1'),unit('2',{load_id:'load',load_ref:'Shared load',carrier:'Carrier A',etd:'2026-11-12T08:00:00Z',eta:'2026-11-13T10:00:00Z'}),unit('3',{reference:'Ready',carrier:'carrier a',etd:'2026-11-08T08:00:00Z',eta:'2026-11-08T10:00:00Z'}),unit('4',{carrier:'Carrier B',atd:'2026-11-08T08:00:00Z',eta:'2026-11-12T10:00:00Z'}),unit('5',{atd:'2026-11-07T08:00:00Z',ata:'2026-11-08T10:00:00Z'}),unit('6',{packing_list_id:'other',load_id:'load',eta:'2026-11-13T10:00:00Z',ata:'2026-11-01T08:00:00Z'})];
  const p=packingProgress('focus',rows,[{id:'load',reference:'Shared load'},{id:'other-load'}],now);
  assert.equal(p.total,5);assert.deepEqual(p.counts,{unscheduled:1,scheduled:1,ready:1,in_transit:1,delivered:1});assert.equal(p.deliveredPercent,20);assert.equal(p.pending,3);assert.equal(p.departed,2);assert.equal(p.arrived,1);
  assert.deepEqual(p.queues.pickupDue.map(u=>u.id),['3']);assert.deepEqual(p.queues.overdue.map(u=>u.id),['3']);assert.ok(p.queues.noCarrier.every(u=>!['4','5','6'].includes(u.id)));
  assert.equal(p.carriers.find(c=>c.name==='Carrier A').units.length,2);assert.equal(p.loads.length,1);assert.equal(p.loads[0].units.length,1);assert.equal(p.loads[0].totalAssigned,2);
  assert.equal(p.schedule.length,3);assert.ok(p.schedule.every(s=>s.units.every(u=>u.packing_list_id==='focus')));assert.ok(p.actuals.every(a=>a.unit.id!=='6'));
});
test('Reported stages remain distinct from actual timestamps; empty lists and divided load dates are handled',()=>{
  const rows=[unit('1',{source_status:'Delivered'}),unit('2',{source_status:'Loaded'}),unit('3',{load_id:'shared',etd:'2026-11-12T08:00:00Z'}),unit('4',{load_id:'shared',etd:'2026-11-12T09:00:00Z'}),unit('5',{load_id:'shared',etd:'2026-11-12T08:00:00Z'})];
  const p=packingProgress('focus',rows,[],now);assert.equal(p.counts.delivered,1);assert.equal(p.counts.in_transit,1);assert.equal(p.departed,0);assert.equal(p.arrived,0);assert.equal(p.queues.missingActual.length,2);assert.equal(p.schedule.length,2);assert.equal(p.schedule[0].units.length,2);
  const empty=packingProgress('empty',rows,[],now);assert.equal(empty.total,0);assert.equal(empty.deliveredPercent,0);assert.equal(empty.noMovement,false);assert.equal(empty.carriers.length,0);
});
