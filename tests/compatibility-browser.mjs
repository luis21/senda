// Runs only synthetic loopback pages and a copied, locally authored extension.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect} from './helpers/cdp.mjs';

const root=process.cwd();
const runRoot=path.resolve(process.argv[2]||`.profiles/compatibility-${Date.now()}`);
const relative=path.relative(path.join(root,'.profiles'),runRoot);
assert.ok(/^compatibility-[a-z0-9-]+$/i.test(relative),'Use a new immediate child .profiles/compatibility-*');
const manifest=JSON.parse(await readFile('config/chromium.json','utf8'));
const reference=process.argv.includes('--reference');
const headed=process.argv.includes('--headed');
const startupProbe=process.argv.includes('--startup-probe');
const navigationAfterStart=process.argv.includes('--navigate-after-start');
let referenceMetadata;
if(reference) {
  referenceMetadata=JSON.parse(await readFile('.tools/chrome-reference-156.json','utf8'));
  assert.equal(referenceMetadata.version,manifest.version);
  assert.equal(referenceMetadata.url,`https://storage.googleapis.com/chrome-for-testing-public/${manifest.version}/win64/chrome-win64.zip`);
  const executable=await readFile('.tools/chrome-reference-156/chrome-win64/chrome.exe');
  assert.equal(createHash('sha256').update(executable).digest('hex'),referenceMetadata.sha256.toLowerCase());
}
const build=JSON.parse(await readFile('.chromium/src/out/SendaDev/.senda-build.json','utf8'));
assert.equal(build.status,'success');assert.equal(build.revision,manifest.revision);
assert.ok(build.patches,'Build stamp lacks patch hashes; rebuild with tools/Build-Senda.ps1');
for(const name of (await readFile('patches/series','utf8')).trim().split(/\r?\n/)) {
  assert.equal(String(build.patches?.[name]??'').toLowerCase(),createHash('sha256').update(await readFile('patches/'+name)).digest('hex'),'Outdated build: '+name);
}
await mkdir(path.join(root,'.profiles'),{recursive:true});
await mkdir(runRoot); // Refuse existing profiles, including previous test runs.
await mkdir('.tools',{recursive:true});
const extension=path.join(runRoot,'extension');
await mkdir(extension);
for(const file of ['manifest.json','worker.js','content.js']) await copyFile('tests/fixtures/compat-extension/'+file,path.join(extension,file));
const report={startedUtc:new Date().toISOString(),revision:manifest.revision,browserKind:reference?'Chrome for Testing':'Senda',headed,startupProbe,navigationAfterStart,referenceMetadata,status:'running',stages:[]};
const requests=[];
const wasm=Buffer.from([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
let port,active,withoutFetchHandler=false;
const webFiles=new Map(['/app.mjs','/math.mjs','/web-worker.js'].map(name=>[name,readFile('tests/fixtures/compat-web'+name)]));
const server=http.createServer(async(req,res)=>{
  requests.push({host:req.headers.host,path:req.url});
  res.setHeader('Cache-Control','no-store');
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/page') {
      res.setHeader('Content-Type','text/html');
      res.end((await readFile('tests/fixtures/compat-web/page.html','utf8')).replaceAll('SERVER_PORT',String(port)));
    } else if(pathname==='/uncontrolled') {
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Uncontrolled compatibility page</title>');
    } else if(webFiles.has(pathname)) {
      res.setHeader('Content-Type','text/javascript');
      res.end(pathname==='/web-worker.js'&&withoutFetchHandler
        ?await readFile('tests/fixtures/compat-web/worker-without-fetch.js')
        :await webFiles.get(pathname));
    } else if(pathname==='/add.wasm') {res.setHeader('Content-Type','application/wasm');res.end(wasm);}
    else if(pathname==='/ad.js') {res.setHeader('Content-Type','text/javascript');res.end('window.nativeAdExecuted=true');}
    else if(pathname==='/extension-blocked') res.end('allowed');
    else if(pathname==='/permission-probe') res.end('loopback-permission-body');
    else {res.statusCode=404;res.end('not found');}
  } catch(error) {res.statusCode=500;res.end(String(error));}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});port=server.address().port;
