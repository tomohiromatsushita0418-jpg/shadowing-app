import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'shadowing-app:onboarded:v1';

let onboarded = false;
let loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
async function load() {
  try { onboarded = (await AsyncStorage.getItem(STORAGE_KEY)) === '1'; } catch {}
  loaded = true;
  emit();
}
function subscribe(l: () => void) { listeners.add(l); if (!loaded) load(); return () => { listeners.delete(l); }; }
function snapshot() { return loaded ? (onboarded ? 'done' : 'new') : 'loading'; }

export function useOnboarding() {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const complete = useCallback(() => {
    onboarded = true;
    emit();
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {});
  }, []);
  return { ready: state !== 'loading', onboarded: state === 'done', complete };
}
