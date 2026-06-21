# 化学品 世界市場リサーチ (Chem Market Research)

化学品名 または CAS番号 から、世界市場レポートを自動生成する独立アプリ。
（英語シャドーイングアプリとは別リポジトリ・別サイトとして運用します）

- **同定 (実データ)**: PubChem で CAS番号・分子式・別名を同定
- **市場レポート**: Gemini (`gemini-2.5-flash`) で用途・サプライヤー・ユーザー・単価・
  エリア/国別・関税・輸出入通関を生成
- **実貿易データ (実数値)**: UN Comtrade の公開エンドポイント（キー不要）から、
  対象年の世界輸出入額・エリア別シェア・主要輸出入国・日本の輸出入を実数値で取得
- **法規制**: NITE-CHRIP（化学物質総合情報提供システム）への導線
- **ログイン不要**: 誰でもそのまま利用可能
- **印刷 / PDF保存**: レポートをワンクリックで PDF 化（web）

## 構成

- フロント: Expo Router (React Native Web) — `app/index.tsx` がリサーチ画面
- バックエンド: Vercel Serverless Functions
  - `api/research.js` … PubChem 同定 → Gemini レポート → UN Comtrade 実データ → 検証リンク
- `vercel.json` で `api/*.js` を `maxDuration: 60` に設定

## デプロイ (Vercel)

1. このリポジトリを Vercel に Import（Framework: Other）
2. **Environment Variables** を設定:
   - `GEMINI_API_KEY` … レポート生成（必須）
3. Deploy。`vercel.json` がビルド設定（`expo export -p web` → `dist`）を定義済み。

ローカル開発は `npm install --legacy-peer-deps` の後、`vercel dev`（`/api/*` も動作）。
`.env` に `GEMINI_API_KEY` を設定してください（`.env.example` 参照）。
