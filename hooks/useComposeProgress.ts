import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Verdict = 'perfect' | 'good' | 'needs_work';

export interface ComposeRecord {
  verdict: Verdict;
  score: number;
  answeredAt: string;
}

// Keyed by `${topicId}#${sentenceIndex}` so each shadowing sentence has its
// own instant-composition comprehension record.
type Store = Record<string, ComposeRecord>;

const STORAGE_KEY = 'shadowing-app:compose-progress:v1';

let cache: Store = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {}
}

async function load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') cache = parsed;
    }
  } catch {}
  loaded = true;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) load();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return cache;
}

export function keyFor(topicId: string, index: number) {
  return `${topicId}#${index}`;
}

export function useComposeProgress() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // `store` identity changes once the persisted value loads, so this re-renders
  // consumers when it flips true.
  const ready = loaded;

  const getRecord = useCallback(
    (topicId: string, index: number): ComposeRecord | undefined =>
      store[keyFor(topicId, index)],
    [store]
  );

  const saveRecord = useCallback(
    (topicId: string, index: number, rec: Omit<ComposeRecord, 'answeredAt'>) => {
      cache = {
        ...cache,
        [keyFor(topicId, index)]: { ...rec, answeredAt: new Date().toISOString() },
      };
      emit();
      persist();
    },
    []
  );

  // Comprehension summary for a whole topic (perfect+good count out of total).
  const topicSummary = useCallback(
    (topicId: string, total: number) => {
      let answered = 0;
      let understood = 0; // perfect or good
      for (let i = 0; i < total; i++) {
        const r = store[keyFor(topicId, i)];
        if (r) {
          answered++;
          if (r.verdict === 'perfect' || r.verdict === 'good') understood++;
        }
      }
      return { answered, understood, total };
    },
    [store]
  );

  // Overall comprehension across everything answered so far.
  const overallSummary = useCallback(() => {
    const keys = Object.keys(store);
    let understood = 0;
    for (const k of keys) {
      const v = store[k].verdict;
      if (v === 'perfect' || v === 'good') understood++;
    }
    return { answered: keys.length, understood };
  }, [store]);

  // Priority for spaced review: unanswered = 2, needs_work = 3 (most urgent),
  // good = 1, perfect = 0. Higher = surface sooner in random practice.
  const reviewWeight = useCallback(
    (topicId: string, index: number): number => {
      const r = store[keyFor(topicId, index)];
      if (!r) return 2;
      if (r.verdict === 'needs_work') return 3;
      if (r.verdict === 'good') return 1;
      return 0; // perfect — rarely resurface
    },
    [store]
  );

  return { store, ready, getRecord, saveRecord, topicSummary, overallSummary, reviewWeight };
}
