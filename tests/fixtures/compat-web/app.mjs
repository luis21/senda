import {add} from './math.mjs';
window.askExtension = action => new Promise((resolve, reject) => {
  const token = crypto.randomUUID();
  const listener = event => {
    let message;
    try { message = JSON.parse(event.detail); } catch { return; }
    if (message.token !== token) return;
    clearTimeout(timer); window.removeEventListener('senda-compat-response', listener);
    message.response?.error ? reject(Error(message.response.error)) : resolve(message.response);
  };
  const timer = setTimeout(() => {window.removeEventListener('senda-compat-response', listener);reject(Error('Extension message timed out'));}, 8000);
  window.addEventListener('senda-compat-response', listener);
  window.dispatchEvent(new CustomEvent('senda-compat-request', {detail: JSON.stringify({token, action})}));
});
try {
  const results = {modules: add(17, 25), dynamicImport: (await import('./math.mjs?dynamic')).add(20, 22)};
  const wasm = await WebAssembly.instantiateStreaming(fetch('/add.wasm'));
  results.wasm = wasm.instance.exports.add(17, 25);
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('senda-compatibility', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('values');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  results.indexedDBBefore = await new Promise((resolve, reject) => {
    const request = database.transaction('values').objectStore('values').get('marker');
    request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('values', 'readwrite'); transaction.objectStore('values').put(42, 'marker');
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
  }); database.close();
  const cache = await caches.open('senda-compatibility'); await cache.put('/cached-resource', new Response('local-cache'));
  results.cache = await (await cache.match('/cached-resource')).text();
  await navigator.serviceWorker.register('/web-worker.js'); await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Web worker did not take control')), 8000);
    navigator.serviceWorker.addEventListener('controllerchange', () => {clearTimeout(timer);resolve();}, {once: true});
  });
  results.serviceWorkerController = {
    state: navigator.serviceWorker.controller?.state,
    scriptURL: navigator.serviceWorker.controller?.scriptURL,
  };
  results.serviceWorker = await (await fetch('/sw-resource')).text();
  const context = document.querySelector('#canvas').getContext('2d'); context.fillStyle = '#123456'; context.fillRect(0, 0, 4, 4);
  results.canvas = Array.from(context.getImageData(1, 1, 1, 1).data);
  results.grid = getComputedStyle(document.querySelector('#grid')).gridTemplateColumns;
  window.webResults = results;
  document.querySelector('#status').textContent = 'Controlled web checks finished';
} catch (error) { window.webFailure = String(error); }
window.webReady = true;
