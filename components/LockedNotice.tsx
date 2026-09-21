import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAccount } from '../lib/account';

type Props = {
  /** What the user was trying to reach, e.g. "このエピソード" or "熟語帳". */
  what: string;
};

/**
 * Shown in place of gated content. Which call to action appears depends on
 * where the user is in the funnel: a visitor who has never signed up is offered
 * the free trial, while someone whose trial has lapsed is offered a plan.
 */
export default function LockedNotice({ what }: Props) {
  const router = useRouter();
  const { session, entitlement } = useAccount();

  const trialUsed = Boolean(session) && entitlement?.plan !== 'trial';
  const trialLapsed =
    Boolean(session) && entitlement?.plan === 'trial' && (entitlement?.trialDaysLeft ?? 0) === 0;
  const needsPlan = trialUsed || trialLapsed;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={28} color="#fbbf24" />
      </View>

      <Text style={styles.title}>{what}はロックされています</Text>

      <Text style={styles.body}>
        {needsPlan
          ? '無料トライアルが終了しました。購読すると全エピソードと全機能が再び使えます。'
          : 'メールアドレスだけで登録でき、7日間はすべての機能を無料でお試しいただけます。'}
      </Text>

      <Pressable
        style={styles.primary}
        onPress={() => router.push(needsPlan ? '/paywall' : '/login')}
      >
        <Text style={styles.primaryLabel}>
          {needsPlan ? 'プランを見る' : '7日間無料で試す'}
        </Text>
      </Pressable>

      {!session ? (
        <Pressable style={styles.ghost} onPress={() => router.push('/paywall')}>
          <Text style={styles.ghostLabel}>料金を見る</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, paddingHorizontal: 28, paddingVertical: 48 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  title: { color: '#f1f5f9', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { color: '#94a3b8', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  primary: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 6,
    minWidth: 220,
    alignItems: 'center',
  },
  primaryLabel: { color: '#0f0f14', fontSize: 15, fontWeight: '800' },
  ghost: { paddingVertical: 10, paddingHorizontal: 16 },
  ghostLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
});
