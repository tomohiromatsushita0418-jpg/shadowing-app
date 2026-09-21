import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const STEPS = [
  { icon: 'headset', color: '#22d3ee', title: 'Shadow', body: 'ネイティブ音声を真似て、声に出す' },
  { icon: 'create', color: '#34d399', title: 'Rebuild', body: '和文から自分で英作文、AIが添削' },
  { icon: 'sparkles', color: '#fbbf24', title: 'Own it', body: '苦手を繰り返し、体に定着させる' },
] as const;

export default function Welcome({ onStart }: { onStart: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient colors={['#0b0c14', '#0b1424', '#0a0a10']} style={StyleSheet.absoluteFill} />
      <View style={styles.brandRow}>
        <Text style={styles.brand}>RESOUND</Text>
      </View>
      <Text style={styles.headline}>毎日1本を、{'\n'}話せるまで。</Text>
      <Text style={styles.sub}>
        時事・ビジネス・日常英語の短い1本を、{'\n'}3ステップで“使える英語”に変えます。
      </Text>

      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.stepIcon, { backgroundColor: s.color + '22', borderColor: s.color + '55' }]}>
              <Ionicons name={s.icon as any} size={20} color={s.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />
      <Pressable style={styles.cta} onPress={onStart}>
        <Text style={styles.ctaText}>はじめる</Text>
        <Ionicons name="arrow-forward" size={18} color="#0b1220" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, paddingHorizontal: 28 },
  brandRow: { marginBottom: 32 },
  brand: { color: '#fafafa', fontSize: 13, fontWeight: '700', letterSpacing: 6 },
  headline: { color: '#f8fafc', fontSize: 34, fontWeight: '900', lineHeight: 44, letterSpacing: -0.5 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 24, marginTop: 16 },
  steps: { marginTop: 40, gap: 20 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepIcon: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  stepBody: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 2 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22d3ee', paddingVertical: 17, borderRadius: 999,
  },
  ctaText: { color: '#0b1220', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
});
