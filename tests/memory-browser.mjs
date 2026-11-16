import http from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from './helpers/cdp.mjs';

const run=promisify(execFile);
const root=process.cwd();
const profile=path.resolve(process.argv[2] || '.profiles/memory-test');
assert.ok(profile.startsWith(path.join(root,'.profiles')+path.sep),'Use a workspace test profile');
try {await access(profile);throw Error('Use a new profile for each measurement');} catch(error) {if(error.code!=='ENOENT')throw error;}
const prefsOnly=process.argv.includes('--prefs-only');
const control=process.argv.includes('--control');
const aggressive=process.argv.includes('--aggressive');
const restorationProbe=process.argv.includes('--restoration-probe');
const ordinaryCount=restorationProbe?1:10;
assert.ok(!restorationProbe || control,'The targeted restoration probe uses an explicit control profile');
const duration=Number(process.argv.find(a=>a.startsWith('--duration='))?.split('=')[1] || 960);
const expectedState=Number(process.argv.find(a=>a.startsWith('--expect-state='))?.split('=')[1] || (control?0:2));
assert.ok(Number.isFinite(duration)&&duration>=0&&duration<=4000);
const records=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/ready') {
    records.push({id:url.searchParams.get('id'),discarded:url.searchParams.get('discarded')==='true',storageToken:url.searchParams.get('token'),at:Date.now()});
    res.end('ok');return;
  }
  const id=url.searchParams.get('id') || '0';
  const capture=id==='capture';
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
  res.end(`<!doctype html><title>Senda memory ${id}</title><input id=work><script>
    window.memory=new Uint8Array(32*1024*1024);
    for(let i=0;i<memory.length;i+=4096)memory[i]=1;
    if(!sessionStorage.getItem('senda-memory-proof'))sessionStorage.setItem('senda-memory-proof','${randomUUID()}');
    (async()=>{
      ${capture?"window.stream=await navigator.mediaDevices.getUserMedia({audio:true});":''}
      await fetch('/ready?id=${id}&discarded='+document.wasDiscarded+'&token='+sessionStorage.getItem('senda-memory-proof'));
      window.fixtureReady=true;
    })();
  </script>`);
});
await mkdir(path.join(profile,'Default'),{recursive:true});
const localState={internal_only_uis_enabled:!prefsOnly};
if(control || aggressive)localState.performance_tuning={high_efficiency_mode:{...(control?{state:0}:{}),...(aggressive?{aggressiveness:2}:{})}};
await writeFile(path.join(profile,'Local State'),JSON.stringify(localState));
await writeFile(path.join(profile,'Default/Preferences'),JSON.stringify({performance_tuning:{tab_discarding:{exceptions_with_time:{'keep.memory.test':String((BigInt(Date.now())+11644473600000n)*1000n)}}}}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=spawn(path.join(root,'.chromium/src/out/SendaDev/chrome.exe'),[
  ...(prefsOnly?['--headless']:[]),`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check',
  ...(process.argv.includes('--no-empty-reuse')?['--disable-features=TrackEmptyRendererProcessesForReuse']:[]),
  '--no-proxy-server','--host-resolver-rules=MAP *.test 127.0.0.1','--use-fake-device-for-media-stream',
  'about:blank',
],{windowsHide:true,stdio:'ignore'});
let cdp;
let nativeCacheDefaults;
const samples=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function evaluate(session,expression) {
  const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function attach(targetId) {return (await cdp.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;}
async function until(fn,timeout=30000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) {const value=await fn();if(value)return value;await sleep(200);}
  throw Error('Timed out waiting for browser fixture');
}
async function sample(label) {
  let result;
  for(let attempt=0;attempt<3;attempt++) {
    const {stdout}=await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/Measure-SendaProcessTree.ps1'),'-BrowserProcessId',String(browser.pid)],{windowsHide:true});
    result={label,...JSON.parse(stdout)};
    if(result.missingProcessCount===0)break;
    await sleep(500);
  }
  assert.ok(result.privateBytes>0&&result.processes.length>1);
  samples.push(result);
  console.log(JSON.stringify({label,privateMiB:Math.round(result.privateBytes/1048576),processCount:result.processes.length}));
}
try {
  const active=await until(async()=>{try{return (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch {if(browser.exitCode!==null)throw Error('Browser exited');}},60000);
  cdp=await connect(+active[0],active[1]);
  const target=await until(async()=>(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'));
  const settingsTarget=(await cdp.send('Target.createTarget',{url:'chrome://settings/'})).targetId;
  const settings=await attach(settingsTarget);
  await until(async()=>await evaluate(settings,'typeof chrome.settingsPrivate')==='object');
  const preferences=await evaluate(settings,`Promise.all(
    ['performance_tuning.high_efficiency_mode.state','performance_tuning.high_efficiency_mode.aggressiveness']
      .map(key=>new Promise(resolve=>{
        chrome.settingsPrivate.getPref(key,p=>resolve({key,value:p?.value}));
      }))
  )`);
  console.log(JSON.stringify({preferences}));
  assert.equal(preferences[0].value,expectedState,'Memory saver default/state differs');
  assert.equal(preferences[1].value,aggressive?2:1,'Memory saver mode differs');
  if(!prefsOnly) {
    const versionTarget=(await cdp.send('Target.createTarget',{url:'chrome://version/'})).targetId;
    const versionSession=await attach(versionTarget);
    const commandLine=await until(()=>evaluate(versionSession,"document.getElementById('command_line')?.textContent"));
    const disabled=commandLine.match(/--disable-features=(?:"([^"]+)"|([^\s]+))/);
    const flags=(disabled?.[1] || disabled?.[2] || '').split(',');
    nativeCacheDefaults={emptyRendererReuseDisabled:flags.includes('TrackEmptyRendererProcessesForReuse'),transientKeepAliveDisabled:flags.includes('TransientKeepAlivePolicy')};
    console.log(JSON.stringify({nativeCacheDefaults}));
    assert.ok(nativeCacheDefaults.emptyRendererReuseDisabled&&nativeCacheDefaults.transientKeepAliveDisabled,'Native startup must disable both optional caches');
    await cdp.send('Target.detachFromTarget',{sessionId:versionSession});
    await cdp.send('Target.closeTarget',{targetId:versionTarget});
    await cdp.send('Browser.grantPermissions',{permissions:['audioCapture'],origin:`http://127.0.0.1:${port}`});
    await cdp.send('Target.detachFromTarget',{sessionId:settings});
    const inspector=(await cdp.send('Target.createTarget',{url:'chrome://discards/'})).targetId;
    await cdp.send('Target.closeTarget',{targetId:target.targetId});
    await cdp.send('Target.closeTarget',{targetId:settingsTarget});
    const monitor=await attach(inspector);
    await until(async()=>await evaluate(monitor,'document.readyState')==='complete');
    await evaluate(monitor,"import('./discards.js').then(m=>window.sendaProvider=m.getOrCreateDetailsProvider()).then(()=>true)");
    const tabs=[];
    for(const id of [...Array(ordinaryCount).keys()].map(String).concat(['keep','form','capture','active'])) {
      const host=id==='keep'?'keep.memory.test':id==='capture'?'127.0.0.1':`page.memory${id}.test`;
      const url=`http://${host}:${port}/page?id=${id}`;
      const targetId=(await cdp.send('Target.createTarget',{url,background:true})).targetId;
      await until(()=>records.some(r=>r.id===id));
      if(id==='form') {
        await cdp.send('Target.activateTarget',{targetId});
        const session=await attach(targetId);
        await evaluate(session,"document.querySelector('#work').focus();true");
        await cdp.send('Input.insertText',{text:'Trabajo sin guardar'},session);
        await cdp.send('Target.detachFromTarget',{sessionId:session});
      }
      tabs.push({id,url,targetId});
    }
    const foreground=tabs.find(t=>t.id==='active');
    await cdp.send('Target.activateTarget',{targetId:foreground.targetId});
    // Wake only the internal monitor so a background/frozen WebUI cannot
    // stall its Mojo promise. Ordinary measured pages are never activated.
    const infos=async()=>{
      await cdp.send('Target.activateTarget',{targetId:inspector});
      try {
        return await evaluate(monitor,'window.sendaProvider.getTabDiscardsInfo().then(r=>r.infos)');
      } finally {
        await cdp.send('Target.activateTarget',{targetId:foreground.targetId});
      }
    };
    await sleep(3000);
    const initial=await infos();
    const reasonsFor=id=>initial.find(t=>t.tabUrl===tabs.find(tab=>tab.id===id).url)?.cannotDiscardReasons.join('; ') || '';
    assert.match(reasonsFor('capture'),/captur/i,'Fake capture must activate the real media protection');
    assert.match(reasonsFor('form'),/form|edited/i,'Form protection fixture did not activate');
    assert.match(reasonsFor('keep'),/opted out/i,'Site exception fixture did not activate');
    console.log(JSON.stringify({initial:initial.filter(t=>t.tabUrl.includes('/page?')).map(t=>({url:t.tabUrl,state:t.state,canDiscard:t.canDiscard,reasons:t.cannotDiscardReasons}))}));
    await sample('loaded');
    const end=Date.now()+duration*1000;
    while(Date.now()<end) {
      await sleep(Math.min(30000,end-Date.now()));
      const state=await infos();
      const discarded=state.filter(t=>t.state===5&&t.tabUrl.includes('/page?')).length;
      console.log(JSON.stringify({remainingSeconds:Math.ceil((end-Date.now())/1000),discarded}));
    }
    const final=await infos();
    await sample('idle');
    const report={validated:false,control,durationSeconds:duration,version:await cdp.send('Browser.getVersion'),preferences,nativeCacheDefaults,samples,initial,final,records};
    const reportPath=path.join(profile,'memory-results.json');
    await writeFile(reportPath,JSON.stringify(report,null,2));
    console.log(JSON.stringify({final:final.filter(t=>t.tabUrl.includes('/page?')).map(t=>({url:t.tabUrl,state:t.state,discardCount:t.discardCount,reason:t.discardReason}))}));
    for(const id of ['keep','form','capture','active']) {
      const info=final.find(t=>t.tabUrl===tabs.find(t=>t.id===id).url);
      assert.ok(info,'Missing protected tab '+id);
      assert.equal(info.discardCount,0,'Protected tab was discarded: '+id);
    }
    const ordinary=final.filter(t=>tabs.slice(0,ordinaryCount).some(tab=>tab.url===t.tabUrl));
    assert.equal(ordinary.length,ordinaryCount);
    for(const info of ordinary) {
      assert.equal(info.discardCount,control?0:1,'Unexpected automatic discard count: '+info.tabUrl);
      if(!control)assert.equal(info.discardReason,2,'Discard must be proactive, never manually forced');
    }
    if(!control)assert.ok(samples[0].privateBytes-samples[1].privateBytes>32*1024*1024,
      'Automatic suspension must produce a measurable reduction in whole-tree private memory');
    let restoration;
    if(!control || restorationProbe) {
      if(restorationProbe) {
        const inspected=await attach(tabs[0].targetId);
        console.log(JSON.stringify({fixtureMemory:await evaluate(inspected,'({bytes:window.memory?.byteLength,view:ArrayBuffer.isView(window.memory)})')}));
        await cdp.send('Target.detachFromTarget',{sessionId:inspected});
        const restoreInfo=ordinary.find(t=>t.tabUrl===tabs[0].url);
        await evaluate(monitor,`window.sendaProvider.getTabDiscardsInfo().then(r=>window.sendaProvider.discardById(r.infos.find(t=>t.tabUrl===${JSON.stringify(tabs[0].url)}).id,0)).then(()=>true)`);
        await until(async()=>(await infos()).find(t=>t.tabUrl===tabs[0].url)?.state===5);
        await sleep(3000);
        await sample('single-discard-diagnostic');
        for(const query of ['Discarding.AttemptFastKill','BrowserRenderProcessHost.FastShutdown']) {
          console.log(JSON.stringify(await cdp.send('Browser.getHistograms',{query})));
        }
      }
      const start=Date.now();
      await cdp.send('Target.activateTarget',{targetId:tabs[0].targetId});
      const ready=await until(()=>records.find(r=>r.id==='0'&&r.discarded));
      const restored=await attach(tabs[0].targetId);
      const original=records.find(r=>r.id==='0'&&!r.discarded).storageToken;
      assert.ok(original,'Initial storage token missing');
      assert.equal(await evaluate(restored,"sessionStorage.getItem('senda-memory-proof')"),original);
      await cdp.send('Target.detachFromTarget',{sessionId:restored});
      restoration={milliseconds:ready.at-start,sessionStoragePreserved:true,manualProbe:restorationProbe};
    }
    report.validated=true;
    report.restoration=restoration;
    await writeFile(reportPath,JSON.stringify(report,null,2));
    console.log(JSON.stringify({pass:true,control,restoration,report:reportPath}));
  } else console.log('PASS: memory saver preferences verified');
} finally {
  if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.close();}else browser.kill();
  await new Promise(resolve=>server.close(resolve));
}
