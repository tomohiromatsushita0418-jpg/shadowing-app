import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// How many 瞬間英作文 problems a free (non-subscriber) account may grade before
// the paywall. A lifetime sample, not a daily reset — enough to feel the value.
export const FREE_COMPOSE_LIMIT = 3;

const KEY = 'compose_free_used_v1';

/**
 * Tracks how many composition problems a free user has graded, persisted across
 * sessions. Subscribers/comp accounts never consult this (they're unlimited).
 */
export function useComposeQuota() {
  const [used, setUsed] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY).then((v) => {
      if (!alive) return;
      setUsed(v ? Number.parseInt(v, 10) || 0 : 0);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const increment = useCallback(() => {
    setUsed((prev) => {
      const next = prev + 1;
      void AsyncStorage.setItem(KEY, String(next));
      return next;
    });
  }, []);

  return { used, ready, increment, limit: FREE_COMPOSE_LIMIT };
}
