import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ReviewStat {
  correct: number;
  wrong: number;
  lastSeen: string;
}

type Store = Record<string, ReviewStat>; // key = normalized phrase

const STORAGE_KEY = 'shadowing-app:phrase-review:v1';

let cache: Store = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
async function persist() { try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {} }
async function load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') cache = p; }
  } catch {}
  loaded = true;
  emit();
}
function subscribe(l: () => void) { listeners.add(l); if (!loaded) load(); return () => { listeners.delete(l); }; }
function getSnapshot() { return cache; }

const norm = (p: string) => p.trim().toLowerCase();

export function usePhraseReview() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const record = useCallback((phrase: string, correct: boolean) => {
    const k = norm(phrase);
    const cur = cache[k] ?? { correct: 0, wrong: 0, lastSeen: '' };
    cache = {
      ...cache,
      [k]: {
        correct: cur.correct + (correct ? 1 : 0),
        wrong: cur.wrong + (correct ? 0 : 1),
        lastSeen: new Date().toISOString(),
      },
    };
    emit();
    persist();
  }, []);

  // Higher = surface sooner. Never-seen and often-wrong rank highest.
  const weight = useCallback((phrase: string): number => {
    const s = store[norm(phrase)];
    if (!s) return 3;                 // unseen
    return 1 + s.wrong - s.correct;   // more wrong than right → higher
  }, [store]);

  const stat = useCallback((phrase: string) => store[norm(phrase)], [store]);

  return { store, ready: loaded, record, weight, stat };
}
