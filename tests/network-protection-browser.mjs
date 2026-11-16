import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {connect} from './helpers/cdp.mjs';

const root=process.cwd();
const profile=path.resolve(process.argv[2] || '.profiles/protection-test');
assert.ok(profile.startsWith(path.join(root,'.profiles')+path.sep), 'Use a dedicated workspace test profile');
const allow=process.argv.includes('--allow-site');
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
  const index=await findIndex(path.join(profile,'Subresource Filter'));
  assert.ok(index,'Seed profile must contain a previously verified index');
  await writeFile(index,'Senda controlled corrupt index');
  console.log('Corrupted test index: '+index);
}
let port;
const server=http.createServer((req,res)=>{
  received.push({host:req.headers.host,path:req.url});
  if(req.url==='/page') {
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(`<!doctype html><title>Senda protection test</title><script src="/good.js"></script><script src="http://tracker.senda.test:${port}/__utm.gif"></script><script src="http://ad.doubleclick.net:${port}/ad.js"></script><p>Controlled page</p>`);
  } else {
    res.writeHead(200,{'Content-Type':'text/javascript'});
    res.end(req.url==='/good.js'?'window.sendaGood=true':req.url==='/__utm.gif'?'window.sendaTracker=true':'window.sendaAd=true');
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
port=server.address().port;
await mkdir(profile,{recursive:true});
await rm(path.join(profile,'DevToolsActivePort'),{force:true});
if(unavailable) {
  await mkdir(path.join(profile,'Subresource Filter'),{recursive:true});
  await writeFile(path.join(profile,'Subresource Filter/Indexed Rules'),'Controlled test obstruction');
}
if(allow || customPrivacy) {
  await mkdir(path.join(profile,'Default'),{recursive:true});
  const preferences={profile:{}};
  if(allow)preferences.profile.content_settings={exceptions:{subresource_filter:{[`http://site.senda.test:${port},*`]:{setting:1}}}};
  if(customPrivacy) {
    preferences.profile.cookie_controls_mode=0;
    preferences.search={suggest_enabled:true};
  }
  await writeFile(path.join(profile,'Default/Preferences'),JSON.stringify(preferences));
}
const browser=spawn(path.join(root,'.chromium/src/out/SendaDev/chrome.exe'),[
  ...(process.argv.includes('--headed')?[]:['--headless']),`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--no-proxy-server',
  '--host-resolver-rules=MAP *.senda.test 127.0.0.1, MAP ad.doubleclick.net 127.0.0.1', `http://site.senda.test:${port}/page`,
],{windowsHide:true,stdio:'ignore'});
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
      const result=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify({ready:document.readyState,good:!!window.sendaGood,ad:!!window.sendaAd,tracker:!!window.sendaTracker,protectionError:document.title.includes("proteccion no disponible")})',returnByValue:true},session);
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
} finally {
  if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.close();}
  else browser.kill();
  if(browser.exitCode===null)await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Test browser did not exit cleanly')),10000);
    browser.once('exit',()=>{clearTimeout(timer);resolve();});
  });
  await new Promise(resolve=>server.close(resolve));
}
