import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {connect} from './helpers/cdp.mjs';
const profile=resolve(process.argv[2]||'');
assert.ok(relative(resolve('.profiles'),profile).startsWith('speed-dial-'),'Use an isolated speed-dial profile');
const [port,endpoint]=(await readFile(profile+'/DevToolsActivePort','utf8')).trim().split('\n');
const cdp=await connect(+port,endpoint);
let session;
let requests=0;
const server=createServer((_,res)=>{requests++;res.end('test-only');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
async function run(expression) {
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression) {
  const end=Date.now()+15000;
  do {if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}while(Date.now()<end);
  throw Error('Timeout: '+expression);
}
async function shot(name,width,height) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},session);
  await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await until(`Array.from(document.images).filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0}).every(i=>i.complete&&i.naturalWidth>0)`);
  await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  const image=await cdp.send('Page.captureScreenshot',{format:'png'},session);
  await writeFile(`docs/validation/senda-${name}.png`,Buffer.from(image.data,'base64'));
}
async function reload() {await cdp.send('Page.reload',{},session);await until(`Boolean(document.documentElement.dataset.theme)`);}
async function customize() {
  await until(`!document.querySelector('#customize').disabled`);
  await run(`document.querySelector('#customize').click()`);
  await until(`document.querySelector('#settings-dialog').open`);
}
async function save() {
  await run(`document.querySelector('#settings-form').requestSubmit()`);
  await until(`!document.querySelector('#settings-dialog').open`);
}
try {
  const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith('chrome://new-tab-page'));
  assert.ok(target);
  session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await until(`Boolean(document.documentElement.dataset.theme)`);
  if(process.argv.includes('--restart')) {
    assert.equal(await run(`document.querySelector('#welcome').hidden`),true);
    assert.equal(await run(`document.querySelectorAll('.site').length`),32);
    assert.equal(await run(`document.documentElement.dataset.background`),'folds');
    console.log('PASS: welcome hidden, 32 sites and background preserved after browser restart.');
  } else {
    assert.equal(await run(`document.querySelector('#welcome').hidden`),false);
    assert.equal(await run(`document.querySelector('#home').hidden`),true);
    assert.equal(await run(`document.querySelector('#welcome-hide').checked`),true);
    await shot('welcome-desktop',1440,1000);
    await shot('welcome-narrow',390,844);
    await run(`document.querySelector('#start-browsing').click()`);
    assert.equal(await run(`document.activeElement.id`),'search');
    await reload();
    assert.equal(await run(`document.querySelector('#welcome').hidden`),true);
    await run(`document.querySelector('#open-welcome').click()`);
    assert.equal(await run(`document.querySelector('#welcome-kicker').textContent`),'Novedades de Senda');
    assert.equal(await run(`document.activeElement.id`),'welcome-heading');
    await run(`document.querySelector('#start-browsing').click()`);
    await run(`localStorage.setItem('senda.home.v1',JSON.stringify({...JSON.parse(localStorage.getItem('senda.home.v1')),welcomeSeen:false,hideWelcome:false}))`);
    await reload();
    await customize();
    await run(`document.querySelector('#hide-welcome').checked=true`);
    await save();
    assert.equal(await run(`document.querySelector('#welcome').hidden`),true,'settings toggle must hide even on first visit');
    await reload();
    assert.equal(await run(`document.querySelector('#welcome').hidden`),true);
    await customize();
    await run(`document.querySelector('#hide-welcome').checked=false`);
    await save();
    assert.equal(await run(`document.querySelector('#welcome').hidden`),false);
    await reload();
    assert.equal(await run(`document.querySelector('#welcome').hidden`),false);
    await run(`document.querySelector('#welcome-hide').checked=true;document.querySelector('#start-browsing').click()`);
    await reload();
    assert.equal(await run(`document.querySelector('#welcome').hidden`),true);
    const names=['Wikipedia','GitHub','YouTube','DuckDuckGo','Correo','Calendario','Música','Lecturas'];
    const fixtures=Array.from({length:32},(_,i)=>({title:names[i%names.length]+(i>=8?' '+(i+1):''),url:`http://127.0.0.1:${server.address().port}/${i}`}));
    await run(`localStorage.setItem('senda.home.v1',JSON.stringify({...JSON.parse(localStorage.getItem('senda.home.v1')),links:${JSON.stringify(fixtures)},theme:'light',background:'folds'}))`);
    await reload();
    await customize();
    await run(`document.querySelector('#theme').value='light'`); await save();
    await until(`document.documentElement.dataset.theme==='light'&&getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()==='#fff'`);
    assert.equal(await run(`document.querySelectorAll('.site').length`),32);
    assert.equal(await run(`document.querySelectorAll('#links > #add-link').length`),1);
    await until(`document.querySelectorAll('.monogram[data-favicon]').length>0`);
    assert.equal(await run(`Array.from(document.querySelectorAll('.monogram img')).every(i=>{const u=new URL(i.src);return u.protocol==='chrome:'&&u.hostname==='favicon2'&&u.searchParams.get('allowGoogleServerFallback')==='0'})`),true);
    await shot('speed-dial-desktop',1440,1000);
    assert.equal(await run(`document.querySelector('.monogram-letter').textContent`),'W');
    assert.equal(await run(`document.documentElement.dataset.theme`),'light','native initialization must not overwrite selected light theme');
    assert.equal(await run(`getComputedStyle(document.querySelector('#links')).gridTemplateColumns.split(' ').length`),6);
    assert.ok(await run(`document.querySelector('.monogram').getBoundingClientRect().width>=140`));
    await shot('speed-dial-narrow',390,844);
    assert.equal(await run(`getComputedStyle(document.querySelector('#links')).gridTemplateColumns.split(' ').length`),2);
    await customize(); await run(`document.querySelector('#theme').value='dark'`); await save();
    await until(`document.documentElement.dataset.theme==='dark'`);
    await shot('speed-dial-dark',1440,1000);
    assert.equal(await run(`document.documentElement.dataset.theme`),'dark');
    await customize(); await run(`document.querySelector('#theme').value='light'`); await save();
    assert.equal(requests,0,'home and icons must not fetch favorite sites');
    console.log(JSON.stringify({firstVisit:'PASS',hideAndRestart:'PASS',manualNews:'PASS',toggle:'PASS',keyboard:'PASS',tiles:32,localFavicons:'PASS',remoteSiteRequests:requests,responsive:'PASS',themes:'PASS'}));
  }
} finally {await cdp.send('Browser.close').catch(()=>{});cdp.close();server.close();}
