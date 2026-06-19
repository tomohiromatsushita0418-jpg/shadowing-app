import { useCallback, useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ProgressData {
  // topicId -> ISO timestamp when it was marked complete
  completed: Record<string, string>;
  // Local date strings (YYYY-MM-DD) on which the user studied — used for streaks
  studyDays: string[];
}

const STORAGE_KEY = 'shadowing-app:progress:v1';

// Module-level state + subscription, mirroring usePhraseBook so the home
// screen, folders, topic cards and topic screen all stay in sync without a
// Context provider in the tree.
let cache: ProgressData = { completed: {}, studyDays: [] };
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
      if (parsed && typeof parsed === 'object') {
        cache = {
          completed:
            parsed.completed && typeof parsed.completed === 'object'
              ? parsed.completed
              : {},
          studyDays: Array.isArray(parsed.studyDays) ? parsed.studyDays : [],
        };
      }
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

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Count consecutive days ending today (or yesterday, so a streak stays
// "alive" until the day is over) on which the user studied.
function computeStreak(studyDays: string[]): number {
  if (studyDays.length === 0) return 0;
  const set = new Set(studyDays);
  const cursor = new Date();
  if (!set.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(dateKey(cursor))) return 0;
  }
  let streak = 0;
  while (set.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Record that the user studied today. Returns true if today was newly added.
function addStudyToday(days: string[]): string[] {
  const today = dateKey(new Date());
  if (days.includes(today)) return days;
  return [...days, today];
}

export function useProgress() {
  const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const completedCount = useMemo(
    () => Object.keys(data.completed).length,
    [data]
  );

  const streak = useMemo(() => computeStreak(data.studyDays), [data]);

  const isComplete = useCallback(
    (topicId: string) => Boolean(data.completed[topicId]),
    [data]
  );

  const completedInList = useCallback(
    (topicIds: string[]) =>
      topicIds.reduce((n, id) => (data.completed[id] ? n + 1 : n), 0),
    [data]
  );

  const markComplete = useCallback((topicId: string) => {
    if (cache.completed[topicId]) return;
    cache = {
      completed: { ...cache.completed, [topicId]: new Date().toISOString() },
      studyDays: addStudyToday(cache.studyDays),
    };
    emit();
    persist();
  }, []);

  const unmarkComplete = useCallback((topicId: string) => {
    if (!cache.completed[topicId]) return;
    const { [topicId]: _removed, ...rest } = cache.completed;
    cache = { ...cache, completed: rest };
    emit();
    persist();
  }, []);

  const toggleComplete = useCallback(
    (topicId: string) => {
      if (cache.completed[topicId]) unmarkComplete(topicId);
      else markComplete(topicId);
    },
    [markComplete, unmarkComplete]
  );

  // Mark today as a study day without changing completion (e.g. on practice).
  const recordStudy = useCallback(() => {
    const next = addStudyToday(cache.studyDays);
    if (next === cache.studyDays) return;
    cache = { ...cache, studyDays: next };
    emit();
    persist();
  }, []);

  return {
    completed: data.completed,
    studyDays: data.studyDays,
    completedCount,
    streak,
    isComplete,
    completedInList,
    markComplete,
    unmarkComplete,
    toggleComplete,
    recordStudy,
  };
}
