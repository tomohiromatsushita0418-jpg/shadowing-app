# Chem Market Research / 化学品 世界市場リサーチ

化学品名 または CAS番号 を入力すると、世界市場の数量・サプライヤー・ユーザー・単価・
エリア/国別・関税・輸出入通関までを網羅したレポートを自動生成する、自己完結型の
Expo (React Native Web) アプリです。共有パスワードでアクセスを保護します。

これは英語シャドーイングアプリから切り出した独立アプリで、化学品リサーチ機能のみを含みます。

## 機能

- **PubChem 同定**(無料・キー不要): 化学品名/CAS番号から分子式・分子量・IUPAC名・構造式画像を取得
- **Gemini レポート**(`gemini-2.5-flash`): 世界市場規模・地域別/国別シェア・主要サプライヤー・
  需要業界・単価・関税・通関・規制などを構造化 JSON で生成
- **UN Comtrade 実貿易データ**(無料・キー不要): 推定 HSコード(6桁)に基づく実際の
  輸出入額・数量(世界 / 主要国 / エリア別 / 日本)
- **検証用リンク**: UN Comtrade / ITC Trade Map / 財務省貿易統計・税関 / NITE-CHRIP への
  HSコード付きディープリンク
- **共有パスワード認証**: `SITE_PASSWORD` と照合し SHA-256 トークンを発行。`/api/research` は
  毎回トークンを検証
- **印刷 / PDF 保存**(Web): レポートをそのまま印刷・PDF 化

## 構成

```
app/
  _layout.tsx      # 単一画面用のルートレイアウト
  index.tsx        # ホーム画面(化学品リサーチ UI)
api/
  login.js         # 共有パスワード認証(Vercel Serverless Function)
  research.js      # PubChem + Gemini + UN Comtrade + 検証リンク
components/
  LoginGate.tsx    # ログイン画面
hooks/
  useAuth.ts       # トークンの保存・検証ヘルパー
```

## 必要な環境変数

| 変数名 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | 市場レポート生成(Gemini API。`gemini-2.5-flash` を使用) |
| `SITE_PASSWORD` | サイトのログイン用 共有パスワード |

ローカル開発では `.env.example` を `.env` にコピーして値を設定してください。
本番(Vercel)では、上記 2 つを **プロジェクトの環境変数** に設定します。

## ローカル開発

```bash
npm install --legacy-peer-deps
npm run web        # Expo を Web で起動
```

API ルート(`/api/*`)は Vercel のサーバーレス関数として動作します。
ローカルで API も含めて動かす場合は `vercel dev` の利用を推奨します。

```bash
npx vercel dev
```

## 型チェック / ビルド

```bash
npm run typecheck   # tsc --noEmit
npm run build:web   # expo export -p web
```

## デプロイ(Vercel)

1. このリポジトリを Vercel にインポート
2. 環境変数 `GEMINI_API_KEY` と `SITE_PASSWORD` を設定
3. デプロイ(`vercel.json` によりビルド・出力・API 関数の `maxDuration: 60` が設定済み)

## 注意

- Gemini が生成する市場数値は公開情報・業界知識に基づく **推定値** です。一次データの
  確認には、アプリ内の検証リンク(UN Comtrade / 財務省貿易統計 等)をご利用ください。
- UN Comtrade のデータには 1〜2 年のラグがあるため、直近の取得可能な年を自動的に使用します。
