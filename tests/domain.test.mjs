import test from 'node:test';
import assert from 'node:assert/strict';
import {seedData,classify,validateRecall,validateEvidence,planActions,NOTICE,EVIDENCE,summary} from '../domain.mjs';

test('trace isolates recalled lots and retains missing lineage as unresolved',()=>{
 const s=seedData('test');const a=classify(s,'B17');
 assert.deepEqual(a.affected.map(x=>x.id),['O1001','O1002','O1003','O1005']);
 assert.deepEqual(a.unresolved.map(x=>x.id),['O1007']);
 assert.deepEqual(a.excluded.map(x=>x.id),['O1004','O1006','O1008']);
 assert.equal(a.affected.reduce((n,x)=>n+x.qty,0),126);
});
test('notice validation rejects hallucinated or unsupported identifiers',()=>{
 const s=seedData('test');assert.equal(validateRecall({lot:'B17'},NOTICE,s).lot,'B17');
 assert.throws(()=>validateRecall({lot:'B18'},NOTICE,s));
 assert.throws(()=>validateRecall({lot:'B19'},NOTICE+' B19',s));
});
test('evidence requires explicit lineage and rejects conflicts',()=>{
 const s=seedData('test');const e={batch:'P204',lot:'B17',order:'O1007'};
 assert.deepEqual(validateEvidence(e,EVIDENCE,s),e);
 assert.throws(()=>validateEvidence(e,'B17 P204 O1007 only co-occur',s));
 assert.throws(()=>validateEvidence({...e,order:'O1001'},EVIDENCE,s));
 s.batches.find(x=>x.id==='P204').lot='B18';assert.throws(()=>validateEvidence(e,EVIDENCE,s));
});
test('new evidence expands recall scope and makes one additional hold',()=>{
 const s=seedData('test');let a=classify(s,'B17');const initial=planActions(s,a);
 assert.equal(initial.filter(x=>x.type==='hold').length,2);assert.equal(initial.filter(x=>x.type==='notice').length,2);
 s.actions=initial.map(x=>({...x,status:'verified'}));for(const o of s.orders)if(initial.some(x=>x.order===o.id&&x.type==='hold'))o.status='held';
 s.batches.find(x=>x.id==='P204').lot='B17';a=classify(s,'B17');const plans=planActions(s,a);
 assert.equal(a.affected.length,5);assert.equal(a.unresolved.length,0);assert.equal(plans.filter(x=>x.completed).length,4);
 assert.deepEqual(plans.filter(x=>!x.completed).map(x=>x.order),['O1007']);
});
test('delivered orders receive notices and cannot be assigned shipment holds',()=>{
 const s=seedData('test');const plans=planActions(s,classify(s,'B17'));
 assert.ok(plans.filter(x=>x.type==='hold').every(p=>s.orders.find(o=>o.id===p.order).status==='pending'));
 assert.ok(plans.filter(x=>x.type==='notice').every(p=>s.orders.find(o=>o.id===p.order).status==='delivered'));
});
test('verified action keys are unique to recall, order, action and dataset',()=>{
 const a=seedData('a'),b=seedData('b');const p=planActions(a,classify(a,'B17'));
 a.actions=p.map(x=>({...x,status:'verified'}));assert.ok(planActions(a,classify(a,'B17')).every(x=>x.completed));
 b.actions=a.actions;assert.ok(planActions(b,classify(b,'B17')).every(x=>!x.completed));
});
test('metrics count held quantities without double-counting repeated actions',()=>{
 const s=seedData('test');s.analysis=classify(s,'B17');s.orders[0].status='held';s.orders[1].status='held';
 const m=summary(s);assert.equal(m.heldUnits,84);assert.equal(m.held,2);assert.equal(m.outlets,2);assert.equal(m.unresolved,1);
});
