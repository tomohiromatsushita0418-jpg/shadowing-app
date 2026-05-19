import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedPhrase {
  phrase: string;
  meaning: string;
  usage?: string;
  savedAt: string;
  topicId?: string;
  sentenceEn?: string;
}

const STORAGE_KEY = 'shadowing-app:phrasebook:v1';

// Module-level state + simple subscription system so every component
// (cards in episodes, phrase book screen) stays in sync without a Context
// provider in the tree.
let cache: SavedPhrase[] = [];
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
      if (Array.isArray(parsed)) cache = parsed;
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

function getServerSnapshot() {
  return cache;
}

export function usePhraseBook() {
  const phrases = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isSaved = useCallback(
    (phraseText: string) => {
      const key = phraseText.trim().toLowerCase();
      return phrases.some((p) => p.phrase.trim().toLowerCase() === key);
    },
    [phrases]
  );

  const savePhrase = useCallback(
    (p: Omit<SavedPhrase, 'savedAt'>) => {
      const key = p.phrase.trim().toLowerCase();
      if (cache.some((x) => x.phrase.trim().toLowerCase() === key)) return;
      cache = [
        { ...p, phrase: p.phrase.trim(), savedAt: new Date().toISOString() },
        ...cache,
      ];
      emit();
      persist();
    },
    []
  );

  const removePhrase = useCallback((phraseText: string) => {
    const key = phraseText.trim().toLowerCase();
    cache = cache.filter((x) => x.phrase.trim().toLowerCase() !== key);
    emit();
    persist();
  }, []);

  const togglePhrase = useCallback(
    (p: Omit<SavedPhrase, 'savedAt'>) => {
      if (isSaved(p.phrase)) removePhrase(p.phrase);
      else savePhrase(p);
    },
    [isSaved, removePhrase, savePhrase]
  );

  return { phrases, isSaved, savePhrase, removePhrase, togglePhrase };
}
