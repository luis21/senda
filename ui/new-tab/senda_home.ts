// Copyright 2026 Senda contributors. All rights reserved.
import {normalizeUrl, normalizeState, searchUrl, readState, writeState, STORAGE_KEY, editedLinkIndex} from './senda_home_state.js';
import type {Preferences} from './senda_home_state.js';

interface Appearance {scheme: number; palette: number; editable: boolean;}
interface NativeAppearance {
  getSendaAppearance(): Promise<Appearance>;
  setSendaAppearance(scheme: number, palette: number): Promise<{accepted: boolean}>;
}
const palettes = ['blue','forest','clay','violet','slate'] as const;
let native: NativeAppearance|undefined;
let nativeReady = location.protocol !== 'chrome:';
let appearance: Appearance|undefined;
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
function renderAppearance(value: Preferences) {
  const root = document.documentElement;
  root.dataset['theme'] = value.theme;
  root.dataset['palette'] = value.palette;
  root.dataset['background'] = value.background;
  root.dataset['layout'] = value.layout;
  $('sites').hidden = !value.showLinks;
}
function render() {
  renderAppearance(state);
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
function settingsValue(): Preferences {
  return normalizeState({...state, theme: select('theme').value, engine: select('engine').value,
    palette: select('palette').value, background: select('background').value,
    layout: select('layout').value, showLinks: input('show-links').checked});
}
async function readAppearance() {
  if (!native) return;
  appearance = await native.getSendaAppearance();
  state = normalizeState({...state, theme: ['system','light','dark'][appearance.scheme],
    palette: palettes[appearance.palette] || 'custom'});
  render();
}
$('customize').addEventListener('click', async () => {
  try { await readAppearance(); }
  catch { report('No se pudo consultar la apariencia del navegador. Vuelve a intentarlo.'); return; }
  for (const key of ['theme','engine','palette','background','layout'] as const) select(key).value = state[key];
  const currentOption = select('palette').querySelector<HTMLOptionElement>('option[value="custom"]')!;
  currentOption.hidden = currentOption.disabled = state.palette !== 'custom';
  input('show-links').checked = state.showLinks;
  select('theme').disabled = select('palette').disabled = !nativeReady || appearance?.editable === false;
  dialog('settings-dialog').showModal();
});
$('settings-form').addEventListener('input', () => renderAppearance(settingsValue()));
dialog('settings-dialog').addEventListener('close', () => renderAppearance(state));
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const next = settingsValue();
  const save = document.querySelector<HTMLButtonElement>('#settings-form button[type="submit"]')!;
  save.disabled = true;
  try {
    const scheme = ['system','light','dark'].indexOf(next.theme);
    const palette = palettes.indexOf(next.palette as typeof palettes[number]);
    if (native && (scheme !== appearance?.scheme || palette !== appearance?.palette)) {
      if (!(await native.setSendaAppearance(scheme, palette)).accepted) {
        report('La apariencia está administrada. No se aplicaron los cambios.'); return;
      }
      appearance = await native.getSendaAppearance();
    }
    state = next;
  render(); persist('Preferencias guardadas.'); dialog('settings-dialog').close();
  } catch { report('No se pudo aplicar la apariencia. Vuelve a intentarlo.'); }
  finally { save.disabled = false; }
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
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const next = readState(storage).state;
  if (dialog('link-dialog').open && editing >= 0) {
    editing = editedLinkIndex(state, next, editing);
    if (editing < 0) {
      dialog('link-dialog').close();
      report('Este acceso se cambió o eliminó en otra pestaña. Puedes volver a abrirlo.');
    }
  }
  state = next;
  if (!dialog('settings-dialog').open) render();
});
if (location.protocol === 'chrome:') {
  // The preview has no native dependencies. Chromium compiles this adapter separately.
  const adapter = './senda_appearance.js';
  import(adapter).then(async module => {
    native = module.getAppearanceHandler() as NativeAppearance;
    await readAppearance(); nativeReady = true;
    if (appearance?.editable === false) $('appearance-note').textContent = 'La apariencia está administrada por tu organización.';
  }).catch(() => report('La apariencia del navegador no está disponible. Puedes personalizar el inicio.'));
} else {
  $('appearance-note').textContent = 'Vista previa: estos colores solo afectan a esta página.';
}
if (loaded.error) report('No se pudieron recuperar las preferencias. Si modificas esta página, intentaremos guardarlas de nuevo.');
