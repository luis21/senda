import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {connect} from './helpers/cdp.mjs';
const profile = process.argv[2] || '.profiles/home-preview';
const url = process.argv[3];
const artifact = process.argv[4] === 'native' ? 'senda-home-native' : 'senda-home';
const [port,endpoint]=(await readFile(profile+'/DevToolsActivePort','utf8')).trim().split('\n');
const cdp=await connect(+port,endpoint);
let session;
async function evaluate(expression) {
  let r;
  try { r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session); }
  catch(error) { throw Error(error.message+' while evaluating '+expression.slice(0,160)); }
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function screenshot(file,width,height) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},session);
  const r=await cdp.send('Page.captureScreenshot',{format:'png'},session);
  await writeFile(file,Buffer.from(r.data,'base64'));
}
async function waitForHome() {
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) {
    try { if(await evaluate('Boolean(document.querySelector("#heading") && document.documentElement.dataset.theme)')) return; }
    catch(error) { if(!/context|navigat/i.test(error.message)) throw error; }
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Home page did not initialize');
}
try {
  let target;
  const readyDeadline=Date.now()+20000;
  while(Date.now()<readyDeadline) {
    target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&(!url||t.url.startsWith(url)));
    if(target)break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(target,'Expected a matching test page');
  session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await cdp.send('Page.enable',{},session);
  await waitForHome();
  assert.equal(await evaluate('document.querySelector("#heading").textContent'),'¿A dónde vamos?');
  await evaluate('localStorage.clear()');
  await cdp.send('Page.reload',{},session);
  await waitForHome();
  await evaluate('document.querySelector("#customize").click();document.querySelector("#theme").value="light";document.querySelector("#settings-form").requestSubmit()');
  await screenshot(`docs/validation/${artifact}-light.png`,1440,1000);
  await evaluate('document.querySelector("#add-link").click();document.querySelector("#link-title").value="Ejemplo";document.querySelector("#link-url").value="javascript:alert(1)";document.querySelector("#link-form").requestSubmit()');
  assert.equal(await evaluate('document.querySelector("#link-dialog").open'),true);
  assert.match(await evaluate('document.querySelector("#link-error").textContent'),/HTTP/);
  await evaluate('document.querySelector("#link-url").value="https://example.com";document.querySelector("#link-form").requestSubmit()');
  assert.equal(await evaluate('document.querySelectorAll(".site").length'),1);
  await cdp.send('Page.reload',{},session);
  await waitForHome();
  assert.equal(await evaluate('document.querySelector(".site a").href'),'https://example.com/');
  await evaluate('document.querySelector(".edit").click();document.querySelector("#link-title").value="Ejemplo editado";document.querySelector("#link-form").requestSubmit()');
  assert.equal(await evaluate('document.querySelector(".site-name").textContent'),'Ejemplo editado');
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Editar Ejemplo editado');
  console.log('PASS: native edit restores keyboard focus.');
  await evaluate('document.querySelector(".edit").click();document.querySelector("#remove-link").click()');
  assert.equal(await evaluate('document.querySelectorAll(".site").length'),0);
  assert.equal(await evaluate('document.activeElement.id'),'add-link');
  await evaluate('for(let i=1;i<=12;i++){document.querySelector("#add-link").click();document.querySelector("#link-title").value="Sitio "+i;document.querySelector("#link-url").value="https://example.com/"+i;document.querySelector("#link-form").requestSubmit()}');
  assert.equal(await evaluate('document.querySelector("#add-link").disabled'),true);
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Editar Sitio 12');
  console.log('PASS: twelve shortcuts retain keyboard focus.');
  await evaluate('for(let i=0;i<12;i++){document.querySelector(".edit").click();document.querySelector("#remove-link").click()}');
  await evaluate('document.querySelector("#customize").click();document.querySelector("#theme").value="dark";document.querySelector("#settings-form").requestSubmit()');
  await screenshot(`docs/validation/${artifact}-dark.png`,1440,1000);
  await screenshot(`docs/validation/${artifact}-mobile.png`,390,844);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  console.log('PASS: themes, screenshots and responsive layout.');
  await evaluate('document.querySelector("#search").value="senda & privacidad";setTimeout(()=>document.querySelector("#search-form").requestSubmit(),0);true');
  const deadline=Date.now()+10000;
  let searched;
  while(Date.now()<deadline) {
    searched=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.targetId===target.targetId)?.url;
    if(searched?.startsWith('https://duckduckgo.com/'))break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(new URL(searched).searchParams.get('q'),'senda & privacidad');
  console.log('PASS: add/edit/delete shortcuts, URL validation, persistence, themes, responsive layout and encoded search.');
} finally {
  try {await cdp.send('Browser.close');} catch {}
  cdp.close();
}
