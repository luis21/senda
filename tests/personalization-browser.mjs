import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
import {connect} from './helpers/cdp.mjs';
const profile=resolve(process.argv[2] || '');
assert.ok(relative(resolve('.profiles'),profile).startsWith('personalization-'),'Use an isolated personalization profile');
const [port,endpoint]=(await readFile(profile+'/DevToolsActivePort','utf8')).trim().split('\n');
const cdp=await connect(+port,endpoint);
let session;
async function run(expression) {
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression) {
  const end=Date.now()+15000;
  do { if(await run(expression))return; await new Promise(r=>setTimeout(r,150)); } while(Date.now()<end);
  throw Error('Timeout: '+expression);
}
async function open() {
  await until(`!document.querySelector('#customize').disabled`);
  await run(`document.querySelector('#customize').click()`);
  await until(`document.querySelector('#settings-dialog').open`);
}
async function choose(values) {
  await run(`for(const [id,value] of Object.entries(${JSON.stringify(values)})) {
    const e=document.getElementById(id); if(e.type==='checkbox')e.checked=value;else e.value=value;
    e.dispatchEvent(new Event('input',{bubbles:true}));
  }`);
}
try {
  const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.startsWith('chrome://new-tab-page'));
  assert.ok(target);
  session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await until(`Boolean(document.querySelector('#palette'))`);
  await run(`if(!document.querySelector('#welcome').hidden)document.querySelector('#start-browsing').click()`);
  await run(`(async()=>{window.appearanceHandler=(await import('./senda_appearance.js')).getAppearanceHandler();return true})()`);
  const get=()=>run(`import('./senda_appearance.js').then(m=>m.getAppearanceHandler().getSendaAppearance())`);
  if(process.argv.includes('--device')) {
    assert.equal((await get()).palette,-1,'device colors must not report a stale palette');
    await open();
    await choose({palette:'clay'});
    await run(`document.querySelector('#settings-form').requestSubmit()`);
    await until(`!document.querySelector('#settings-dialog').open`);
    assert.deepEqual(await get(),{scheme:1,palette:2,editable:true});
    console.log('PASS: choosing the previous palette overrides device colors explicitly.');
  } else if(process.argv.includes('--restart')) {
    assert.deepEqual(await get(),{scheme:1,palette:2,editable:true});
    await until(`document.documentElement.dataset.palette==='clay'`);
    assert.equal(await run('document.documentElement.dataset.background'),'plain');
    console.log('PASS: native appearance and home preferences survived browser restart.');
    process.exitCode=0;
  } else {
  for(const [paletteIndex,palette] of ['blue','forest','clay','violet','slate'].entries()) {
    await open(); await choose({theme:'system',palette});
    await run(`document.querySelector('#settings-form').requestSubmit()`);
    await until(`!document.querySelector('#settings-dialog').open`);
    assert.deepEqual(await get(),{scheme:0,palette:paletteIndex,editable:true});
  }
  const original=await get();
  for(const [scheme,palette] of [[-1,0],[3,0],[0,-2],[0,5]]) {
    assert.equal((await run(`appearanceHandler.setSendaAppearance(${scheme},${palette})`)).accepted,false);
    assert.deepEqual(await get(),original,'invalid Mojo input must not change native theme');
  }
  await open();
  const originalPalette=await run('document.documentElement.dataset.palette');
  await choose({theme:'dark',palette:'forest',background:'lines',layout:'compact','show-links':false});
  assert.equal(await run('document.documentElement.dataset.palette'),'forest');
  assert.deepEqual(await get(),original,'preview must not change native theme');
  await run(`document.querySelector('#settings-dialog [data-close]').click()`);
  await until(`document.documentElement.dataset.palette===${JSON.stringify(originalPalette)}`);
  assert.equal(await run('document.documentElement.dataset.palette'),originalPalette);
  await open();
  await choose({palette:'violet'});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},session);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},session);
  await until(`!document.querySelector('#settings-dialog').open`);
  await until(`document.documentElement.dataset.palette===${JSON.stringify(originalPalette)}`);
  assert.equal(await run('document.documentElement.dataset.palette'),originalPalette);
  await open();
  await choose({theme:'dark',palette:'forest',background:'lines',layout:'compact','show-links':false});
  await run(`document.querySelector('#settings-form').requestSubmit()`);
  await until(`!document.querySelector('#settings-dialog').open`);
  assert.deepEqual(await get(),{scheme:2,palette:1,editable:true});
  assert.equal(await run(`document.querySelector('#sites').hidden`),true);
  const darkShot=await cdp.send('Page.captureScreenshot',{format:'png'},session);
  await writeFile('docs/validation/senda-personalization-dark.png',Buffer.from(darkShot.data,'base64'));
  await cdp.send('Page.reload',{},session);
  await until(`document.documentElement.dataset.palette==='forest'`);
  assert.equal(await run(`document.documentElement.dataset.layout`),'compact');
  assert.equal(await run(`document.querySelector('#sites').hidden`),true);
  await open();
  await choose({theme:'light',palette:'clay',background:'mist',layout:'comfortable','show-links':true});
  await run(`document.querySelector('#settings-form').requestSubmit()`);
  await until(`!document.querySelector('#settings-dialog').open`);
  assert.deepEqual(await get(),{scheme:1,palette:2,editable:true});
  const second=(await cdp.send('Target.createTarget',{url:'chrome://new-tab-page/'})).targetId;
  // First tab receives changes from a second tab through profile storage.
  const secondSession=(await cdp.send('Target.attachToTarget',{targetId:second,flatten:true})).sessionId;
  await run(`localStorage.setItem('senda.home.v1',JSON.stringify({...JSON.parse(localStorage.getItem('senda.home.v1')),links:['a','b','c'].map(x=>({title:x,url:'https://'+x+'.example/'}))}));location.reload()`);
  await until(`document.querySelectorAll('.edit').length===3`);
  await run(`document.querySelectorAll('.edit')[1].click()`);
  await cdp.send('Runtime.evaluate',{expression:`localStorage.setItem('senda.home.v1',JSON.stringify({...JSON.parse(localStorage.getItem('senda.home.v1')),links:[{title:'b',url:'https://b.example/'},{title:'c',url:'https://c.example/'}]}))`},secondSession);
  await until(`document.querySelectorAll('.edit').length===2`);
  await run(`document.querySelector('#link-title').value='b editado';document.querySelector('#link-form').requestSubmit()`);
  assert.deepEqual(await run(`Array.from(document.querySelectorAll('.site-name'),e=>e.textContent)`),['b editado','c']);
  await run(`document.querySelectorAll('.edit')[1].click()`);
  await cdp.send('Runtime.evaluate',{expression:`localStorage.setItem('senda.home.v1',JSON.stringify({...JSON.parse(localStorage.getItem('senda.home.v1')),links:[{title:'b editado',url:'https://b.example/'}]}))`},secondSession);
  await until(`!document.querySelector('#link-dialog').open`);
  assert.deepEqual(await run(`Array.from(document.querySelectorAll('.site-name'),e=>e.textContent)`),['b editado']);
  await cdp.send('Runtime.evaluate',{expression:`localStorage.setItem('senda.home.v1',JSON.stringify({...JSON.parse(localStorage.getItem('senda.home.v1')),background:'plain'}))`},secondSession);
  await until(`document.documentElement.dataset.background==='plain'`);
  await cdp.send('Target.closeTarget',{targetId:second});
  await open();
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},session);
  for(const [name,width,height] of [['desktop',1280,900],['narrow',390,844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},session);
    assert.equal(await run(`document.querySelector('#settings-dialog').scrollWidth<=document.querySelector('#settings-dialog').clientWidth`),true);
    if(width===390) assert.equal(await run(`Math.round(document.querySelector('#settings-dialog').getBoundingClientRect().width)`),390);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'},session);
    await writeFile(`docs/validation/senda-personalization-${name}.png`,Buffer.from(shot.data,'base64'));
  }
  console.log(JSON.stringify({preview:'PASS',cancel:'PASS',escape:'PASS',invalidNativeInput:'PASS',nativeTheme:'PASS',reload:'PASS',crossTab:'PASS',concurrentLinkEditor:'PASS',responsive:'PASS',finalAppearance:await get()}));
  }
} finally {await cdp.send('Browser.close').catch(()=>{});cdp.close();}
