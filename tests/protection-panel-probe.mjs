// Trigger controlled requests/navigations while inspecting the native panel.
// First run network-protection-browser.mjs with --headed --inspect-panel.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {connect} from './helpers/cdp.mjs';

const profile=path.resolve(process.argv[2]||'.profiles/panel-native-on');
assert.ok(profile.startsWith(path.join(process.cwd(),'.profiles')+path.sep),'Dedicated test profile required');
const command=process.argv[3]||'late';
const allow=process.argv.includes('--allow-site');
const active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
const cdp=await connect(+active[0],active[1]);
try {
  const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith('http://site.senda.test:'));
  assert.ok(target,'Controlled Senda test page required');
  const session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const url=new URL(target.url);
  if(command==='late') {
    const request=`http://tracker.senda.test:${url.port}/__utm.gif?late`;
    const result=await cdp.send('Runtime.evaluate',{expression:`fetch(${JSON.stringify(request)}).then(()=>false,()=>true)`,awaitPromise:true,returnByValue:true},session);
    assert.equal(result.result.value,!allow,'Late request must respect the native site exception');
  } else if(command==='worker') {
    const result=await cdp.send('Runtime.evaluate',{expression:`new Promise((resolve,reject)=>{const w=new Worker('/worker.js');w.onmessage=e=>{w.terminate();resolve(e.data)};w.onerror=e=>{w.terminate();reject(Error(e.message))}})`,awaitPromise:true,returnByValue:true},session);
    assert.equal(result.exceptionDetails,undefined,'Worker fixture failed');
    assert.equal(result.result.value,allow?'allowed':'blocked');
  } else if(command==='reset'||command==='empty') {
    await cdp.send('Page.navigate',{url:url.origin+(command==='empty'?'/empty':'/page?reset=1')},session);
  } else if(command==='close') {
    await cdp.send('Browser.close');
  } else {
    throw Error('Use late, worker, reset, empty or close');
  }
  console.log(JSON.stringify({command,status:'PASS',profile:path.basename(profile)}));
} finally {
  cdp.close();
}
