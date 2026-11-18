// Verifies already-installed store extensions in an explicitly disposable profile.
// Installation and its permission dialog are completed manually before this test.
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect} from './helpers/cdp.mjs';
import {setTrackedExtension,restoreTestState} from './helpers/store-test-state.mjs';

const root=process.cwd();
assert.ok(process.argv[2],'Pass the closed, disposable Chrome Web Store test profile');
const profile=path.resolve(process.argv[2]);
assert.ok(/^compatibility-cws-[a-z0-9-]+$/i.test(path.relative(path.join(root,'.profiles'),profile)),'Only an immediate .profiles/compatibility-cws-* test profile is allowed');
const ub='ddkjiahejlhfcafbddmgiahcphecmpfh',dark='eimadpbcbfnmbkopoojfekhnkhdbieeh';
const testDark=!process.argv.includes('--ubol-only');
const ids=testDark?[ub,dark]:[ub];
const build=JSON.parse(await readFile('.chromium/src/out/SendaDev/.senda-build.json','utf8'));
const manifest=JSON.parse(await readFile('config/chromium.json','utf8'));
assert.equal(build.status,'success');assert.equal(build.revision,manifest.revision);
for(const name of (await readFile('patches/series','utf8')).trim().split(/\r?\n/))assert.equal(build.patches[name].toLowerCase(),createHash('sha256').update(await readFile('patches/'+name)).digest('hex'));
// Refuse a live debugging endpoint before reading or changing test preferences.
const priorPort=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n')[0]);
const live=await new Promise(resolve=>{
  const socket=net.connect({host:'127.0.0.1',port:priorPort});
  const finish=value=>{socket.destroy();resolve(value)};
  socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(true));
});
assert.equal(live,false,'Close this test profile before running verification');
// Keep the native fixture stable while exercising installed extensions.
const localStateFile = path.join(profile,'Local State');
const localState = JSON.parse(await readFile(localStateFile,'utf8'));
localState.senda ??= {};
localState.senda.filter_updates ??= {};
localState.senda.filter_updates.automatic = false;
await writeFile(localStateFile,JSON.stringify(localState));
const secure=JSON.parse(await readFile(path.join(profile,'Default/Secure Preferences'),'utf8'));
const installed={};
for(const id of ids){
  const entry=secure.extensions?.settings?.[id];
  assert.ok(entry?.from_webstore&&entry.location===1,'Require an actual store installation: '+id);
  assert.deepEqual(entry.disable_reasons??[],[],'Extension must already be enabled');
  installed[id]={name:entry.manifest.name,version:entry.manifest.version,manifestVersion:entry.manifest.manifest_version,fromWebstore:true};
}
const output=path.join(profile,'store-check-'+Date.now());await mkdir(output);
const report={startedUtc:new Date().toISOString(),revision:manifest.revision,installed,status:'running',stages:[]};
const received=[];let port,active;
const server=http.createServer((req,res)=>{
  received.push({host:req.headers.host,url:req.url});res.setHeader('Cache-Control','no-store');
  if(req.url==='/page'){
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><title>Store extension compatibility</title><style>body{background:#fff;color:#000}</style><p id="legitimate">Controlled content</p><script src="/good.js"></script><script src="http://ad.doubleclick.net:${port}/ad.js"></script><script>window.testReady=true</script>`);
  }else{res.setHeader('Content-Type','text/javascript');res.end(req.url==='/good.js'?'window.legitimateLoaded=true':'window.adExecuted=true');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});port=server.address().port;
const origin=`http://site.senda.test:${port}`;
const preferencesFile=path.join(profile,'Default/Preferences');
const pattern=origin+',*';
const initial=JSON.parse(await readFile(preferencesFile,'utf8'));
const previousException=initial.profile?.content_settings?.exceptions?.subresource_filter?.[pattern];
let exceptionChanged=false;
async function exception(allow){
  assert.ok(!active,'Preference edits require a stopped test browser');
  const prefs=JSON.parse(await readFile(preferencesFile,'utf8'));
  if(allow){
    prefs.profile??={};prefs.profile.content_settings??={};prefs.profile.content_settings.exceptions??={};prefs.profile.content_settings.exceptions.subresource_filter??={};
    prefs.profile.content_settings.exceptions.subresource_filter[pattern]={setting:1};exceptionChanged=true;
  }else if(exceptionChanged){
    const entries=prefs.profile?.content_settings?.exceptions?.subresource_filter;
    if(entries){if(previousException===undefined)delete entries[pattern];else entries[pattern]=previousException;}
    exceptionChanged=false;
  }else return;
  await writeFile(preferencesFile,JSON.stringify(prefs));
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(action,label,ms=30000){const deadline=Date.now()+ms;do{try{const result=await action();if(result)return result;}catch(error){if(!/context.*(destroyed|found)|navigat/i.test(error.message))throw error;}await sleep(200);}while(Date.now()<deadline);throw Error('Timeout: '+label);}
async function evaluate(expression,session=active.settings){
  const value=await active.cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},session);
  if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);
  return value.result.value;
}
async function extensionInfo(id){return evaluate(`chrome.developerPrivate.getExtensionInfo(${JSON.stringify(id)})`);}
async function enabled(id,value){
  await setTrackedExtension(active.changed,id,value,
    ()=>evaluate(`chrome.management.setEnabled(${JSON.stringify(id)},${value})`),
    ()=>until(async()=>(await extensionInfo(id)).state===(value?'ENABLED':'DISABLED'),'extension state'));
}
async function start(){
  await rm(path.join(profile,'DevToolsActivePort'),{force:true});
  const child=spawn(path.join(root,'.chromium/src/out/SendaDev/chrome.exe'),['--headless',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--no-proxy-server','--allow-chrome-scheme-url','--disable-sync','--host-resolver-rules=MAP *.senda.test 127.0.0.1, MAP ad.doubleclick.net 127.0.0.1','chrome://extensions/'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',data=>stderr=(stderr+data).slice(-16000));child.on('error',error=>{stderr+='\n'+error.message});
  active={child,changed:new Set(),stderr:()=>stderr};
  const endpoint=await until(async()=>{if(child.exitCode!==null)throw Error('Browser exited '+stderr.slice(-500));try{return (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n')}catch{return false}},'browser endpoint',60000);
  active.cdp=await connect(Number(endpoint[0]),endpoint[1]);
  const settings=await until(async()=>(await active.cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url==='chrome://extensions/'),'native extension settings');
  active.settings=(await active.cdp.send('Target.attachToTarget',{targetId:settings.targetId,flatten:true})).sessionId;
  await until(()=>evaluate('Boolean(chrome.developerPrivate?.getExtensionInfo)'),'extension settings API');
  const inventory=await evaluate('chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true})');
  report.inventory??=inventory.map(item=>({id:item.id,name:item.name,version:item.version,state:item.state,location:item.location}));
  for(const id of ids){const info=await extensionInfo(id);assert.equal(info.state,'ENABLED');assert.equal(info.location,'FROM_STORE');assert.equal(info.version,installed[id].version);}
  const page=(await active.cdp.send('Target.createTarget',{url:'about:blank'})).targetId;
  active.page=(await active.cdp.send('Target.attachToTarget',{targetId:page,flatten:true})).sessionId;
  await active.cdp.send('Page.enable',{},active.page);
}
async function rules(){
  const target=(await active.cdp.send('Target.createTarget',{url:`chrome-extension://${ub}/popup.html`})).targetId;
  try{
    const session=(await active.cdp.send('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;
    await until(()=>evaluate(`globalThis.chrome?.runtime?.id==='${ub}'`,session),'uBOL extension context');
    return await evaluate(`chrome.declarativeNetRequest.getEnabledRulesets().then(ids=>ids.sort())`,session);
  }finally{await active.cdp.send('Target.closeTarget',{targetId:target});}
}
const adRequests=()=>received.filter(r=>r.host===`ad.doubleclick.net:${port}`&&r.url==='/ad.js').length;
async function page(label,blocked){
  const before=adRequests();const navigation=await active.cdp.send('Page.navigate',{url:origin+'/page'},active.page);assert.ok(!navigation.errorText,navigation.errorText);
  await until(()=>evaluate('window.testReady===true',active.page),'controlled page');
  assert.equal(await evaluate('window.legitimateLoaded===true',active.page),true);
  assert.equal(await evaluate('window.adExecuted===true',active.page),!blocked);
  assert.equal(adRequests()-before,blocked?0:1);
  report.stages.push({name:label,status:'PASS',adReachedServer:!blocked,legitimateContent:'PASS'});console.log('PASS: '+label);
}
async function stop(){
  if(!active)return;const current=active;let failure;
  try{
    for(const id of current.changed){try{await enabled(id,true)}catch(error){failure??=error;}}
    if(current.cdp){try{await current.cdp.send('Browser.close')}catch{}current.cdp.close()}else current.child.kill();
    await until(()=>current.child.exitCode!==null||current.child.signalCode!==null,'browser exit',15000);
  }catch(error){failure??=error;current.child.kill();await until(()=>current.child.exitCode!==null||current.child.signalCode!==null,'forced browser exit',5000);}
  finally{await writeFile(path.join(output,'browser-last.log'),current.stderr());if(current.child.exitCode!==null||current.child.signalCode!==null)active=null;}
  if(failure)throw failure;
}
try{
  await exception(true);await start();
  const initialRules=await rules();assert.ok(initialRules.includes('easylist'));report.enabledRulesets=initialRules;
  await page('store extension blocks with native site exception',true);
  await enabled(ub,false);await page('without either blocker the ad reaches the server',false);
  await enabled(ub,true);await page('reenabling the store extension restores blocking',true);
  const workerWatch=active.cdp.watch('ServiceWorker.workerVersionUpdated',active.page);
  try{
    await active.cdp.send('ServiceWorker.enable',{},active.page);
    const versions=()=>workerWatch.events.flatMap(event=>event.versions??[]).filter(version=>version.scriptURL?.startsWith(`chrome-extension://${ub}/`));
    await until(()=>versions().length>0,'uBOL worker registration');
    const initialStatus=versions().at(-1).runningStatus;
    const beforeStop=workerWatch.events.length;
    await active.cdp.send('ServiceWorker.stopAllWorkers',{},active.page);
    if(initialStatus!=='stopped')await until(()=>workerWatch.events.slice(beforeStop).some(event=>event.versions?.some(version=>version.scriptURL?.startsWith(`chrome-extension://${ub}/`)&&version.runningStatus==='stopped')),'uBOL running status stopped');
    await page('declarative filtering after stopping the extension worker',true);
    report.workerLifecycle={initialStatus,observedStatuses:versions().map(version=>version.runningStatus).slice(-20)};
  }finally{workerWatch.stop();}
  if(testDark){
    await enabled(dark,false);await page('Dark Reader disabled control',true);
    const original=await evaluate('getComputedStyle(document.body).backgroundColor',active.page);assert.equal(original,'rgb(255, 255, 255)');
    await enabled(dark,true);await page('Dark Reader enabled control',true);
    await until(()=>evaluate(`getComputedStyle(document.body).backgroundColor!=='rgb(255, 255, 255)'&&[...document.querySelectorAll('style.darkreader--sync')].some(style=>{try{return style.sheet.cssRules.length>0}catch{return false}})`,active.page),'Dark Reader transformed styles');
    report.darkReader=await evaluate(`({mode:document.documentElement.getAttribute('data-darkreader-mode'),background:getComputedStyle(document.body).backgroundColor,foreground:getComputedStyle(document.body).color})`,active.page);
  }
  await stop();await exception(false);await start();
  assert.deepEqual(await rules(),initialRules);
  await page('both blockers after browser restart',true);
  if(testDark){
    await until(()=>evaluate(`getComputedStyle(document.body).backgroundColor!=='rgb(255, 255, 255)'&&[...document.querySelectorAll('style.darkreader--sync')].some(style=>{try{return style.sheet.cssRules.length>0}catch{return false}})`,active.page),'Dark Reader transformed styles after restart');
    report.darkReaderAfterRestart=await evaluate(`({mode:document.documentElement.getAttribute('data-darkreader-mode'),background:getComputedStyle(document.body).backgroundColor,foreground:getComputedStyle(document.body).color})`,active.page);
    assert.equal(report.darkReaderAfterRestart.background,report.darkReader.background);
    assert.equal(report.darkReaderAfterRestart.foreground,report.darkReader.foreground);
  }
  await enabled(ub,false);await page('native blocking remains active without uBOL',true);await enabled(ub,true);
  for(const id of ids)assert.equal((await extensionInfo(id)).state,'ENABLED');
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;}
finally{
  const errors=await restoreTestState(stop,async()=>{
    await exception(false);
    const prefs=JSON.parse(await readFile(preferencesFile,'utf8'));
    assert.deepEqual(prefs.profile?.content_settings?.exceptions?.subresource_filter?.[pattern],previousException);
    report.siteExceptionRestored=true;
  });
  if(errors.length){report.status='FAIL';report.restorationErrors=errors.map(error=>error.stack);}
  await new Promise(resolve=>server.close(resolve));report.completedUtc=new Date().toISOString();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,report:path.join(output,'report.json')}));
if(report.status!=='PASS')process.exitCode=1;