const origin=`http://127.0.0.1:${port}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function evaluate(expression,session=active.session) {
  let result;
  try{result=await active.cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);}
  catch(error){throw Error(error.message+' while evaluating '+expression.slice(0,180));}
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function until(predicate,label,timeout=20000) {
  const deadline=Date.now()+timeout;
  do {
    try {const result=await predicate();if(result)return result;}
    catch(error) {if(!/context.*(destroyed|found)|navigat/i.test(error.message))throw error;}
    await sleep(150);
  } while(Date.now()<deadline);
  throw Error('Timeout: '+label);
}
async function start(profile,withExtension,loadExtension=withExtension,{afterStart=navigationAfterStart,extensionPath=extension}={}) {
  await mkdir(profile,{recursive:true});
  await rm(path.join(profile,'DevToolsActivePort'),{force:true});
  const binary=path.join(root,reference?'.tools/chrome-reference-156/chrome-win64/chrome.exe':'.chromium/src/out/SendaDev/chrome.exe');
  const process=spawn(binary,[...(headed?[]:['--headless']),`--user-data-dir=${profile}`,'--remote-debugging-port=0',
    '--no-first-run','--no-default-browser-check','--no-proxy-server','--allow-chrome-scheme-url','--disable-sync',
    '--host-resolver-rules=MAP ad.doubleclick.net 127.0.0.1, MAP localhost 127.0.0.1',
    ...(withExtension?[`--disable-extensions-except=${extensionPath}`,...(loadExtension?[`--load-extension=${extensionPath}`]:[])]:['--disable-extensions']),afterStart?'about:blank':origin+'/page',
  ],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let stderr='';process.stderr.on('data',data=>{stderr=(stderr+data).slice(-16000);});
  process.on('error',error=>{stderr+='\n'+error.message;});
  active={process,profile,stderr:()=>stderr};
  const endpoint=await until(async()=>{
    if(process.exitCode!==null||process.signalCode!==null)throw Error('Browser exited: '+process.exitCode+' '+stderr.slice(-1000));
    try{return (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return false;}
  },'browser endpoint',60000);
  active.cdp=await connect(+endpoint[0],endpoint[1]);
  const target=await until(async()=> (await active.cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url===(afterStart?'about:blank':origin+'/page')),'controlled page');
  active.session=(await active.cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await active.cdp.send('Page.enable',{},active.session);
  if(afterStart)await active.cdp.send('Page.navigate',{url:origin+'/page'},active.session);
  await until(()=>evaluate('window.webReady===true'),'web API fixture');
}
async function stop() {
  if(!active)return;
  const current=active;
  const exited=()=>current.process.exitCode!==null||current.process.signalCode!==null;
  try {
    if(current.cdp) {try{await current.cdp.send('Browser.close');}catch{}current.cdp.close();}
    else current.process.kill();
    try {await until(exited,'browser exit',15000);}
    catch(error) {
      current.process.kill();
      await until(exited,'forced browser exit',5000);
      report.cleanupWarnings??=[];report.cleanupWarnings.push(error.message);
    }
  } finally {
    await writeFile(path.join(runRoot,'browser-last.log'),current.stderr());
    if(exited())active=null;
  }
}
async function checkWeb(label,storedBefore,expectedWorkerResponse='local-service-worker') {
  assert.equal(await evaluate('window.webFailure??null'),null);
  const value=await evaluate('window.webResults');
  if(value.serviceWorker!==expectedWorkerResponse) {
    report.webFailureDetail=value;
    report.workerMessage=await evaluate(`new Promise((resolve,reject)=>{
      const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('Worker diagnostic timed out')),5000);
      channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};
      navigator.serviceWorker.controller.postMessage('senda-diagnostic',[channel.port2]);
    })`);
    report.workerFetchRetry=await evaluate(`fetch('/sw-resource',{cache:'no-store'}).then(r=>r.text())`);

  }
  assert.equal(value.modules,42);assert.equal(value.dynamicImport,42);assert.equal(value.wasm,42);
  assert.equal(value.indexedDBBefore,storedBefore);assert.equal(value.cache,'local-cache');
  assert.equal(value.serviceWorker,expectedWorkerResponse);assert.deepEqual(value.canvas,[18,52,86,255]);
  assert.equal(value.grid,'100px 150px');
  if(!reference) {
    assert.equal(await evaluate('window.nativeAdExecuted===true'),false);
    assert.equal(requests.filter(r=>r.host?.startsWith('ad.doubleclick.net:')).length,0,'Native blocker must remain independent of the extension');
  }
  report.stages.push({name:label,web:value,nativeBlocking:reference?'not applicable':'PASS'});
  console.log('PASS: '+label);
}
async function ask(action) {return evaluate(`window.askExtension(${JSON.stringify(action)})`);}
async function extensionReady(version) {
  await until(()=>evaluate(`document.documentElement.dataset.sendaExtension===${JSON.stringify(version)}`),'content script '+version);
  const result=await ask('probe');assert.equal(result.version,version);
  assert.equal(result.outsidePermission,false);
  assert.ok(result.permissions.permissions.includes('storage'));
  assert.deepEqual(result.permissions.origins,['http://127.0.0.1/*']);
  return result;
}
async function resource(shouldBlock) {
  const before=requests.filter(r=>r.path.startsWith('/extension-blocked')).length;
  const value=await evaluate(`fetch('/extension-blocked?case='+crypto.randomUUID(),{cache:'no-store'}).then(r=>r.text(),()=> 'blocked')`);
  assert.equal(value,shouldBlock?'blocked':'allowed');
  assert.equal(requests.filter(r=>r.path.startsWith('/extension-blocked')).length-before,shouldBlock?0:1);
}
async function reloadPage() {
  await evaluate('window.webReady=false');
  await active.cdp.send('Page.reload',{},active.session);
  await until(()=>evaluate('window.webReady===true'),'reloaded page');
}
async function developerConfiguration(enable=false,reloadId=null) {
  const target=(await active.cdp.send('Target.createTarget',{url:'chrome://extensions/'})).targetId;
  try {
    const session=(await active.cdp.send('Target.attachToTarget',{targetId:target,flatten:true})).sessionId;
    await until(()=>evaluate('Boolean(globalThis.chrome?.developerPrivate?.getProfileConfiguration)',session),'native extension settings API');
    if(enable) await evaluate('chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true})',session);
    const config=await evaluate('chrome.developerPrivate.getProfileConfiguration()',session);
    assert.equal(config.inDeveloperMode,true,'Local development requires the normal developer-mode setting');
    if(reloadId) {
      const error=await evaluate(`chrome.developerPrivate.reload(${JSON.stringify(reloadId)},{failQuietly:true,populateErrorForUnpacked:true})`,session);
      assert.ok(error==null,'Native extension reload failed: '+JSON.stringify(error));
    }
  } finally {await active.cdp.send('Target.closeTarget',{targetId:target});}
}
try {
  if(startupProbe) {
    report.startupCases=[];
    const failures=[];
    const specimens=[
      {name:'no-extension',withExtension:false},
      {name:'empty-extension',withExtension:true},
      {name:'dnr-permission-only',withExtension:true,dnr:true},
      {name:'dnr-navigation-after-start',withExtension:true,dnr:true,afterStart:true},
      {name:'controller-without-fetch-handler',withExtension:true,dnr:true,withoutFetch:true},
    ];
    const selected=process.argv.find(arg=>arg.startsWith('--startup-case='))?.split('=')[1];
    assert.ok(!selected||specimens.some(specimen=>specimen.name===selected),'Unknown startup case');
    for(const specimen of specimens.filter(specimen=>!selected||specimen.name===selected)) {
      report.phase='startup probe: '+specimen.name;
      withoutFetchHandler=Boolean(specimen.withoutFetch);
      const expectedWorkerResponse=withoutFetchHandler?'not found':'local-service-worker';
      const extensionPath=path.join(runRoot,'extension-'+specimen.name);
      await mkdir(extensionPath);
      await writeFile(path.join(extensionPath,'manifest.json'),JSON.stringify({
        manifest_version:3,name:'Senda startup probe',version:'1.0.0',
        permissions:specimen.dnr?['declarativeNetRequest']:[],
      }));
      const options={extensionPath,afterStart:Boolean(specimen.afterStart)};
      const profile=path.join(runRoot,specimen.name);
      const result={name:specimen.name,afterStart:options.afterStart,expectedWorkerResponse};
      await start(profile,specimen.withExtension,specimen.withExtension,options);
      await checkWeb(specimen.name+' fresh',null,expectedWorkerResponse);await stop();
      await start(profile,specimen.withExtension,specimen.withExtension,options);
      result.cold=await evaluate('window.webResults');
      try {await checkWeb(specimen.name+' cold restart',42,expectedWorkerResponse);}
      catch(error) {
        if(!(error instanceof assert.AssertionError))throw error;
        result.error=error.message;failures.push(specimen.name);
      }
      await reloadPage();result.reloaded=await evaluate('window.webResults');
      await checkWeb(specimen.name+' reloaded',42,expectedWorkerResponse);await stop();
      report.startupCases.push(result);
      console.log(JSON.stringify({name:result.name,cold:result.cold.serviceWorker,reloaded:result.reloaded.serviceWorker}));
    }
    assert.deepEqual(failures,[],'Web compatibility failures after cold restart');
  } else {
  report.phase='baseline';
  await start(path.join(runRoot,'baseline'),false);
  report.browser=await active.cdp.send('Browser.getVersion');
  await checkWeb('baseline without extension',null);
  assert.equal(await evaluate('document.documentElement.dataset.sendaExtension??null'),null);
  await resource(false);await stop();

  if(process.argv.includes('--web-only')) {
    report.phase='web restart without extension';
    await start(path.join(runRoot,'baseline'),false);
    await checkWeb('browser restart without extension',42);
    await stop();
  } else {
  const profile=path.join(runRoot,'with-extension');
  report.phase='installation and permissions';
  await start(profile,true);await checkWeb('extension installation',null);
  const initial=await extensionReady('1.0.0');
  await developerConfiguration(true);
  const remembered=await ask('remember');assert.equal(remembered.marker,42);
  const permissionStart=requests.length;
  const permissions=await ask('permissions');
  assert.deepEqual(permissions.permissionProbe,{allowed:'loopback-permission-body',denied:'blocked'});
  for(const host of [`127.0.0.1:${port}`,`localhost:${port}`]) {
    assert.equal(requests.slice(permissionStart).filter(r=>r.host===host&&r.path==='/permission-probe').length,1);
  }
  await ask('block-on');await resource(true);await ask('block-off');await resource(false);await ask('block-on');
  report.stages.push({name:'extension APIs',version:initial.version,storage:'PASS',messaging:'PASS',hostPermissions:'PASS',reversibleDNR:'PASS'});

  const workerBefore=(await ask('probe')).boot;
  report.phase='worker reactivation';
  await active.cdp.send('ServiceWorker.enable',{},active.session);
  await active.cdp.send('ServiceWorker.stopAllWorkers',{},active.session);
  const reactivated=await ask('probe');assert.notEqual(reactivated.boot,workerBefore);assert.equal(reactivated.marker,42);
  await resource(true);
  report.stages.push({name:'worker stop and reactivation',newWorker:true,storage:'PASS',DNR:'PASS'});

  report.phase='content script scope';
  const outside=(await active.cdp.send('Target.createTarget',{url:`http://localhost:${port}/page`})).targetId;
  const outsideSession=(await active.cdp.send('Target.attachToTarget',{targetId:outside,flatten:true})).sessionId;
  await until(()=>evaluate('window.webReady===true',outsideSession),'outside host fixture');
  assert.equal(await evaluate('document.documentElement.dataset.sendaExtension??null',outsideSession),null);
  await active.cdp.send('Target.closeTarget',{targetId:outside});

  const updated=JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));updated.version='1.1.0';
  await writeFile(path.join(extension,'manifest.json'),JSON.stringify(updated));
  report.phase='extension update';
  await developerConfiguration(false,initial.id);
  // Reload is asynchronous, and an idle extension need not have a live worker.
  await until(async()=> {
    await reloadPage();
    return evaluate(`document.documentElement.dataset.sendaExtension==='1.1.0'`);
  },'updated content script');
  await checkWeb('extension update page',42);
  const afterUpdate=await extensionReady('1.1.0');assert.equal(afterUpdate.marker,42);await resource(true);
  await until(async()=> (await ask('probe')).installEvents?.some(e=>e.reason==='update'&&e.version==='1.1.0'),'extension update event');
  report.stages.push({name:'extension update',version:afterUpdate.version,preservedStorage:'PASS',preservedDNR:'PASS'});
  await stop();

  report.phase='browser restart';
  await start(profile,true,false);
  await developerConfiguration();
  const restarted=await extensionReady('1.1.0');assert.equal(restarted.marker,42);await resource(true);
  assert.notEqual(restarted.boot,afterUpdate.boot);
  report.stages.push({name:'restart with extension',version:restarted.version,storage:'PASS',DNR:'PASS'});
  await checkWeb('browser restart',42);
  assert.equal(await evaluate('navigator.serviceWorker.getRegistration().then(registration=>registration.unregister())'),true);
  await active.cdp.send('Page.navigate',{url:origin+'/uncontrolled'},active.session);
  await until(()=>evaluate(`location.pathname==='/uncontrolled'&&document.readyState==='complete'&&navigator.serviceWorker.controller===null`),'page without a service worker controller');
  const networkBefore=requests.filter(request=>request.path==='/sw-resource').length;
  assert.equal(await evaluate(`fetch('/sw-resource',{cache:'no-store'}).then(response=>response.text())`),'not found');
  assert.equal(requests.filter(request=>request.path==='/sw-resource').length-networkBefore,1);
  await resource(true);
  report.stages.push({name:'navigation after worker unregistration',controller:'absent',network:'PASS',DNR:'PASS'});
  }
  }
  report.status='PASS';
  report.phase='complete';
} catch(error) {
  report.status='FAIL';report.error=error.stack;
  if(active) {
    report.browserLog=active.stderr();
    report.recentRequests=requests.slice(-15);
    try{report.pageDiagnostic=await evaluate(`({ready:window.webReady,failure:window.webFailure,state:document.readyState,controller:navigator.serviceWorker.controller?.scriptURL})`);}catch{}
    try{report.targets=(await active.cdp.send('Target.getTargets')).targetInfos;}catch{}
  }
  process.exitCode=1;
} finally {
  try {await stop();} catch(error) {
    report.status='FAIL';report.cleanupError=error.stack;process.exitCode=1;
  } finally {
    await new Promise(resolve=>server.close(resolve));
    report.completedUtc=new Date().toISOString();
    const json=JSON.stringify(report,null,2)+'\n';
    await writeFile(path.join(runRoot,'report.json'),json);
    await writeFile('.tools/compatibility-report.json',json);
  }
}
console.log(JSON.stringify({status:report.status,phase:report.phase,stages:report.stages.map(stage=>stage.name),error:report.error?.split('\n')[0],report:path.join(runRoot,'report.json')}));
