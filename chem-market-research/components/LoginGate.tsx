import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/**
 * 共有パスワードによるログイン画面。
 * 認証が通るまで化学品リサーチ機能を表示しないためのゲート。
 */
export default function LoginGate({
  onSubmit,
}: {
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const p = password.trim();
    if (!p || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(p);
    } catch (e: any) {
      setError(e.message || 'ログインに失敗しました。');
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#0b1424', '#0a1a1f', '#0a0a10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={26} color="#67e8f9" />
        </View>
        <Text style={styles.title}>ログイン</Text>
        <Text style={styles.sub}>
          化学品 世界市場リサーチを利用するには、共有パスワードを入力してください。
        </Text>

        <TextInput
          style={styles.input}
          placeholder="パスワード"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="go"
        />

        {error && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color="#f87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0c4a6e" size="small" />
          ) : (
            <Text style={styles.btnText}>ログイン</Text>
          )}
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 22,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.18)',
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(103,232,249,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { color: '#f0f9ff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  sub: {
    color: 'rgba(240,249,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
  input: {
    width: '100%',
    backgroundColor: '#1a1a24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f1f5f9',
    fontSize: 15,
    marginBottom: 14,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  errorText: { color: '#fca5a5', fontSize: 12.5, flex: 1 },
  btn: {
    width: '100%',
    backgroundColor: '#67e8f9',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: { color: '#0c4a6e', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});
