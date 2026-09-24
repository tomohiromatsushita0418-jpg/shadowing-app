import { useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Logs one app-visit row per browser session, tagged with where the visitor
 * came from — utm_source on the SEO/Threads links, otherwise referrer/direct —
 * so the daily digest can attribute signups and subscriptions to a channel.
 * Best-effort: analytics must never break the app.
 */
export function useTrackVisit() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      if (window.sessionStorage.getItem('visit_logged')) return;
      const params = new URLSearchParams(window.location.search);
      let source = params.get('utm_source');
      if (!source) {
        const ref = document.referrer;
        source = ref && !ref.includes(window.location.host) ? 'referral' : 'direct';
      }
      window.sessionStorage.setItem('visit_logged', '1');
      void supabase
        .from('visits')
        .insert({ kind: 'app_visit', source, path: window.location.pathname });
    } catch {
      /* ignore */
    }
  }, []);
}
