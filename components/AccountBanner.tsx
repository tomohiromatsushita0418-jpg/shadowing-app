import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAccount } from '../lib/account';

/**
 * The one always-visible piece of the funnel: it sits under the hero on Home
 * and changes with the user's state — sign-up pitch, trial countdown, expiry
 * nudge, or a quiet link to billing once they are paying.
 *
 * Renders nothing until the paywall is switched on, so Home is unchanged for
 * existing users until you flip EXPO_PUBLIC_PAYWALL_ENABLED.
 */
export default function AccountBanner() {
  const router = useRouter();
  const { ready, paywallEnabled, session, entitlement } = useAccount();

  if (!paywallEnabled || !ready) return null;

  if (!session) {
    return (
      <Pressable style={[styles.banner, styles.accent]} onPress={() => router.push('/login')}>
        <Ionicons name="gift-outline" size={20} color="#fbbf24" />
        <View style={styles.textWrap}>
          <Text style={styles.title}>最初の10話（Stage 1）は無料で読めます</Text>
          <Text style={styles.sub}>メールアドレスだけで登録できます</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      </Pressable>
    );
  }

  const plan = entitlement?.plan ?? 'free';

  if (plan === 'pro') {
    return (
      <Pressable style={styles.banner} onPress={() => router.push('/account')}>
        <Ionicons name="checkmark-circle" size={20} color="#34d399" />
        <View style={styles.textWrap}>
          <Text style={styles.title}>購読中</Text>
          <Text style={styles.sub}>アカウントとお支払いの管理</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      </Pressable>
    );
  }

  // Logged in, not subscribed → free tier (Stage 1, the first 10 episodes).
  return (
    <Pressable style={[styles.banner, styles.accent]} onPress={() => router.push('/paywall')}>
      <Ionicons name="lock-open-outline" size={20} color="#fbbf24" />
      <View style={styles.textWrap}>
        <Text style={styles.title}>Stage 2以降の全エピソードを開放</Text>
        <Text style={styles.sub}>購読で全エピソードと全機能が使い放題に</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#64748b" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  accent: { borderColor: 'rgba(251,191,36,0.4)', backgroundColor: 'rgba(251,191,36,0.07)' },
  textWrap: { flex: 1, gap: 2 },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  sub: { color: '#94a3b8', fontSize: 12 },
});
