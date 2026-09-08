import assert from 'node:assert/strict';
import { createRuntimeHeartbeat } from './lib/runtime-heartbeat.mjs';

const calls=[];
const db={async query(text,values){calls.push({text,values});return{rows:[]};}};
const heartbeat=createRuntimeHeartbeat(db,{role:'worker',instanceId:'fixture:1',minIntervalMs:60_000});
assert.equal(await heartbeat('starting',{pid:1},true),true);
assert.equal(calls.length,1);assert.equal(calls[0].values[0],'worker');assert.equal(calls[0].values[1],'fixture:1');assert.equal(calls[0].values[2],'starting');
assert.deepEqual(JSON.parse(calls[0].values[3]),{pid:1});
assert.equal(await heartbeat('idle',{processed:0}),false,'rapid non-forced heartbeat should be throttled');
assert.equal(calls.length,1);
assert.equal(await heartbeat('running',{jobId:'j1'},true),true);
assert.equal(calls.length,2);assert.equal(calls[1].values[2],'running');
assert.match(calls[1].text,/on conflict \(role,instance_id\) do update/);
assert.throws(()=>createRuntimeHeartbeat(null,{role:'worker',instanceId:'x'}),/requires db/);
assert.throws(()=>createRuntimeHeartbeat(db,{role:'',instanceId:'x'}),/requires role and instanceId/);
console.log('✓ runtime heartbeat writes are durable and upserted by role/instance');
console.log('✓ heartbeat writes are throttled unless state transition forces persistence');
