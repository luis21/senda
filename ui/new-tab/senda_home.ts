// Copyright 2026 Senda contributors. All rights reserved.
import {normalizeUrl, normalizeState, searchUrl, readState, writeState} from './senda_home_state.js';
function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw Error('Missing Senda element: ' + id);
  return element;
}
function input(id: string): HTMLInputElement {
  const element = $(id);
  if (!(element instanceof HTMLInputElement)) throw Error('Expected input: ' + id);
  return element;
}
function select(id: string): HTMLSelectElement {
  const element = $(id);
  if (!(element instanceof HTMLSelectElement)) throw Error('Expected select: ' + id);
  return element;
}
function dialog(id: string): HTMLDialogElement {
  const element = $(id);
  if (!(element instanceof HTMLDialogElement)) throw Error('Expected dialog: ' + id);
  return element;
}
function button(id: string): HTMLButtonElement {
  const element = $(id);
  if (!(element instanceof HTMLButtonElement)) throw Error('Expected button: ' + id);
  return element;
}
let storage: Pick<Storage, 'getItem'|'setItem'>;
try { storage = window.localStorage; }
catch { storage = {getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }}; }
const loaded = readState(storage);
let state = loaded.state;
let editing = -1;
const names = {duckduckgo: 'DuckDuckGo', google: 'Google', bing: 'Bing'};
function report(text: string) { $('status').textContent = text; }
function persist(message: string) {
  const saved = writeState(storage, state);
  report(saved ? message : 'No se pudieron guardar los cambios. Puedes seguir usando esta página, pero se perderán al cerrarla.');
}
function openLink(index = -1) {
  editing = index;
  $('link-heading').textContent = index < 0 ? 'Añadir acceso' : 'Editar acceso';
  input('link-title').value = state.links[index]?.title || '';
  input('link-url').value = state.links[index]?.url || '';
  $('link-error').textContent = '';
  $('remove-link').hidden = index < 0;
  dialog('link-dialog').showModal();
}
function focusLink(index: number) {
  const targets = $('links').querySelectorAll<HTMLButtonElement>('.edit');
  const target = targets[index] || button('add-link');
  if (!target.disabled) target.focus();
}
function render() {
  document.documentElement.dataset['theme'] = state.theme;
  $('engine-name').textContent = names[state.engine];
  $('empty').hidden = state.links.length > 0;
  button('add-link').disabled = state.links.length >= 12;
  $('add-link').title = state.links.length >= 12 ? 'Puedes guardar hasta doce accesos' : '';
  const children = state.links.map((link, index) => {
    const tile = document.createElement('div'); tile.className = 'site';
    const a = document.createElement('a'); a.href = link.url; a.title = link.title;
    const icon = document.createElement('span'); icon.className = 'monogram'; icon.setAttribute('aria-hidden', 'true');
    icon.textContent = Array.from(link.title).slice(0, 1).join('').toLocaleUpperCase();
    const label = document.createElement('span'); label.className = 'site-name'; label.textContent = link.title;
    a.append(icon, label);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'text-button edit'; edit.textContent = '⋯'; edit.setAttribute('aria-label', 'Editar ' + link.title); edit.addEventListener('click', () => openLink(index));
    tile.append(a, edit); return tile;
  });
  $('links').replaceChildren(...children);
}
$('search-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = searchUrl(input('search').value, state.engine);
  if (url) window.location.assign(url);
});
$('customize').addEventListener('click', () => {
  select('theme').value = state.theme; select('engine').value = state.engine;
  dialog('settings-dialog').showModal();
});
$('settings-form').addEventListener('submit', event => {
  event.preventDefault(); state = normalizeState({...state, theme: select('theme').value, engine: select('engine').value});
  render(); persist('Preferencias guardadas.'); dialog('settings-dialog').close();
});
$('add-link').addEventListener('click', () => openLink());
$('link-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = normalizeUrl(input('link-url').value);
  if (!url) { $('link-error').textContent = 'Introduce una dirección web HTTP o HTTPS válida, sin contraseñas.'; input('link-url').focus(); return; }
  if (state.links.some((link, i) => link.url === url && i !== editing)) { $('link-error').textContent = 'Ya tienes un acceso a esta dirección.'; return; }
  const link = {title: input('link-title').value.trim().slice(0,40) || new URL(url).hostname, url};
  if (editing >= 0) state.links[editing] = link;
  else if (state.links.length < 12) state.links.push(link);
  const savedIndex = editing >= 0 ? editing : state.links.length - 1;
  render(); persist(editing < 0 ? 'Acceso añadido.' : 'Acceso actualizado.'); dialog('link-dialog').close();
  focusLink(savedIndex);
});
$('remove-link').addEventListener('click', () => {
  if (editing < 0) return;
  state.links.splice(editing, 1);
  const nextIndex = Math.min(editing, state.links.length - 1);
  render(); persist('Acceso eliminado.'); dialog('link-dialog').close();
  focusLink(nextIndex);
});
for (const close of document.querySelectorAll<HTMLButtonElement>('[data-close]')) {
  close.addEventListener('click', () => { const id = close.dataset['close']; if (id) dialog(id).close(); });
}
render();
if (loaded.error) report('No se pudieron recuperar las preferencias. Si modificas esta página, intentaremos guardarlas de nuevo.');
