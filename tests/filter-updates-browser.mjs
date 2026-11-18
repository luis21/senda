// Runs against the real fixed HTTPS sources; only the initial cache is synthetic.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {connect} from './helpers/cdp.mjs';

const root = process.cwd();
const profile = path.join(root, '.profiles', `compatibility-filter-updates-${Date.now()}`);
const output = path.join(root, '.chromium/src/out/SendaDev');
const bundle = JSON.parse(await readFile('assets/filters/manifest.json', 'utf8'));
const token = `sendaold${Date.now()}`;
const blockedHost = `${token}.senda.test`;
const report = {profile, started: new Date().toISOString(), checks: []};
const check = (name, value) => { assert.ok(value, name); report.checks.push(name); console.log(`PASS: ${name}`); };
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const pointerFile = path.join(profile, 'SendaFilterLists/active.json');
const pointer = () => json(pointerFile);
const until = async (read, predicate, timeout = 30000) => {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    if (browser && browser.exitCode !== null && browser.exitCode !== 0) {
      throw Error(`Browser exited unexpectedly (${browser.exitCode}); see ${path.join(profile, 'browser.log')}`);
    }
    try { value = await read(); if (predicate(value)) return value; } catch (e) { value = e.message; }
    await delay(400);
  }
  throw Error(`Timed out: ${JSON.stringify(value)}`);
};
const run = (exe, args) => new Promise((resolve, reject) => {
  const child = spawn(exe, args, {windowsHide: true});
  let text = '';
  child.stdout.on('data', chunk => text += chunk);
  child.stderr.on('data', chunk => text += chunk);
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve(text) : reject(Error(text)));
});
await mkdir(profile, {recursive: true});
for (const [i, name] of ['easylist', 'easyprivacy'].entries()) {
  const title = i ? 'EasyPrivacy' : 'EasyList';
  const rules = Array.from({length: 600}, (_, n) => `||fixture${i}-${n}.senda.test^`);
  if (!i) rules.push(`||${blockedHost}^`, `site.senda.test##.${token}`);
  await writeFile(path.join(profile, `${name}.txt`), `[Adblock Plus 2.0]\n! Title: ${title}\n! Version: ${bundle.sources[i].version}\n${rules.join('\n')}\n`);
}
const seedOutput = await run(path.join(output, 'senda_filter_updates_unittests.exe'), [
  '--gtest_filter=SendaOfficialSourcesTest.*',
  `--senda-easylist=${path.join(profile, 'easylist.txt')}`,
  `--senda-easyprivacy=${path.join(profile, 'easyprivacy.txt')}`,
  `--senda-license=${path.join(root, 'assets/filters/LICENSE')}`,
  `--senda-seed-profile=${profile}`,
]);
await writeFile(path.join(profile, 'seed.log'), seedOutput);
const seeded = (await pointer()).active;
if (process.argv.includes('--seed-only')) {
  console.log(`Seeded test cache: ${profile} (${seeded})`);
  process.exit(0);
}
const stamp = await json(path.join(output, '.senda-build.json'));
assert.equal(stamp.status, 'success', 'Complete the browser build before integration testing');
assert.equal(stamp.revision, (await json(path.join(root, 'config/chromium.json'))).revision);
for (const patch of (await readFile('patches/series', 'utf8')).trim().split(/\r?\n/)) {
  assert.equal(stamp.patches[patch]?.toLowerCase(), createHash('sha256').update(await readFile(path.join(root, 'patches', patch))).digest('hex'));
}
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/page')) {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Senda updater test</title><p id="content">Visible content</p><div id="fixture" class="${token}">Old generation cosmetic rule</div>`);
  } else { res.end('fixture'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const url = `http://site.senda.test:${port}/page`;
let browser, cdp, monitor;
const stopMonitor = async () => {
  if (!monitor) return;
  await writeFile(path.join(profile, 'stop-worker-measurement'), 'done');
  const code = await new Promise(resolve => monitor.exitCode === null ? monitor.once('exit', resolve) : resolve(monitor.exitCode));
  monitor = null;
  assert.equal(code, 0, 'Worker measurement must finish successfully');
  report.workerMeasurement = JSON.parse((await readFile(path.join(profile, 'worker-measurement.json'), 'utf8')).replace(/^\uFEFF/, ''));
};
const close = async () => {
  if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.close(); cdp = null; }
  else if (browser && browser.exitCode === null) { browser.kill(); }
  if (browser && browser.exitCode === null) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Browser did not close')), 15000);
      browser.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
};
const launch = async (offline = false) => {
  await rm(path.join(profile, 'DevToolsActivePort'), {force: true});
  browser = spawn(path.join(output, 'chrome.exe'), [
    '--headless', `--user-data-dir=${profile}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
    '--enable-logging', `--log-file=${path.join(profile, 'browser.log')}`,
    `--host-resolver-rules=MAP *.senda.test 127.0.0.1, MAP ad.doubleclick.net 127.0.0.1${offline ? ', MAP easylist.to ~NOTFOUND' : ''}`, url,
  ], {windowsHide: true, stdio: 'ignore'});
  browser.once('exit', (code, signal) => {
    (report.browserExits ??= []).push({code, signal, time: new Date().toISOString()});
  });
  const active = await until(() => readFile(path.join(profile, 'DevToolsActivePort'), 'utf8'), Boolean, 60000);
  const [debugPort, endpoint] = active.trim().split('\n');
  cdp = await connect(+debugPort, endpoint);
  const target = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'page'), Boolean);
  return attach(target.targetId);
};
const attach = async targetId => (await cdp.send('Target.attachToTarget', {targetId, flatten: true})).sessionId;
const evaluate = async (session, expression) => {
  const result = await cdp.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}, session);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const styles = session => evaluate(session, `document.readyState==='complete' && document.getElementById('fixture') ? [getComputedStyle(document.getElementById('fixture')).display,getComputedStyle(document.getElementById('content')).display] : null`);
const fetchBlocked = session => evaluate(session, `fetch('http://${blockedHost}:${port}/probe?'+Math.random()).then(()=>false,()=>true)`);
const newPage = async () => {
  const target = await cdp.send('Target.createTarget', {url});
  const session = await attach(target.targetId);
  await until(() => styles(session), Boolean);
  return session;
};
const automaticOff = async () => {
  const file = path.join(profile, 'Local State');
  const state = await json(file);
  state.senda.filter_updates.automatic = false;
  await writeFile(file, JSON.stringify(state));
};
async function normalScenario() {
  const oldPage = await launch();
  monitor = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'tests/helpers/measure-filter-worker.ps1'), '-BrowserProcessId', String(browser.pid), '-Profile', profile],
  {windowsHide: true, stdio: 'ignore'});
  // Assert the very first document: reloading would hide a recovery/readiness race.
  await until(() => styles(oldPage), value => value?.[0] === 'none');
  check('Seed generation blocks network and hides its CSS', await fetchBlocked(oldPage));
  const began = Date.now();
  const updated = await until(pointer, value => value.active !== seeded, 240000);
  report.activationMilliseconds = Date.now() - began;
  report.active = updated;
  check('Real official update committed a different generation', /^[a-f0-9]{64}$/.test(updated.active));
  const activeDirectory = path.join(profile, 'SendaFilterLists', updated.active);
  report.manifest = await json(path.join(activeDirectory, 'manifest.json'));
  check('Active generation keeps previous cache', updated.previous === seeded);
  check('Existing document keeps its cosmetic generation', (await styles(oldPage))[0] === 'none');
  check('Existing document keeps its network generation', await fetchBlocked(oldPage));
  const fresh = await newPage();
  check('New navigation uses updated cosmetics and preserves content', (await styles(fresh)).every(x => x === 'block'));
  check('New navigation uses updated network rules', !(await fetchBlocked(fresh)));
  await delay(2000);
  await stopMonitor();
  check('Compiler worker observed with sandbox requested', report.workerMeasurement.workers.some(worker =>
    worker.command.includes('--service-sandbox-type=service') && !worker.command.includes('--no-sandbox')));
  check('Worker token confirms low-integrity Windows isolation', report.workerMeasurement.workers.some(worker =>
    worker.integrityRid <= 4096 && (worker.tokenRestricted || worker.appContainer)));
  check('Compiler worker absent after publication', report.workerMeasurement.workersRemaining === 0);
  await close();
  const state = await json(path.join(profile, 'Local State'));
  report.savedState = state.senda.filter_updates;
  check('Native index publication matches committed generation', state.senda.ruleset_version.content === `senda-updated-${updated.active}`);
  await automaticOff();
  const restarted = await launch(true);
  await until(() => styles(restarted), Boolean);
  check('Restart retains committed cache with update host unavailable and automatic updates off', (await pointer()).active === updated.active && !(await fetchBlocked(restarted)));
  await close();
  const offlineState = await json(path.join(profile, 'Local State'));
  check('Offline restart publishes the downloaded index rather than silently falling back',
    offlineState.senda.ruleset_version.content === `senda-updated-${updated.active}`);
  const rulesFile = path.join(activeDirectory, 'UnindexedRules');
  const bytes = await readFile(rulesFile);
  bytes[bytes.length >> 1] ^= 1;
  await writeFile(rulesFile, bytes);
  const recovered = await launch();
  await until(() => styles(recovered), value => value?.[0] === 'none');
  check('Corrupt active generation recovers previous network and cosmetics', await fetchBlocked(recovered));
  await close();
  const recoveredState = await json(path.join(profile, 'Local State'));
  check('Recovered previous index is persisted', recoveredState.senda.ruleset_version.content === `senda-updated-${seeded}`);
  const previousRules = path.join(profile, 'SendaFilterLists', seeded, 'UnindexedRules');
  const previousBytes = await readFile(previousRules);
  previousBytes[previousBytes.length >> 1] ^= 1;
  await writeFile(previousRules, previousBytes);
  const fallback = await launch();
  await until(async () => {
    if ((await styles(fallback))?.[0] !== 'block') return false;
    return evaluate(fallback, `fetch('http://ad.doubleclick.net:${port}/ad.js?'+Math.random()).then(()=>false,()=>true)`);
  }, Boolean);
  check('Two corrupt generations recover bundled network protection', true);
  await close();
  const preferencesFile = path.join(profile, 'Default/Preferences');
  const preferences = await json(preferencesFile);
  const allowedUrl = `http://allowed.senda.test:${port}/page`;
  const exceptionKey = `http://allowed.senda.test:${port},*`;
  preferences.profile ??= {};
  preferences.profile.content_settings ??= {};
  preferences.profile.content_settings.exceptions ??= {};
  preferences.profile.content_settings.exceptions.subresource_filter ??= {};
  preferences.profile.content_settings.exceptions.subresource_filter[exceptionKey] = {setting: 1};
  await writeFile(preferencesFile, JSON.stringify(preferences));
  for (let restart = 0; restart < 2; ++restart) {
    await launch(true);
    const target = await cdp.send('Target.createTarget', {url: allowedUrl});
    const session = await attach(target.targetId);
    await until(() => styles(session), Boolean);
    check(`Site exception remains effective after restart ${restart + 1}`,
      !(await evaluate(session, `fetch('http://ad.doubleclick.net:${port}/ad.js?'+Math.random()).then(()=>false,()=>true)`)));
    await close();
  }
  const interruptedState = await json(path.join(profile, 'Local State'));
  interruptedState.senda.filter_updates.automatic = true;
  interruptedState.senda.filter_updates.last_check = '0';
  await writeFile(path.join(profile, 'Local State'), JSON.stringify(interruptedState));
  await launch();
  await until(async () => (await readdir(path.join(profile, 'SendaFilterLists'))).some(name => name.startsWith('staging-')), Boolean, 180000);
  const children = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(item => item.id);
  await close();
  await until(async () => Number((await run('powershell.exe', ['-NoProfile', '-Command',
    `@(Get-Process -Id ${children.join(',')} -ErrorAction SilentlyContinue).Count`])).trim()) === 0, Boolean, 20000);
  check('Closing during an update leaves no browser-owned processes', true);
  await automaticOff();
}
async function interruptedWorkerScenario() {
  const session = await launch();
  monitor = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'tests/helpers/measure-filter-worker.ps1'), '-BrowserProcessId', String(browser.pid),
    '-Profile', profile, '-InterruptFirstWorker'], {windowsHide: true, stdio: 'ignore'});
  await until(() => styles(session), value => value?.[0] === 'none');
  const marker = path.join(profile, 'worker-interrupted.json');
  await until(() => readFile(marker, 'utf8'), Boolean, 180000);
  report.interruptedWorker = JSON.parse((await readFile(marker, 'utf8')).replace(/^\uFEFF/, ''));
  await until(async () => !(await readdir(path.join(profile, 'SendaFilterLists'))).some(name => name.startsWith('staging-')), Boolean);
  check('Worker disconnection leaves the active generation unchanged', (await pointer()).active === seeded);
  check('Worker disconnection preserves network protection', await fetchBlocked(session));
  check('Worker disconnection preserves cosmetic protection', (await styles(session))[0] === 'none');
  await stopMonitor();
  check('Interrupted compiler leaves no idle worker', report.workerMeasurement.workersRemaining === 0);
  await close();
  const state = await json(path.join(profile, 'Local State'));
  check('Disconnection records an update error rather than success', state.senda.filter_updates.outcome === 3);
  await automaticOff();
}
try {
  report.mode = process.argv.includes('--interrupt-worker') ? 'worker-disconnection' : 'normal';
  await (report.mode === 'normal' ? normalScenario() : interruptedWorkerScenario());
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.error = error.stack;
  throw error;
} finally {
  try { try { await stopMonitor(); } finally { await close(); } } finally {
    await new Promise(resolve => server.close(resolve));
    await writeFile(path.join(profile, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Report: ${path.join(profile, 'report.json')}`);
  }
}
