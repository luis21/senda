import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {connect} from './helpers/cdp.mjs';

const root=process.cwd();
const profile=path.resolve(process.argv[2] || '.profiles/protection-test');
assert.ok(profile.startsWith(path.join(root,'.profiles')+path.sep), 'Use a dedicated workspace test profile');
const prepareAllow=process.argv.includes('--allow-site');
const allow=prepareAllow||process.argv.includes('--expect-allowed');
const cosmetic=process.argv.includes('--cosmetic');
const customPrivacy=process.argv.includes('--custom-privacy');
const received=[];
const recover=process.argv.includes('--corrupt-index');
const unavailable=process.argv.includes('--unavailable');
if(recover) {
  assert.ok(profile.startsWith(path.join(root,'.profiles')+path.sep), 'Only a workspace test profile can be corrupted');
  const findIndex=async dir=>{
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()){const found=await findIndex(file);if(found)return found;}
      else if(entry.name==='Ruleset Data')return file;
    }
  };
  const index=await findIndex(path.join(profile,'Senda Filter Rules'));
  assert.ok(index,'Seed profile must contain a previously verified index');
  await writeFile(index,'Senda controlled corrupt index');
  console.log('Corrupted test index: '+index);
}
let port;
const server=http.createServer((req,res)=>{
  received.push({host:req.headers.host,path:req.url});
  if(req.url.startsWith('/page')) {
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(`<!doctype html><title>Senda protection test</title><script src="/good.js"></script><script src="http://tracker.senda.test:${port}/__utm.gif"></script><script src="http://ad.doubleclick.net:${port}/ad.js"></script><p id="legitimate">Controlled page</p><div id="adbanner1" style="display:block!important">Ad placeholder</div><div class="ad-banner-box">Class placeholder</div><div id="dynamic">Dynamic placeholder</div><div id="ad-carousel">Domain exception</div><div id="domain-only" data-adbridg-ad-class>Domain selector</div>`);
  } else if(req.url==='/empty') {
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end('<!doctype html><title>Senda protection test</title><p>Ad-free controlled page</p>');
  } else if(req.url==='/worker.js') {
    res.writeHead(200,{'Content-Type':'text/javascript'});
    res.end(`fetch('http://tracker.senda.test:${port}/__utm.gif?worker').then(()=>postMessage('allowed'),()=>postMessage('blocked'));`);
  } else {
    res.writeHead(200,{'Content-Type':'text/javascript','Access-Control-Allow-Origin':'*'});
    res.end(req.url==='/good.js'?'window.sendaGood=true':req.url==='/__utm.gif'?'window.sendaTracker=true':'window.sendaAd=true');
  }
});
const fixedPortArg=process.argv.find(arg=>arg.startsWith('--port='));
const requestedPort=fixedPortArg?Number(fixedPortArg.slice(7)):0;
assert.ok(Number.isInteger(requestedPort)&&requestedPort>=0&&requestedPort<=65535,'Invalid test server port');
await new Promise(resolve=>server.listen(requestedPort,'127.0.0.1',resolve));
port=server.address().port;
await mkdir(profile,{recursive:true});
await rm(path.join(profile,'DevToolsActivePort'),{force:true});
// These fixtures exercise the immutable bundled rules, not the updater.
let localState = {};
try { localState = JSON.parse(await readFile(path.join(profile,'Local State'),'utf8')); }
catch (error) { if(error.code !== 'ENOENT')throw error; }
localState.senda ??= {};
localState.senda.filter_updates ??= {};
localState.senda.filter_updates.automatic = false;
await writeFile(path.join(profile,'Local State'),JSON.stringify(localState));
if(unavailable) {
  await mkdir(path.join(profile,'Senda Filter Rules'),{recursive:true});
  await writeFile(path.join(profile,'Senda Filter Rules/Indexed Rules'),'Controlled test obstruction');
}
if(prepareAllow || customPrivacy) {
  await mkdir(path.join(profile,'Default'),{recursive:true});
  const preferences={profile:{}};
  if(prepareAllow)preferences.profile.content_settings={exceptions:{subresource_filter:{[`http://site.senda.test:${port},*`]:{setting:1}}}};
  if(customPrivacy) {
    preferences.profile.cookie_controls_mode=0;
    preferences.search={suggest_enabled:true};
  }
  await writeFile(path.join(profile,'Default/Preferences'),JSON.stringify(preferences));
}
const browserOption=process.argv.find(arg=>arg.startsWith('--browser-exe='));
const browserPath=browserOption?path.resolve(browserOption.slice('--browser-exe='.length)):
  path.join(root,'.chromium/src/out/SendaDev',process.argv.includes('--senda-exe')?'senda.exe':'chrome.exe');
