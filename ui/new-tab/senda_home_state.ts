// Copyright 2026 Senda contributors. All rights reserved.
export type Theme = 'system'|'light'|'dark';
export type Engine = 'duckduckgo'|'google'|'bing';
export interface Site {title: string; url: string;}
export interface Preferences {theme: Theme; engine: Engine; links: Site[];}
export const STORAGE_KEY = 'senda.home.v1';
export function normalizeUrl(value: unknown): string|null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let text = value.trim();
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) text = 'https://' + text;
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function normalizeState(value: unknown): Preferences {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Preferences>;
  const state: Preferences = {
    theme: input.theme === 'dark' || input.theme === 'light' ? input.theme : 'system',
    engine: input.engine === 'google' || input.engine === 'bing' ? input.engine : 'duckduckgo',
    links: [],
  };
  if (Array.isArray(input.links)) {
    for (const item of input.links) {
      const url = normalizeUrl(item?.url);
      if (!url || state.links.some(link => link.url === url)) continue;
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, 40) : '';
      state.links.push({title: title || new URL(url).hostname, url});
      if (state.links.length === 12) break;
    }
  }
  return state;
}
export function searchUrl(query: string, engine: string): string|null {
  if (!query.trim()) return null;
  const base: Record<Engine, string> = {duckduckgo: 'https://duckduckgo.com/', google: 'https://www.google.com/search', bing: 'https://www.bing.com/search'};
  const selected: Engine = engine === 'google' || engine === 'bing' ? engine : 'duckduckgo';
  const url = new URL(base[selected]);
  url.searchParams.set('q', query.trim());
  return url.href;
}
export function readState(storage: Pick<Storage, 'getItem'>): {state: Preferences; error: boolean} {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return {state: normalizeState(null), error: false};
    try { return {state: normalizeState(JSON.parse(text)), error: false}; }
    catch { return {state: normalizeState(null), error: true}; }
  } catch { return {state: normalizeState(null), error: true}; }
}
export function writeState(storage: Pick<Storage, 'setItem'>, state: unknown): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); return true; }
  catch { return false; }
}
