'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const demo=require('../demo-flow');
test('fixed sample rotates only on service turnover, not consecutive point',()=>{
 const a=demo.snapshot(0),b=demo.advance(0,0),c=demo.advance(1,1);
 assert.deepEqual(a.score,[12,12]);assert.equal(a.server,'B');
 assert.equal(b.server,'A');assert.deepEqual(b.order,[11,12,13,10]);
 assert.deepEqual(c.order,b.order);assert.deepEqual(c.score,[14,12]);
});
test('undo restores known score and serve; terminal cannot advance',()=>{
 const s=demo.advance(2,2);assert.deepEqual(s.score,[13,12]);assert.equal(s.order[0],11);
 assert.equal(demo.advance(3,3).complete,true);assert.deepEqual(demo.advance(4,4),demo.snapshot(4));
});
test('stale double event and invalid indices do not produce arbitrary scores',()=>{
 assert.deepEqual(demo.advance(2,1),demo.snapshot(2));
 for(const i of [-1,99,NaN,'4',null,{}])assert.deepEqual(demo.snapshot(i),demo.snapshot(0));
 const copy=demo.snapshot(0);copy.score[0]=999;copy.order[0]=999;assert.deepEqual(demo.snapshot(0).score,[12,12]);
});
