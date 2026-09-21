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
          <Text style={styles.title}>7日間、全エピソードが無料</Text>
          <Text style={styles.sub}>メールアドレスだけで登録できます</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      </Pressable>
    );
  }

  const plan = entitlement?.plan ?? 'trial';
  const daysLeft = entitlement?.trialDaysLeft ?? 0;

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

  if (plan === 'trial' && daysLeft > 0) {
    // Only start pushing the plan in the back half of the trial; nagging on
    // day one is how you lose someone who was going to convert on day six.
    const urgent = daysLeft <= 3;
    return (
      <Pressable
        style={[styles.banner, urgent && styles.accent]}
        onPress={() => router.push(urgent ? '/paywall' : '/account')}
      >
        <Ionicons name="time-outline" size={20} color={urgent ? '#fbbf24' : '#94a3b8'} />
        <View style={styles.textWrap}>
          <Text style={styles.title}>無料トライアル 残り {daysLeft} 日</Text>
          <Text style={styles.sub}>
            {urgent ? '¥680/月 または ¥5,800/年 で継続できます' : 'すべての機能をお試しいただけます'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      </Pressable>
    );
  }

  return (
    <Pressable style={[styles.banner, styles.accent]} onPress={() => router.push('/paywall')}>
      <Ionicons name="lock-closed-outline" size={20} color="#fbbf24" />
      <View style={styles.textWrap}>
        <Text style={styles.title}>トライアルが終了しました</Text>
        <Text style={styles.sub}>購読すると全エピソードが再び開きます</Text>
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
