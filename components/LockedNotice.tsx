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
 * Shown in place of gated content (episodes 11+ and the practice tools). The
 * newest 10 episodes are free; everything else needs a subscription. A logged-out
 * visitor is nudged to sign up first, then subscribe.
 */
export default function LockedNotice({ what }: Props) {
  const router = useRouter();
  const { session } = useAccount();

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={28} color="#fbbf24" />
      </View>

      <Text style={styles.title}>{what}はロックされています</Text>

      <Text style={styles.body}>
        無料で読めるのは最新10話までです。{'\n'}
        購読すると、過去の全エピソードのアーカイブと{'\n'}
        瞬間英作文・熟語などの全機能が使い放題になります。
      </Text>

      <Pressable
        style={styles.primary}
        onPress={() => router.push(session ? '/paywall' : '/login')}
      >
        <Text style={styles.primaryLabel}>
          {session ? 'プランを見る' : '登録して続ける'}
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
