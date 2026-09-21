# 集客システムの有効化手順

実装済みのもの:

| システム | 中身 | 状態 |
| --- | --- | --- |
| SEOサイト | `seo/` — 613ページを既存データから静的生成 | ドメイン設定待ち |
| 日次記事 | `scripts/generateArticle.ts` → `seo/content/` | 動作確認済み |
| X / Threads 自動投稿 | `scripts/social/` — 1日3投稿 | APIキー待ち |
| YouTube Shorts | `scripts/social/video.ts` + `youtube.ts` | **GitHub Actions上で要検証** |

---

## 1. SEOサイトを公開する

### Vercelに2つめのプロジェクトを作る

1. Vercel → Add New → Project → 同じ `shadowing-app` リポジトリを選択
2. **Root Directory** に `seo` を指定
3. **Include source files outside of the Root Directory** を **ON**
   （`seo/build.ts` が `../data/topics.json` を読むため、これが無いとビルドが失敗します）
4. Framework Preset は **Other**（`seo/vercel.json` の設定が使われます）
5. 環境変数:
   ```
   SITE_URL   = https://<このサイトのドメイン>
   APP_URL    = https://shadowing-app-gray.vercel.app
   ```
6. デプロイ

### 独自ドメインに移す（後からでOK）

サイト内のURLはすべて `SITE_URL` から組み立てているので、ドメインを取ったら:

1. Vercel → Domains でドメインを追加
2. 環境変数 `SITE_URL` を新ドメインに変更
3. Redeploy

コードの変更は不要です。**Search Console への登録はドメインを決めてから**にしてください
（先に vercel.app で登録すると、移行時にインデックスを取り直すことになります）。

### Search Console

1. https://search.google.com/search-console でプロパティを追加
2. 所有権確認の HTML タグの content 値を、Vercelの環境変数 `GOOGLE_SITE_VERIFICATION` に設定 → Redeploy
3. サイトマップに `sitemap.xml` を送信
4. アクセス解析を入れる場合は `GA_MEASUREMENT_ID`（`G-` で始まる値）も設定

> **効果が出るまで3〜6か月かかります。** 最初の1か月はインデックス登録すらされないことが普通です。
> ここで焦って記事を量産すると逆効果なので、1日1本のペースを守ってください。

---

## 2. GitHub Secrets

`Settings → Secrets and variables → Actions` に追加:

| Secret | 用途 | 必須 |
| --- | --- | --- |
| `SITE_URL` | 投稿内のリンク先 | 推奨 |
| `X_API_KEY` `X_API_SECRET` `X_ACCESS_TOKEN` `X_ACCESS_SECRET` | X投稿 | 任意 |
| `THREADS_USER_ID` `THREADS_ACCESS_TOKEN` | Threads投稿 | 任意 |
| `YOUTUBE_CLIENT_ID` `YOUTUBE_CLIENT_SECRET` `YOUTUBE_REFRESH_TOKEN` | Shorts投稿 | 任意 |
| `YOUTUBE_PRIVACY` | `public` / `unlisted` / `private`（既定 `unlisted`） | 任意 |

未設定のプラットフォームは自動でスキップされるので、できたものから順に有効化できます。

### X（Twitter）

1. https://developer.x.com でアプリを作成（Free tier で可）
2. **User authentication settings** で App permissions を **Read and write** に設定
   （これを後から変えた場合、アクセストークンを再生成しないと投稿できません）
3. Keys and tokens タブから4つの値を取得:
   - API Key → `X_API_KEY`
   - API Key Secret → `X_API_SECRET`
   - Access Token → `X_ACCESS_TOKEN`
   - Access Token Secret → `X_ACCESS_SECRET`

無料枠は**月500投稿**。1日3投稿＝月90投稿なので十分です。

### Threads

1. https://developers.facebook.com でアプリを作成し、Threads API を追加
2. Threadsアカウントを接続して長期アクセストークン（60日）を取得
3. `THREADS_USER_ID` と `THREADS_ACCESS_TOKEN` を設定

> トークンは60日で失効します。`GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=<token>`
> で延長できるので、カレンダーに2か月ごとのリマインダーを入れてください。

### YouTube

1. Google Cloud Console → 新規プロジェクト → **YouTube Data API v3** を有効化
2. OAuth 同意画面を設定（外部・テストユーザーに自分を追加）
3. OAuth クライアントID（デスクトップアプリ）を作成
4. スコープ `https://www.googleapis.com/auth/youtube.upload` でリフレッシュトークンを取得
   （[OAuth 2.0 Playground](https://developers.google.com/oauthplayground) が手軽です。
   歯車マークで自分のクライアントID/シークレットを使う設定にしてください）

アップロードは1本あたり1,600クォータ、1日の上限10,000 → **1日6本まで**。

---

## 3. 動作確認の順番

```bash
# 1. サイトをローカルで生成して見る
npx tsx seo/build.ts && npx --yes serve seo/dist
```

```bash
# 2. 投稿内容を投稿せずに確認する
SOCIAL_DRY_RUN=1 npx tsx scripts/social/post.ts
```

3. GitHub Actions → **Social Post** → Run workflow → `dry_run` を `1` のまま実行してログを確認
4. 問題なければ `dry_run` を `0` にして1回実行し、実際に投稿されるか確認
5. GitHub Actions → **YouTube Short** → Run workflow → `upload` を `false` で実行し、
   生成された `short-mp4` アーティファクトをダウンロードして**動画を自分の目で確認**
6. 納得できたら `upload=true` で実行 → `youtube-short.yml` のスケジュール行のコメントを外す

> **動画パイプラインはこのMac上では一度も実行できていません**（ffmpegが入っていないため）。
> 必ず手順5でアーティファクトを確認してから自動化してください。字幕の改行位置やフォントの
> 見え方は、実際の出力を見ないと調整できません。

---

## 4. 各システムの稼働タイミング

| 時刻 (JST) | 何が動くか |
| --- | --- |
| 00:00 | エピソード生成（既存の `daily-topics.yml`） |
| 02:00 | 解説記事を生成 → コミット → SEOサイトが自動再デプロイ |
| 07:30 | X / Threads に「今日の表現」を投稿 |
| 12:30 | X / Threads に「英作文クイズ」を投稿 |
| 20:30 | X / Threads に「エピソード告知」を投稿 |

---

## 設計のメモ：なぜ記事を量産しないのか

Googleは2024年以降、**scaled content abuse**（検索順位の操作を主目的とした大量生成コンテンツ）を
サイト単位でインデックスから削除しています。汎用キーワードのAI記事を1日に何本も出すのは、
この方針の直撃コースです。

このシステムが安全なのは、**扱う題材が自分たちで作った一次データに限定されている**からです:

- エピソードページ（123本）— 自前の英文・和訳・表現解説
- 表現集（105ページ）— 実際に教材に登場した3,944表現を、出典の例文つきで分野別に収録
- 解説記事（1日1本）— その日のエピソードに**実際に出てくる英文だけ**を扱うようプロンプトで制約

記事生成は本文が900字未満なら**publishせずにエラーで止まります**（`scripts/generateArticle.ts`）。
薄いページを1枚足すより、その日は何も出さないほうがドメイン全体にとって得だからです。
同じ理由で、サイト生成側も本文600字未満のページには自動で `noindex` を付けます。

1ページあたりの個別フレーズページを作っているのは、例文が2件以上ある426語だけです。
残りはコレクションページの中だけに存在します。
