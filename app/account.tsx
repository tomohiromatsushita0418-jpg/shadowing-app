import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAccount } from '../lib/account';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ checkout?: string }>();
  const { ready, session, email, entitlement, openBillingPortal, signOut, waitForUpgrade } =
    useAccount();

  const [confirming, setConfirming] = useState(params.checkout === 'success');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stripe bounces the user back here the moment payment clears, which is
  // usually a beat before the webhook has flipped the plan. Wait it out rather
  // than showing "trial" to someone who just paid.
  useEffect(() => {
    if (params.checkout !== 'success') return;
    let cancelled = false;
    void (async () => {
      await waitForUpgrade();
      if (!cancelled) setConfirming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.checkout, waitForUpgrade]);

  const onManage = async () => {
    setBusy(true);
    setError(null);
    const result = await openBillingPortal();
    setBusy(false);
    if (result.error) setError(result.error);
  };

  if (!ready) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="person-circle-outline" size={56} color="#64748b" />
        <Text style={styles.title}>ログインしていません</Text>
        <Pressable style={styles.primary} onPress={() => router.push('/login')}>
          <Text style={styles.primaryLabel}>ログイン / 新規登録</Text>
        </Pressable>
      </View>
    );
  }

  if (confirming) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#fbbf24" />
        <Text style={styles.title}>お支払いを確認しています</Text>
        <Text style={styles.body}>数秒お待ちください…</Text>
      </View>
    );
  }

  const plan = entitlement?.plan ?? 'trial';
  const isPro = plan === 'pro';
  const isTrial = plan === 'trial' && (entitlement?.trialDaysLeft ?? 0) > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <Text style={styles.label}>アカウント</Text>
        <Text style={styles.value}>{email}</Text>
      </View>

      <View style={[styles.card, isPro && styles.cardPro]}>
        <View style={styles.statusRow}>
          <Ionicons
            name={isPro ? 'checkmark-circle' : isTrial ? 'time-outline' : 'lock-closed-outline'}
            size={22}
            color={isPro ? '#34d399' : isTrial ? '#fbbf24' : '#f87171'}
          />
          <Text style={styles.statusText}>
            {isPro ? '購読中' : isTrial ? '無料トライアル中' : 'トライアル終了'}
          </Text>
        </View>

        {isPro ? (
          <Text style={styles.body}>
            {entitlement?.cancelAtPeriodEnd
              ? `${formatDate(entitlement.currentPeriodEnd)} に解約予定です。それまでは全機能をご利用いただけます。`
              : `次回更新日: ${formatDate(entitlement?.currentPeriodEnd ?? null)}`}
          </Text>
        ) : isTrial ? (
          <Text style={styles.body}>
            残り {entitlement?.trialDaysLeft} 日（{formatDate(entitlement?.trialEndsAt ?? null)} まで）
          </Text>
        ) : (
          <Text style={styles.body}>
            購読すると全エピソードと全機能が再び使えるようになります。
          </Text>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isPro ? (
        <Pressable style={[styles.primary, busy && styles.disabled]} onPress={() => void onManage()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#0f0f14" />
          ) : (
            <Text style={styles.primaryLabel}>お支払い・解約の管理</Text>
          )}
        </Pressable>
      ) : (
        <Pressable style={styles.primary} onPress={() => router.push('/paywall')}>
          <Text style={styles.primaryLabel}>プランを見る</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.ghost}
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      >
        <Text style={styles.ghostLabel}>ログアウト</Text>
      </Pressable>

      <Pressable style={styles.ghost} onPress={() => router.push('/legal')}>
        <Text style={styles.ghostLabel}>規約・特定商取引法に基づく表記</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  scroll: { padding: 20, gap: 14 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardPro: { borderColor: 'rgba(52,211,153,0.35)', backgroundColor: 'rgba(52,211,153,0.06)' },
  label: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  title: { color: '#f1f5f9', fontSize: 20, fontWeight: '800' },
  body: { color: '#94a3b8', fontSize: 14, lineHeight: 21 },
  primary: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryLabel: { color: '#0f0f14', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  ghost: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  ghostLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
});
