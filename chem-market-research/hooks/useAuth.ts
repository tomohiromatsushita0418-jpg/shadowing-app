import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chem-research:auth-token:v1';

/**
 * 化学品リサーチ機能の共有パスワード認証。
 * /api/login にパスワードを送り、返ってきた検証トークンを AsyncStorage に保存する。
 * 以降の /api/research 呼び出しはこのトークンを x-auth-token ヘッダで送る。
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((t) => setToken(t))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (password: string): Promise<void> => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.token) {
      throw new Error(json.error || `ログインに失敗しました (${res.status})`);
    }
    await AsyncStorage.setItem(STORAGE_KEY, json.token);
    setToken(json.token);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  return { token, ready, login, logout, isAuthed: !!token };
}
