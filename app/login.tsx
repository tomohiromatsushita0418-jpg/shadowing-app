import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAccount } from '../lib/account';

export default function LoginScreen() {
  const router = useRouter();
  const { ready, session, email: signedInEmail, signInWithEmail, verifyEmailCode, signOut } = useAccount();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) { setError('6桁のコードを入力してください'); return; }
    setVerifying(true);
    setError(null);
    const result = await verifyEmailCode(email.trim(), token);
    setVerifying(false);
    if (result.error) setError('コードが正しくないか、期限切れです。もう一度お試しください。');
    // On success, `session` flips and the logged-in view renders automatically.
  };

  const submit = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('メールアドレスの形式が正しくありません');
      return;
    }
    setSending(true);
    setError(null);
    const result = await signInWithEmail(trimmed);
    setSending(false);
    if (result.error) setError(result.error);
    else setSent(true);
  };

  if (!ready) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  // Arriving here from a magic link means supabase-js has already exchanged the
  // code for a session by the time this renders.
  if (session) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="checkmark-circle" size={56} color="#34d399" />
        <Text style={styles.title}>ログイン済みです</Text>
        <Text style={styles.body}>{signedInEmail}</Text>
        <Pressable style={styles.primary} onPress={() => router.replace('/')}>
          <Text style={styles.primaryLabel}>学習をはじめる</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => void signOut()}>
          <Text style={styles.ghostLabel}>ログアウト</Text>
        </Pressable>
      </View>
    );
  }

  if (sent) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Ionicons name="mail-open-outline" size={56} color="#fbbf24" />
          <Text style={styles.title}>コードを送信しました</Text>
          <Text style={styles.body}>
            {email} 宛のメールに書かれた{'\n'}
            <Text style={{ color: '#fde68a', fontWeight: '800' }}>6桁の数字コード</Text>を、この画面に入力してください。
          </Text>

          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 6)); if (error) setError(null); }}
            placeholder="123456"
            placeholderTextColor="#475569"
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            editable={!verifying}
            onSubmitEditing={() => void verify()}
            autoFocus
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, (verifying || code.length < 6) && styles.disabled]}
            onPress={() => void verify()}
            disabled={verifying || code.length < 6}
          >
            {verifying ? <ActivityIndicator color="#0f0f14" /> : <Text style={styles.primaryLabel}>ログイン</Text>}
          </Pressable>

          <Text style={styles.hint}>
            スマホでメールを見ても、コードをこの画面に入力すればOKです。{'\n'}
            同じ端末なら、メール内のリンクをタップしてもログインできます。{'\n'}
            届かない場合は迷惑メールフォルダもご確認ください。
          </Text>
          <Pressable style={styles.ghost} onPress={() => { setSent(false); setCode(''); setError(null); }}>
            <Text style={styles.ghostLabel}>別のアドレスで送り直す</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Ionicons name="headset-outline" size={48} color="#fbbf24" />
        <Text style={styles.title}>ログイン / 新規登録</Text>
        <Text style={styles.body}>
          メールアドレスだけで始められます。{'\n'}
          パスワードは不要、登録後 7日間は全機能が無料です。
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          inputMode="email"
          onSubmitEditing={() => void submit()}
          editable={!sending}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primary, sending && styles.disabled]}
          onPress={() => void submit()}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#0f0f14" />
          ) : (
            <Text style={styles.primaryLabel}>ログインリンクを送る</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push('/legal')}>
          <Text style={styles.legal}>
            続行することで、<Text style={styles.legalLink}>利用規約とプライバシーポリシー</Text>
            に同意したものとみなされます。
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '800', marginTop: 8 },
  body: { color: '#94a3b8', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  hint: { color: '#64748b', fontSize: 12, textAlign: 'center' },
  input: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f1f5f9',
    fontSize: 16,
    marginTop: 8,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 6,
    paddingVertical: 16,
  },
  primary: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryLabel: { color: '#0f0f14', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  ghost: { paddingVertical: 12, paddingHorizontal: 16 },
  ghostLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  legal: { color: '#475569', fontSize: 11, textAlign: 'center', lineHeight: 18, maxWidth: 360 },
  legalLink: { color: '#94a3b8', textDecorationLine: 'underline' },
});
