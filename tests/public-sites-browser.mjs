// Live-network smoke checks. Uses a new test profile; no logins or form submissions.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect} from './helpers/cdp.mjs';
const root=process.cwd();
const profile=path.resolve(process.argv[2]||`.profiles/compatibility-public-${Date.now()}`);
assert.ok(/^compatibility-[a-z0-9-]+$/i.test(path.relative(path.join(root,'.profiles'),profile)),'Require a new immediate child of .profiles/compatibility-*');
const installedProfile=process.argv.includes('--installed-profile');
const selected=process.argv.find(arg=>arg.startsWith('--case='))?.split('=')[1];
assert.ok(!selected||['mdn','wikipedia','github','public-webm'].includes(selected),'Unknown public-site case');
const manifest=JSON.parse(await readFile('config/chromium.json','utf8'));
const stamp=JSON.parse(await readFile('.chromium/src/out/SendaDev/.senda-build.json','utf8'));
assert.equal(stamp.status,'success');assert.equal(stamp.revision,manifest.revision);
for(const name of (await readFile('patches/series','utf8')).trim().split(/\r?\n/))assert.equal(stamp.patches[name].toLowerCase(),createHash('sha256').update(await readFile('patches/'+name)).digest('hex'));
let installed;
if(installedProfile){
 assert.ok(/^compatibility-cws-[a-z0-9-]+$/i.test(path.relative(path.join(root,'.profiles'),profile)),'Installed extensions require a closed store test profile');
 const oldPort=Number((await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n')[0]);
 const live=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:oldPort});const finish=value=>{socket.destroy();resolve(value)};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(true));});
 assert.equal(live,false,'Close the installed-extension test profile first');
 const secure=JSON.parse(await readFile(path.join(profile,'Default/Secure Preferences'),'utf8'));installed={};
 for(const id of ['ddkjiahejlhfcafbddmgiahcphecmpfh','eimadpbcbfnmbkopoojfekhnkhdbieeh']){
  const item=secure.extensions?.settings?.[id];assert.ok(item?.from_webstore&&item.location===1,'Require installed store extensions');assert.deepEqual(item.disable_reasons??[],[]);
  installed[id]={name:item.manifest.name,version:item.manifest.version};
 }
 await rm(path.join(profile,'DevToolsActivePort'),{force:true});
}else{await mkdir(path.dirname(profile),{recursive:true});await mkdir(profile);}
const output=installedProfile?path.join(profile,'public-check-'+Date.now()):profile;
if(installedProfile)await mkdir(output);
const headed=process.argv.includes('--headed');
const report={startedUtc:new Date().toISOString(),revision:manifest.revision,browserVersion:manifest.version,headed,installed,selectedCase:selected??null,status:'running',cases:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(action,label,ms=45000){const deadline=Date.now()+ms;do{try{const result=await action();if(result)return result;}catch(error){if(!/context.*(destroyed|found)|navigat/i.test(error.message))throw error;}await sleep(250);}while(Date.now()<deadline);throw Error('Timeout: '+label);}
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Public WebM playback test</title><video muted autoplay loop src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"></video>');});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const child=spawn(path.join(root,'.chromium/src/out/SendaDev/chrome.exe'),[...(headed?[]:['--headless']),`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-sync','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='',cdp,session;child.stderr.on('data',data=>stderr=(stderr+data).slice(-16000));
child.on('error',error=>{stderr+='\n'+error.message});
async function evaluate(expression){const value=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;}
async function navigate(url){const result=await cdp.send('Page.navigate',{url},session);assert.ok(!result.errorText,result.errorText);}
try{
 const endpoint=await until(async()=>{if(child.exitCode!==null)throw Error('Browser exited '+stderr.slice(-500));try{return (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return false}},'browser',60000);
 cdp=await connect(Number(endpoint[0]),endpoint[1]);
 const target=await until(async()=>(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url==='about:blank'),'test page');
 session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await cdp.send('Page.enable',{},session);await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},session);
 report.initialVisibility=await evaluate('document.visibilityState');
 await cdp.send('Page.bringToFront',{},session);
 report.testVisibility=await evaluate('document.visibilityState');
 report.browser=await cdp.send('Browser.getVersion');
 const cases=[
  {name:'mdn',url:'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',title:'Fetch API',heading:'Fetch API'},
  {name:'wikipedia',url:'https://en.wikipedia.org/wiki/Web_browser',title:'Web browser',heading:'Web browser'},
  {name:'github',url:'https://github.com/chromium/chromium',title:'chromium/chromium'},
 ];
 for(const specimen of cases.filter(specimen=>!selected||specimen.name===selected)){
  const result={name:specimen.name,url:specimen.url,status:'running'};
  try{
   await navigate(specimen.url);
   await until(()=>evaluate(`location.href.startsWith(${JSON.stringify(specimen.url)})&&document.title.includes(${JSON.stringify(specimen.title)})&&Boolean(document.querySelector('main'))`),specimen.name+' public content');
   if(installedProfile&&specimen.name==='wikipedia')await until(()=>evaluate(`getComputedStyle(document.body).backgroundColor!=='rgb(255, 255, 255)'&&[...document.querySelectorAll('style.darkreader--sync')].some(style=>{try{return style.sheet.cssRules.length>0}catch{return false}})`),'Dark Reader transformed styles on Wikipedia');
   const snapshot=await evaluate(`({title:document.title,url:location.href,headings:[...document.querySelectorAll('h1')].map(h=>h.textContent.trim()).slice(0,4),mainVisible:document.querySelector('main').getBoundingClientRect().height>0,styleSheets:document.styleSheets.length,responseStatus:performance.getEntriesByType('navigation')[0]?.responseStatus,images:[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length,fetchAvailable:typeof fetch==='function'})`);
   assert.ok(snapshot.mainVisible);assert.ok(snapshot.styleSheets>0);assert.ok(snapshot.fetchAvailable);
   if(specimen.heading)assert.ok(snapshot.headings.some(h=>h.includes(specimen.heading)));
   assert.equal(snapshot.responseStatus,200);
   snapshot.darkReaderMode=await evaluate("document.documentElement.getAttribute('data-darkreader-mode')");
   if(installedProfile)snapshot.theme=await evaluate(`({background:getComputedStyle(document.body).backgroundColor,foreground:getComputedStyle(document.body).color,convertedStyleSheets:[...document.querySelectorAll('style.darkreader--sync')].filter(style=>{try{return style.sheet.cssRules.length>0}catch{return false}}).length})`);
   result.observed=snapshot;
   const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'},session);await writeFile(path.join(output,specimen.name+'.png'),Buffer.from(screenshot.data,'base64'));
   if(specimen.name==='wikipedia'){
    const link=await evaluate(`[...document.querySelectorAll('main a[href]')].find(a=>a.textContent.trim()==='Google Chrome')?.href`);
    assert.ok(link&&new URL(link).origin==='https://en.wikipedia.org','Expected public internal browser article link');
    await navigate(link);await until(()=>evaluate(`document.querySelector('h1')?.textContent.includes('Google Chrome')`),'Wikipedia internal navigation');
    result.internalNavigation=await evaluate('({url:location.href,title:document.title})');
   }
   result.status='PASS';
  }catch(error){
   result.status='FAIL';result.error=error.message;
   try{result.diagnostic=await evaluate(`({url:location.href,title:document.title,visibility:document.visibilityState,mode:document.documentElement.getAttribute('data-darkreader-mode'),background:getComputedStyle(document.body).backgroundColor})`);}catch{}
  }
  report.cases.push(result);console.log(result.status+': '+specimen.name);
 }
 if(!selected||selected==='public-webm') {
 const media={name:'public-webm',status:'running'};
 try{
  await navigate(`http://127.0.0.1:${server.address().port}/video`);
  await until(()=>evaluate(`Boolean(document.querySelector('video')?.readyState>=2)`),'WebM media');
  media.before=await evaluate(`({time:document.querySelector('video').currentTime,width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight,frames:document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames,error:document.querySelector('video').error?.code??null})`);
  await until(()=>evaluate(`document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames>${media.before.frames}`),'decoded WebM frames',15000);
  media.after=await evaluate(`({time:document.querySelector('video').currentTime,frames:document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames,error:document.querySelector('video').error?.code??null})`);
  assert.ok(media.before.width>0&&media.before.height>0);assert.equal(media.after.error,null);media.status='PASS';
 }catch(error){media.status='FAIL';media.error=error.message;}
 report.cases.push(media);console.log(media.status+': '+media.name);
 }
 report.status=report.cases.every(result=>result.status==='PASS')?'PASS':'FAIL';
}catch(error){report.status='FAIL';report.error=error.stack;}
finally{
 try{if(cdp){try{await cdp.send('Browser.close')}catch{}cdp.close()}else child.kill();await until(()=>child.exitCode!==null||child.signalCode!==null,'browser exit',15000);}
 catch(error){child.kill();report.status='FAIL';report.cleanupError=error.message;}
 await new Promise(resolve=>server.close(resolve));report.completedUtc=new Date().toISOString();
 await writeFile(path.join(output,'browser.log'),stderr);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,report:path.join(output,'report.json')}));
if(report.status!=='PASS')process.exitCode=1;
