# Shadowing App

英語シャドーイング学習用の React Native (Expo SDK 54) アプリです。
GPT-4o による毎日のトピック自動生成、OpenAI TTS による自然な音声、
Vercel への Web デプロイ、GitHub Actions による日次自動化に対応しています。

加えて、**化学品 世界市場リサーチ**機能を搭載しています(後述)。

---

## 化学品 世界市場リサーチ

ホーム画面の「化学品 世界市場リサーチ」ボタン、または `/chemical` から利用できます。
**化学品名 または CAS番号** を入力すると、以下を含む網羅的な市場レポートを生成します。

- **同定情報(実データ)**: [PubChem](https://pubchem.ncbi.nlm.nih.gov/) から
  CAS番号・分子式・分子量・IUPAC名・構造式画像を取得(APIキー不要)
- **世界市場**: 世界需要量・市場規模(USD)・CAGR
- **エリア別 / 各国別**: 地域シェア・主要生産/消費国の数量
- **サプライヤー / ユーザー**: 主要メーカーと需要業界・用途別シェア・単価(価格動向)
- **関税・輸出入通関**: 推定 HSコード、主要輸出入国、関税率、通関留意点、日本の輸出入
- **実貿易データ(実数値)**: 推定 HSコードを基に **UN Comtrade** の公開エンドポイント
  (キー不要)から、対象年の **世界輸出入額・エリア別シェア・主要輸出入国ランキング・
  日本の輸出入**を実数値で取得して表示します(取得できない場合はこのカードのみ非表示)
- **印刷 / PDF保存**: レポートをワンクリックで印刷・PDF 化(web)。操作UIは印刷時に自動で非表示
- **実データで検証**: HSコードを基に **UN Comtrade / ITC Trade Map /
  財務省 貿易統計(税関)/ 実行関税率表** へのディープリンクを自動生成し、
  一次データで数量・金額・関税を直接確認できます
- **化学品の詳細・法規制**: [NITE-CHRIP](https://www.nite.go.jp/chem/chrip/chrip_search/systemTop)
  (化学物質総合情報提供システム)への導線。CAS番号で化審法・安衛法・化管法・
  REACH・TSCA 等の規制を横断的に確認できます

### ログイン(共有パスワード)

化学品リサーチ機能は共有パスワードで保護されています。
未ログイン時はパスワード入力画面が表示され、正しいパスワードを入力すると利用できます。

- フロー: パスワード入力 → `api/login` が環境変数 `SITE_PASSWORD` と照合 →
  検証トークン(SHA-256)を発行 → クライアントは `api/research` 呼び出し時に
  `x-auth-token` で送信し、サーバが毎回検証します(パスワード平文は端末に保存されません)。
- **環境変数 `SITE_PASSWORD` を Vercel に設定してください。** 未設定の場合、
  ログインは機能せず、`api/research` の認証チェックはスキップされます。

> 市場数値は公開情報・業界知識に基づく AI 推定です(信頼度ラベル付き)。
> 厳密な一次データは上記の検証リンク先(公的・公開DB)でご確認ください。

### 仕組み

- フロント: `app/chemical.tsx`(検索 UI とレポート表示)
- バックエンド: `api/research.js`(Vercel Serverless Function)
  - PubChem で化学品を同定 → Gemini (`gemini-2.5-flash`) で市場レポートを生成 →
    UN Comtrade から実貿易データを取得 → 貿易統計DBの検証リンクを構築
  - Gemini + Comtrade の所要時間に対応するため `vercel.json` で `maxDuration: 60` を設定
  - 認証: `api/login.js`(共有パスワード照合 → トークン発行)
- Vercel では `/api` 配下が自動的に Serverless Function としてデプロイされます。
  **Vercel の Project Settings → Environment Variables に以下を設定してください。**
  - `GEMINI_API_KEY` … レポート生成(必須)
  - `SITE_PASSWORD` … 化学品リサーチのログイン用 共有パスワード(必須)
- 詳細なデプロイ手順は [`DEPLOY.md`](./DEPLOY.md) を参照してください。

---

## セットアップ

```bash
npm install --legacy-peer-deps
```

### 環境変数

ローカルで生成スクリプトを動かすには `OPENAI_API_KEY` が必要です。
プロジェクト直下に `.env` を作成してください（`.env.example` を参照）。

```bash
cp .env.example .env
# .env を編集して sk-... のキーを設定
```

スクリプト実行時はシェルから読み込めるように、たとえば次のように起動します。

```bash
export $(grep -v '^#' .env | xargs)
npm run generate:topics
```

---

## アプリの起動

```bash
npx expo start
```

iOS / Android / Web のいずれでも起動できます。
Web を試す場合は `w` を押すか `npm run web` を実行してください。

---

## スクリプトの手動実行

```bash
# 新しいトピックを 1 件生成して data/topics.json に追記（カテゴリは日替わりで巡回）
npm run generate:topics

# topics.json のうち音声未生成の文に対して MP3 を assets/audio/ に保存
npm run generate:audio

# 両方を続けて実行
npm run generate:daily
```

- `scripts/generateTopics.ts` … Gemini で「Daily Conversation」「Business」「Current Affairs」「Chemical Industry（化学業界の最新ニュース）」を日替わりで巡回し、1 日 1 件生成
- `scripts/generateAudio.ts` … OpenAI TTS (`tts-1-hd`, voice: `nova`) で 1 文ずつ MP3 を生成

---

## Vercel へのデプロイ

1. リポジトリを Vercel にインポート（Framework Preset は `Other` でも OK）。
2. `vercel.json` が同梱されているため、追加設定は不要です。
   - Build Command: `npx expo export -p web`
   - Output Directory: `dist`
   - Install Command: `npm install --legacy-peer-deps`
3. デプロイすると `dist/` 配下の静的ファイルが配信されます。

ローカルでビルドを試したい場合:

```bash
npm run build:web
```

---

## GitHub Actions（毎日 09:00 JST に自動生成）

`.github/workflows/daily-topics.yml` が毎日 00:00 UTC（= 09:00 JST）に走り、
`generateTopics.ts` → `generateAudio.ts` を実行して
`data/topics.json` と `assets/audio/` をコミットします。

### 必要なシークレット

GitHub リポジトリの **Settings → Secrets and variables → Actions** で以下を設定:

| 名前                  | 用途                                                    |
| --------------------- | ------------------------------------------------------- |
| `OPENAI_API_KEY`      | 必須。GPT-4o / TTS 呼び出し用                           |
| `VERCEL_DEPLOY_HOOK`  | 任意。Vercel の Deploy Hook URL（コミット後に再ビルド）|

ワークフローを手動実行したいときは Actions タブから `workflow_dispatch` を使ってください。

---

## ディレクトリ構成

```
app/                  expo-router ルート
components/           UI コンポーネント
data/topics.json      シャドーイング題材（自動生成で追記される）
data/topics.ts        topics.json を import して export
scripts/              トピック / 音声生成スクリプト
assets/audio/         生成された MP3
.github/workflows/    日次 GitHub Actions
vercel.json           Vercel デプロイ設定
```
