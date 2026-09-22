import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAccount } from '../lib/account';

type Kind = 'bug' | 'request' | 'other';
const KINDS: { key: Kind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'bug', label: '不具合', icon: 'bug-outline' },
  { key: 'request', label: 'ご要望', icon: 'bulb-outline' },
  { key: 'other', label: 'その他', icon: 'chatbubble-ellipses-outline' },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { session, email: accountEmail } = useAccount();

  const [kind, setKind] = useState<Kind>('request');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { navigation.setOptions({ title: 'お問い合わせ・ご要望' }); }, [navigation]);

  const submit = async () => {
    const body = message.trim();
    if (body.length < 3) { setError('内容を入力してください'); return; }
    setSending(true);
    setError(null);
    try {
      const device = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : Platform.OS;
      const { error: err } = await supabase.from('feedback').insert({
        kind,
        message: body,
        email: (accountEmail || email.trim() || null) as any,
        user_id: (session?.user.id ?? null) as any,
        device,
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError('送信に失敗しました。通信環境を確認してもう一度お試しください。');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="checkmark-circle" size={64} color="#34d399" />
        <Text style={styles.thanksTitle}>送信しました</Text>
        <Text style={styles.thanksBody}>
          貴重なご意見ありがとうございます。{'\n'}
          いただいた内容は運営が確認し、改善に活かします。
        </Text>
        <Pressable style={styles.ghost} onPress={() => { setSent(false); setMessage(''); }}>
          <Text style={styles.ghostLabel}>続けて送る</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          不具合の報告・機能のご要望・その他ご意見をお寄せください。{'\n'}
          いただいた内容はすべて運営が確認します。
        </Text>

        <Text style={styles.label}>種類</Text>
        <View style={styles.kindRow}>
          {KINDS.map((k) => (
            <Pressable
              key={k.key}
              style={[styles.kindChip, kind === k.key && styles.kindChipOn]}
              onPress={() => setKind(k.key)}
            >
              <Ionicons name={k.icon} size={15} color={kind === k.key ? '#0b1220' : '#94a3b8'} />
              <Text style={[styles.kindText, kind === k.key && styles.kindTextOn]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>内容</Text>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={(t) => { setMessage(t); if (error) setError(null); }}
          placeholder="例）このエピソードの音声が途中で止まります／〇〇の機能がほしいです"
          placeholderTextColor="#475569"
          multiline
          editable={!sending}
        />

        {!accountEmail && (
          <>
            <Text style={styles.label}>返信用メール（任意）</Text>
            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              keyboardType="email-address"
              inputMode="email"
              editable={!sending}
            />
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primary, (sending || message.trim().length < 3) && styles.disabled]}
          onPress={() => void submit()}
          disabled={sending || message.trim().length < 3}
        >
          {sending ? (
            <ActivityIndicator color="#0b1220" />
          ) : (
            <>
              <Ionicons name="send" size={16} color="#0b1220" />
              <Text style={styles.primaryLabel}>送信する</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  scroll: { padding: 16 },
  lead: { color: '#94a3b8', fontSize: 14, lineHeight: 22, marginBottom: 20 },
  label: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  kindChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#334155',
    borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14,
  },
  kindChipOn: { backgroundColor: '#22d3ee', borderColor: '#22d3ee' },
  kindText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  kindTextOn: { color: '#0b1220' },
  input: {
    backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 12,
    padding: 14, color: '#e2e8f0', fontSize: 15, lineHeight: 22, minHeight: 130,
    textAlignVertical: 'top', marginBottom: 16,
  },
  emailInput: {
    backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 12,
    padding: 14, color: '#e2e8f0', fontSize: 15, marginBottom: 16,
  },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22d3ee', paddingVertical: 15, borderRadius: 999,
  },
  disabled: { opacity: 0.4 },
  primaryLabel: { color: '#0b1220', fontSize: 16, fontWeight: '800' },
  thanksTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '800', marginTop: 8 },
  thanksBody: { color: '#94a3b8', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  ghost: { paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  ghostLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
});