const browser=spawn(browserPath,[
  ...(browserOption?['--enable-logging',`--log-file=${path.join(profile,'installed-browser.log')}`]:[]),
  ...(process.argv.includes('--headed')?[]:['--headless']),`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--no-proxy-server',
  '--host-resolver-rules=MAP *.senda.test 127.0.0.1, MAP ad.doubleclick.net 127.0.0.1, MAP dez.ro 127.0.0.1, MAP sub.dez.ro 127.0.0.1, MAP anagram-solver.io 127.0.0.1', `http://site.senda.test:${port}/page`,
],{windowsHide:!process.argv.includes('--headed'),stdio:'ignore'});
let cdp;
try {
  let active;
  const deadline=Date.now()+60000;
  while(Date.now()<deadline) {
    try {active=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');break;} catch {}
    if(browser.exitCode!==null)throw Error('Browser exited: '+browser.exitCode);
    await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(active,'Browser did not expose test endpoint');
  cdp=await connect(+active[0],active[1]);
  let target;
  const targetDeadline=Date.now()+20000;
  while(Date.now()<targetDeadline) {
    target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page');
    if(target)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(target,'Browser did not create the startup page');
  const session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await cdp.send('Page.enable',{},session);
  let observed;
  const loadedDeadline=Date.now()+(unavailable?45000:20000);
  while(Date.now()<loadedDeadline) {
    try {
      const result=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify({ready:document.readyState,url:location.href,title:document.title,good:!!window.sendaGood,ad:!!window.sendaAd,tracker:!!window.sendaTracker,protectionError:document.title.includes("proteccion no disponible")})',returnByValue:true},session);
      if(result.result.value)observed=JSON.parse(result.result.value);
    } catch(error) {
      if(!/context.*destroyed|Cannot find context/i.test(error.message))throw error;
    }
    if(observed?.ready==='complete'&&(observed.good || (unavailable&&observed.protectionError)))break;
    await new Promise(r=>setTimeout(r,100));
  }
  console.log(JSON.stringify({allow,observed,received}));
  if(process.argv.includes('--diagnose')) {
    const {histograms}=await cdp.send('Browser.getHistograms',{query:'SubresourceFilter'});
    console.log(JSON.stringify({histograms:histograms.filter(h=>/ActivationState|ActivationDecision|DisabledReason|Ruleset/.test(h.name))}));
  }
  if(unavailable) {
    assert.equal(observed?.protectionError,true,'Unavailable protection must show an explicit error');
    assert.equal(received.length,0,'No web request may escape before protection is ready');
    console.log('PASS: unavailable protection stops first navigation and displays an explicit error.');
  } else {
  assert.equal(observed?.good,true,'Legitimate resource must load');
  assert.equal(observed?.tracker,allow,'Tracker protection or site exception failed');
  assert.equal(observed?.ad,allow,'Ad protection or site exception failed');
  assert.equal(received.some(r=>r.host.startsWith('tracker.senda.test:')),allow,'Tracker reached test server unexpectedly');
  assert.equal(received.some(r=>r.host.startsWith('ad.doubleclick.net:')),allow,'Ad reached test server unexpectedly');
  console.log('PASS: '+(allow?'site exception restores legitimate, ad and tracker requests':'native default blocks ads/trackers and permits legitimate requests'));
  if(cosmetic) {
    await cdp.send('Runtime.evaluate',{expression:`document.querySelector('#dynamic').className='ad-banner-2';
      window.sendaClone=document.querySelector('#adbanner1').cloneNode(true); document.body.append(sendaClone);`,returnByValue:true},session);
    await new Promise(resolve=>setTimeout(resolve,200));
    const result=await cdp.send('Runtime.evaluate',{expression:`Object.fromEntries(['#legitimate','#adbanner1','.ad-banner-box','#dynamic'].map(s=>[s,getComputedStyle(document.querySelector(s)).display])).valueOf()`,returnByValue:true},session);
    const displays=result.result.value;
    console.log(JSON.stringify({cosmetic:displays}));
    assert.equal(displays['#legitimate'],'block','Legitimate content must remain visible');
    for(const selector of ['#adbanner1','.ad-banner-box','#dynamic'])assert.equal(displays[selector],allow?'block':'none',selector+' cosmetic filtering or exception failed');
    const clone=await cdp.send('Runtime.evaluate',{expression:'getComputedStyle(sendaClone).display',returnByValue:true},session);
    assert.equal(clone.result.value,allow?'block':'none','Cloned nodes must obey native cosmetic styles');
    const template=await cdp.send('Runtime.evaluate',{expression:`(() => {
      const template=document.createElement('template');
      template.innerHTML='<div id="AC_ad">Template advertisement</div>';
      document.body.append(template.content.cloneNode(true));
    })()`,returnByValue:true},session);
    assert.equal(template.exceptionDetails,undefined);
    await new Promise(resolve=>setTimeout(resolve,200));
    const adopted=await cdp.send('Runtime.evaluate',{expression:'getComputedStyle(document.getElementById("AC_ad")).display',returnByValue:true},session);
    assert.equal(adopted.result.value,allow?'block':'none','Elements adopted from an inert template must be filtered');
    console.log('PASS: native cosmetic filtering covers IDs, classes, mutations, clones, adopted templates and user !important styles.');
    for(const host of ['dez.ro','sub.dez.ro','anagram-solver.io']) {
      const created=await cdp.send('Target.createTarget',{url:`http://${host}:${port}/page`});
      const child=(await cdp.send('Target.attachToTarget',{targetId:created.targetId,flatten:true})).sessionId;
      let styles;
      const limit=Date.now()+15000;
      while(Date.now()<limit) {
        const r=await cdp.send('Runtime.evaluate',{expression:`document.readyState==='complete' && document.querySelector('#ad-carousel') ? ['ad-carousel','domain-only'].map(id=>getComputedStyle(document.getElementById(id)).display):null`,returnByValue:true},child);
        styles=r.result.value;
        if(styles)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!styles)console.log(await cdp.send('Runtime.evaluate',{expression:'({url:location.href,title:document.title})',returnByValue:true},child));
      assert.ok(styles,'Domain fixture did not load');
      console.log(JSON.stringify({host,styles}));
      assert.equal(styles[0],host.endsWith('dez.ro')?'block':'none','Cosmetic exception must apply to the domain and its children');
      assert.equal(styles[1],host==='anagram-solver.io'?'none':'block','Domain-only selector must not leak to other sites');
      await cdp.send('Target.closeTarget',{targetId:created.targetId});
    }
    console.log('PASS: domain-only selectors and inherited cosmetic exceptions are respected.');
  }
  }
  if(process.argv.includes('--cosmetic-activation')) {
    for(const hostAndPath of ['localhost', 'music.amazon.senda.test', 'sub.music.amazon.senda.test', 'www.google.senda.test', 'site.senda.test/path']) {
      const [host,extra]=hostAndPath.split('/');
      const created=await cdp.send('Target.createTarget',{url:`http://${host}:${port}/page${extra?'?case=://localhost/':''}`});
      const child=(await cdp.send('Target.attachToTarget',{targetId:created.targetId,flatten:true})).sessionId;
      let styles;
      const limit=Date.now()+15000;
      while(Date.now()<limit) {
        const r=await cdp.send('Runtime.evaluate',{expression:`document.readyState==='complete' && document.querySelector('#adbanner1') ? ['adbanner1','legitimate'].map(id=>getComputedStyle(document.getElementById(id)).display):null`,returnByValue:true},child);
        styles=r.result.value;
        if(styles)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      console.log(JSON.stringify({activationException:hostAndPath,styles}));
      assert.deepEqual(styles,['block','block'],'Cosmetic activation exceptions must preserve content');
      await cdp.send('Target.closeTarget',{targetId:created.targetId});
    }
    console.log('PASS: generic-hide exceptions cover localhost, host families, subdomains and URL fragments.');
  }
  if(process.argv.includes('--check-privacy')) {
    const settings=await cdp.send('Target.createTarget',{url:'chrome://settings/'});
    const settingsSession=(await cdp.send('Target.attachToTarget',{targetId:settings.targetId,flatten:true})).sessionId;
    let values;
    const prefsDeadline=Date.now()+20000;
    while(Date.now()<prefsDeadline) {
      const r=await cdp.send('Runtime.evaluate',{expression:'typeof chrome.settingsPrivate',returnByValue:true},settingsSession);
      if(r.result.value==='object')break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const expression=`Promise.all(
      ['profile.cookie_controls_mode','search.suggest_enabled','safebrowsing.enabled']
        .map(key => new Promise(resolve => {
          chrome.settingsPrivate.getPref(key, pref => resolve({key, value: pref?.value}));
        }))
    )`;
    const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},settingsSession);
    assert.equal(r.exceptionDetails,undefined,'Privacy preference read failed');
    values=Object.fromEntries(r.result.value.map(item=>[item.key,item.value]));
    console.log(JSON.stringify({privacy:values}));
    assert.equal(values['profile.cookie_controls_mode'],customPrivacy?0:1);
    assert.equal(values['search.suggest_enabled'],customPrivacy);
    assert.equal(values['safebrowsing.enabled'],true);
    console.log('PASS: '+(customPrivacy?'explicit privacy preferences respected':'privacy defaults configured')+', Safe Browsing retained.');
  }
  if(browserOption) {
    const modules=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',
      path.join(root,'tests/helpers/check-installed-runtime.ps1'),'-BrowserProcessId',String(browser.pid),
      '-InstallDirectory',path.dirname(browserPath)],{encoding:'utf8',windowsHide:true,timeout:30000});
    console.log(modules.trim());
  }
  if(process.argv.includes('--inspect-panel')) {
    console.log('READY: dedicated test browser available for native panel inspection.');
    await new Promise(resolve=>browser.once('exit',resolve));
    cdp.close(); cdp=null;
  }
} finally {
  if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.close();}
  else browser.kill();
  if(browser.exitCode===null)await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Test browser did not exit cleanly')),10000);
    browser.once('exit',()=>{clearTimeout(timer);resolve();});
  });
  await new Promise(resolve=>server.close(resolve));
}
