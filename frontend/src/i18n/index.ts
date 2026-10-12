import { useSyncExternalStore } from 'react';
import english from './en.json';

export type Language = 'vi' | 'en';
const STORAGE_KEY = 'inav-language';
const readLanguage = (): Language => {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'vi'; }
  catch { return 'vi'; }
};
let language = readLanguage();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const locale = () => language === 'en' ? 'en-GB' : 'vi-VN';
export function setLanguage(next: Language) {
  language = next;
  document.documentElement.lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Storage can be unavailable. */ }
  listeners.forEach(listener => listener());
}
export const useLanguage = () => useSyncExternalStore(subscribe, () => language);
document.documentElement.lang = language;
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) setLanguage(event.newValue === 'en' ? 'en' : 'vi');
});

const translations: Record<string, string> = english;
// Translate locally generated errors that have already been interpolated and stored in state.
const templates = Object.entries(translations).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const indexes: number[] = [];
  const parts = key.split(/(\{\d+\})/).map(part => {
    const slot = /^\{(\d+)\}$/.exec(part);
    if (slot) { indexes.push(Number(slot[1])); return '(.*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { pattern: new RegExp(`^${parts.join('')}$`, 's'), indexes, value };
});
const interpolate = (text: string, values: unknown[]) => text.replace(/\{(\d+)\}/g, (slot, index) =>
  Number(index) < values.length ? String(values[Number(index)] ?? '') : slot);
export function tr(text: string, ...values: unknown[]): string {
  if (language === 'vi') return interpolate(text, values);
  const translated = translations[text];
  if (translated !== undefined) return interpolate(translated, values);
  if (!values.length) {
    for (const template of templates) {
      const match = template.pattern.exec(text);
      if (match) {
        const args: string[] = [];
        template.indexes.forEach((index, i) => { args[index] = match[i + 1]; });
        return interpolate(template.value, args);
      }
    }
  }
  return interpolate(text, values);
}
