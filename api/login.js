/**
 * api/login.js — Vercel Serverless Function
 *
 * サイトの「化学品 市場リサーチ」機能を共有パスワードで保護する。
 * 環境変数 SITE_PASSWORD と照合し、一致したら検証用トークン(SHA-256ハッシュ)を返す。
 * クライアントはこのトークンを保存し、/api/research 呼び出し時に x-auth-token として送る。
 * サーバ側は毎回 SITE_PASSWORD のハッシュと突き合わせて検証するため、
 * パスワード平文はクライアントに保存されない。
 *
 * Env: SITE_PASSWORD (必須・サイトの共有パスワード)
 */

const crypto = require('crypto');

function tokenFor(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST のみ対応しています。' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const password = (body?.password || '').toString();

    const expected = process.env.SITE_PASSWORD;
    if (!expected) {
      res.status(500).json({
        error: 'サーバーに SITE_PASSWORD が設定されていません。Vercel の環境変数を確認してください。',
      });
      return;
    }

    // タイミング攻撃を避けるため固定長ハッシュ同士を比較
    const ok =
      password.length > 0 &&
      crypto.timingSafeEqual(Buffer.from(tokenFor(password)), Buffer.from(tokenFor(expected)));

    if (!ok) {
      res.status(401).json({ error: 'パスワードが正しくありません。' });
      return;
    }

    res.status(200).json({ token: tokenFor(expected) });
  } catch (err) {
    res.status(500).json({ error: `ログイン処理に失敗しました: ${err.message}` });
  }
};

module.exports.tokenFor = tokenFor;
