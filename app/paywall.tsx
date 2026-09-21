import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { topics } from '../data/topics';
import { useAccount } from '../lib/account';

const MONTHLY_YEN = 980;
const YEARLY_YEN = 7800;
const TRIAL_DAYS = 7;
// Rounded down to the nearest yen — never overstate the discount.
const YEARLY_PER_MONTH = Math.floor(YEARLY_YEN / 12);
const YEARLY_DISCOUNT_PCT = Math.round((1 - YEARLY_YEN / (MONTHLY_YEN * 12)) * 100);

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'albums-outline', text: `全${topics.length}エピソードが見放題（毎日1本ずつ追加）` },
  { icon: 'volume-high-outline', text: 'ネイティブ音声で文・単語・熟語を何度でも再生' },
  { icon: 'bookmark-outline', text: '熟語帳に無制限で保存' },
  { icon: 'flash-outline', text: '瞬間英作文トレーニング' },
  { icon: 'flame-outline', text: '学習進捗とストリークの記録' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ checkout?: string }>();
  const { ready, session, entitlement, startCheckout } = useAccount();

  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trialDaysLeft = entitlement?.trialDaysLeft ?? 0;
  const trialOver = entitlement?.plan === 'trial' && trialDaysLeft === 0;

  const onSubscribe = async () => {
    if (!session) {
      router.push('/login');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await startCheckout(plan);
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <LinearGradient
        colors={['rgba(251,191,36,0.18)', 'rgba(251,191,36,0)']}
        style={styles.hero}
      >
        <Ionicons name="headset" size={40} color="#fbbf24" />
        <Text style={styles.title}>
          {trialOver ? '無料トライアルが終了しました' : 'すべてのエピソードを開放'}
        </Text>
        <Text style={styles.subtitle}>
          {trialOver
            ? '続けて学習するにはプランをお選びください。'
            : '毎日更新される教材で、TOEIC 700 から 990 へ。'}
        </Text>
      </LinearGradient>

      {params.checkout === 'cancelled' ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color="#94a3b8" />
          <Text style={styles.noticeText}>決済はキャンセルされました。</Text>
        </View>
      ) : null}

      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.text} style={styles.benefitRow}>
            <Ionicons name={benefit.icon} size={18} color="#fbbf24" />
            <Text style={styles.benefitText}>{benefit.text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.planCard, plan === 'yearly' && styles.planCardActive]}
        onPress={() => setPlan('yearly')}
      >
        <View style={styles.planHeader}>
          <View style={styles.planTitleRow}>
            <Ionicons
              name={plan === 'yearly' ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={plan === 'yearly' ? '#fbbf24' : '#64748b'}
            />
            <Text style={styles.planName}>年額プラン</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{YEARLY_DISCOUNT_PCT}% お得</Text>
          </View>
        </View>
        <Text style={styles.planPrice}>
          ¥{YEARLY_YEN.toLocaleString()}
          <Text style={styles.planPeriod}> / 年</Text>
        </Text>
        <Text style={styles.planNote}>月あたり ¥{YEARLY_PER_MONTH.toLocaleString()}</Text>
      </Pressable>

      <Pressable
        style={[styles.planCard, plan === 'monthly' && styles.planCardActive]}
        onPress={() => setPlan('monthly')}
      >
        <View style={styles.planHeader}>
          <View style={styles.planTitleRow}>
            <Ionicons
              name={plan === 'monthly' ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={plan === 'monthly' ? '#fbbf24' : '#64748b'}
            />
            <Text style={styles.planName}>月額プラン</Text>
          </View>
        </View>
        <Text style={styles.planPrice}>
          ¥{MONTHLY_YEN.toLocaleString()}
          <Text style={styles.planPeriod}> / 月</Text>
        </Text>
        <Text style={styles.planNote}>いつでも解約できます</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!trialOver ? (
        <View style={styles.trialNote}>
          <Ionicons name="gift-outline" size={16} color="#fbbf24" />
          <Text style={styles.trialNoteText}>
            最初の{TRIAL_DAYS}日間は無料。トライアル中に解約すれば料金はかかりません。
          </Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.primary, busy && styles.disabled]}
        onPress={() => void onSubscribe()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#0f0f14" />
        ) : (
          <Text style={styles.primaryLabel}>
            {session ? `${TRIAL_DAYS}日間無料で始める` : 'ログインして続ける'}
          </Text>
        )}
      </Pressable>

      <Text style={styles.legal}>
        決済は Stripe が処理します。カード情報が当アプリのサーバーに保存されることはありません。
        解約はいつでもアカウント画面から行え、解約後も期間終了までご利用いただけます。
      </Text>

      <Pressable onPress={() => router.push('/legal')}>
        <Text style={styles.legalLink}>特定商取引法に基づく表記・利用規約</Text>
      </Pressable>

      <Pressable style={styles.ghost} onPress={() => router.back()}>
        <Text style={styles.ghostLabel}>あとで</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 48, gap: 14 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 16, borderRadius: 18 },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
  },
  noticeText: { color: '#94a3b8', fontSize: 13 },
  benefits: { gap: 10, paddingVertical: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  benefitText: { color: '#e2e8f0', fontSize: 14, lineHeight: 21, flex: 1 },
  planCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  planCardActive: { borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.07)' },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  badge: { backgroundColor: '#fbbf24', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#0f0f14', fontSize: 11, fontWeight: '800' },
  planPrice: { color: '#f1f5f9', fontSize: 26, fontWeight: '800', marginTop: 4 },
  planPeriod: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  planNote: { color: '#94a3b8', fontSize: 12 },
  primary: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 4,
  },
  primaryLabel: { color: '#0f0f14', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  trialNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    borderRadius: 10,
    padding: 12,
  },
  trialNoteText: { color: '#fde68a', fontSize: 12.5, lineHeight: 19, flex: 1, fontWeight: '600' },
  legal: { color: '#64748b', fontSize: 11, lineHeight: 18, textAlign: 'center' },
  legalLink: { color: '#94a3b8', fontSize: 12, textAlign: 'center', textDecorationLine: 'underline' },
  ghost: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  ghostLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
});
