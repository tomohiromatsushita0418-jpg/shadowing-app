# デプロイ手順(Vercel)

化学品 市場リサーチ機能（PubChem 同定 + Gemini レポート + UN Comtrade 実貿易データ
+ 共有パスワードログイン）を Vercel にデプロイする手順です。

## 1. 前提

- GitHub リポジトリ（このリポジトリ）
- Vercel アカウント（無料の Hobby プランで可）
- Google Gemini API キー（[Google AI Studio](https://aistudio.google.com/app/apikey) で取得）

## 2. Vercel プロジェクト作成

1. [Vercel](https://vercel.com/new) で **Import Git Repository** からこのリポジトリを選択
2. Framework Preset は **Other**（`vercel.json` で設定済みのため自動検出に任せて OK）
3. ビルド設定は `vercel.json` が以下を定義済み：
   - Build Command: `npx expo export -p web`
   - Output Directory: `dist`
   - Install Command: `npm install --legacy-peer-deps`
   - Functions: `api/*.js` を `maxDuration: 60`（Gemini + Comtrade の所要時間に対応）

## 3. 環境変数の設定（必須）

Vercel の **Project Settings → Environment Variables** に以下を追加します
（Production / Preview / Development すべてに設定推奨）：

| 変数名 | 用途 | 例 |
| --- | --- | --- |
| `GEMINI_API_KEY` | レポート生成（Gemini） | `AIza...` |
| `SITE_PASSWORD` | リサーチ機能のログイン用 共有パスワード | 任意の文字列 |

> `SITE_PASSWORD` 未設定の場合、ログイン画面は機能せず、`api/research` の
> 認証チェックはスキップされます（＝誰でも利用可能になります）。本番では必ず設定してください。

## 4. デプロイ

環境変数を設定したら **Deploy**（または再デプロイ）。完了後、発行された URL にアクセスし、
化学品タブ → パスワード入力 → 化学品名 or CAS番号で検索、で動作を確認します。

## 5. 動作確認チェックリスト

- [ ] ログイン画面が表示され、正しいパスワードで通過できる
- [ ] 誤ったパスワードで「パスワードが正しくありません。」が出る
- [ ] 例: `ethanol` または `64-17-5` で同定情報（PubChem）が表示される
- [ ] 市場レポート（用途・サプライヤー・ユーザー・関税 等）が生成される
- [ ] 「実貿易データ(UN Comtrade)」カードに世界輸出入額・エリア別・主要国が出る
      （Comtrade に当該HSのデータが無い場合はこのカードのみ非表示）
- [ ] 「このレポートを印刷 / PDF保存」で PDF 化できる

## 補足

- UN Comtrade はキー不要の公開 preview エンドポイントを利用しています（レート制限あり）。
  データのラグを考慮し直近3年を順に試行します。
- ローカル開発では `vercel dev` を使うと `/api/*` 関数も含めて動作確認できます。
  `.env` に `GEMINI_API_KEY` と `SITE_PASSWORD` を設定してください（`.env.example` 参照）。
