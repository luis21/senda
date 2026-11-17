import test from 'node:test';
import assert from 'node:assert/strict';
import {setTrackedExtension,restoreTestState} from './helpers/store-test-state.mjs';

test('restores the site exception even when extension cleanup reports an error',async()=>{
  let closed=false,restored=false;
  const failure=Error('Extension enable response lost');
  const errors=await restoreTestState(async()=>{closed=true;throw failure},async()=>{assert.ok(closed);restored=true});
  assert.ok(restored);assert.deepEqual(errors,[failure]);
});

test('retains both cleanup errors without skipping the second restoration',async()=>{
  const first=Error('Close failed'),second=Error('Preference still in use');
  assert.deepEqual(await restoreTestState(async()=>{throw first},async()=>{throw second}),[first,second]);
});

test('a lost disable acknowledgement still leaves a restoration obligation',async()=>{
  const changed=new Set();let enabled=true;
  await assert.rejects(setTrackedExtension(changed,'probe',false,async()=>{enabled=false;throw Error('Lost acknowledgement')},async()=>{}));
  assert.equal(enabled,false);assert.ok(changed.has('probe'));
  await setTrackedExtension(changed,'probe',true,async()=>{enabled=true},async()=>assert.equal(enabled,true));
  assert.ok(enabled);assert.equal(changed.size,0);
});

test('a restore remains pending until its enabled state has been confirmed',async()=>{
  const changed=new Set(['probe']);
  await assert.rejects(setTrackedExtension(changed,'probe',true,async()=>{},async()=>{throw Error('State unavailable')}));
  assert.ok(changed.has('probe'));
  await setTrackedExtension(changed,'probe',true,async()=>{},async()=>{});
  assert.equal(changed.size,0);
});
