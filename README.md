# Shadowing App

英語シャドーイング学習用の React Native (Expo SDK 54) アプリです。
GPT-4o による毎日のトピック自動生成、OpenAI TTS による自然な音声、
Vercel への Web デプロイ、GitHub Actions による日次自動化に対応しています。

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
# 新しいトピックを 3 件生成して data/topics.json に追記
npm run generate:topics

# topics.json のうち音声未生成の文に対して MP3 を assets/audio/ に保存
npm run generate:audio

# 両方を続けて実行
npm run generate:daily
```

- `scripts/generateTopics.ts` … GPT-4o で「Daily Conversation」「Business」「Current Affairs」各 1 件、計 3 件を生成
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
