import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, [root+'.chromium/src/third_party/node/node_modules/typescript/bin/tsc', '--target','ESNext','--module','ESNext','--moduleResolution','bundler','--lib','DOM,DOM.Iterable,ESNext','--strict','--noUncheckedIndexedAccess','--noPropertyAccessFromIndexSignature','--skipLibCheck','--outDir',root+'.tools/home-tests',root+'ui/new-tab/senda_home.ts',root+'ui/new-tab/senda_home_state.ts']);
const source = await readFile(new URL('../.tools/home-tests/senda_home_state.js', import.meta.url), 'utf8');
const {normalizeUrl, normalizeState, searchUrl, readState, writeState} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('rechaza protocolos ejecutables y conserva HTTPS', () => {
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('file:///C:/secret'), null);
  assert.equal(normalizeUrl(' https://example.com/path '), 'https://example.com/path');
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('https://user:password@example.com'), null);
});
test('no permite que preferencias corruptas añadan enlaces inseguros', () => {
  const state = normalizeState({theme:'unknown',engine:'evil',links:[{title:'bad',url:'data:text/html,bad'},{title:'Ejemplo',url:'https://example.com'}, {title:'Duplicado',url:'https://example.com/'}]});
  assert.equal(state.theme, 'system');
  assert.equal(state.engine, 'duckduckgo');
  assert.deepEqual(state.links, [{title:'Ejemplo',url:'https://example.com/'}]);
  assert.equal(normalizeState({links:Array.from({length:20},(_,i)=>({title:String(i),url:`https://example.com/${i}`}))}).links.length,12);
});
test('codifica la búsqueda y no acepta motores arbitrarios', () => {
  assert.equal(new URL(searchUrl('a & b', 'duckduckgo')).searchParams.get('q'),'a & b');
  assert.equal(new URL(searchUrl('prueba','evil')).hostname,'duckduckgo.com');
  assert.equal(new URL(searchUrl('prueba','__proto__')).hostname,'duckduckgo.com');
  assert.equal(searchUrl('   ','bing'),null);
});
test('recupera JSON corrupto e informa errores de almacenamiento', () => {
  assert.equal(readState({getItem:()=>'{broken'}).state.theme,'system');
  assert.equal(readState({getItem:()=>{throw Error('denied')}}).error,true);
  assert.equal(writeState({setItem:()=>{throw Error('quota')}},{}),false);
});
test('guarda preferencias normalizadas y recupera accesos', () => {
  let saved;
  const storage={setItem:(_,v)=>saved=v,getItem:()=>saved};
  assert.equal(writeState(storage,{theme:'dark',engine:'bing',links:[{title:'Example',url:'https://example.com'}]}),true);
  assert.equal(readState(storage).state.theme,'dark');
  assert.equal(readState(storage).state.links[0].url,'https://example.com/');
});
