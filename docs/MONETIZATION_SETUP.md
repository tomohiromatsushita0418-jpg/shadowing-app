# サブスク課金の有効化手順

コードは実装済みです。以下はあなたのアカウント作業のみ。
**全部終わるまでペイウォールは作動しません**（`EXPO_PUBLIC_PAYWALL_ENABLED` が `true` になるまで、今まで通り全機能が開いたままです）。

所要時間の目安: 初回 60〜90分。

---

## 0. 先に確認すること

- [ ] **勤務先の副業規定**。有料サービスの運営は事業所得になります。ここが通らないと以下は全部無駄になるので最初に確認してください。
- [ ] **特定商取引法に基づく表記**。個人で継続課金を行う場合、氏名・住所・連絡先の開示義務があります（「請求があったら遅滞なく開示する」旨の記載での運用が一般的）。`app/legal.tsx` にテンプレートを置いてあるので、TODO を埋めてください。Stripe の審査でもこのページの URL を聞かれます。

---

## 1. Supabase（認証とユーザーDB）

1. https://supabase.com でプロジェクトを作成（Region: **Northeast Asia (Tokyo)**）。
2. Dashboard → **SQL Editor** → New query に `supabase/schema.sql` の中身を全部貼って Run。
   - `profiles` テーブル、RLS、新規登録時に7日トライアルを自動付与するトリガーが作られます。
3. **Authentication → URL Configuration**:
   - Site URL: `https://shadowing-app-gray.vercel.app`
   - Redirect URLs に追加:
     - `https://shadowing-app-gray.vercel.app/login`
     - `http://localhost:8081/login`（ローカル確認用）
4. **Authentication → Providers → Email** で「Enable Email provider」をオン、**Confirm email** はオンのままで構いません（マジックリンク方式なのでパスワードは使いません）。
5. **Project Settings → API** から控える:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL` と `SUPABASE_URL`
   - `anon public` キー → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY` （**絶対に公開しないこと**。EXPO_PUBLIC_ を付けてはいけません）

> Supabase 無料枠のメール送信は 1時間あたり数通の制限があります。ユーザーが増えたら
> Authentication → Emails → SMTP Settings で Resend か SendGrid を繋いでください。

---

## 2. Stripe（決済）

1. https://dashboard.stripe.com でアカウント作成 → 本人確認と銀行口座の登録。
2. **まずテストモードのまま進めます**（右上のトグル）。
3. **商品カタログ → 商品を追加**:
   - 商品名: `Shadowing App Pro`
   - 料金1: **¥680 / 月** 継続 → 作成後の `price_xxx` を `STRIPE_PRICE_MONTHLY` へ
   - 料金2: **¥5,800 / 年** 継続 → `price_xxx` を `STRIPE_PRICE_YEARLY` へ
   - 通貨は **JPY**。日本円は最小単位が「円」なので、金額欄には `680` / `5800` と入れます。
4. **開発者 → APIキー** → シークレットキー（`sk_test_...`）を `STRIPE_SECRET_KEY` へ。
5. **開発者 → Webhook → エンドポイントを追加**:
   - URL: `https://shadowing-app-gray.vercel.app/api/stripe-webhook`
   - 送信するイベント:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - 作成後に表示される **署名シークレット**（`whsec_...`）を `STRIPE_WEBHOOK_SECRET` へ。
6. **設定 → カスタマーポータル** を有効化し、「サブスクリプションのキャンセルを許可」をオンに。
   （これで解約画面を自前で作らずに済みます。）

---

## 3. Vercel（環境変数）

Project → Settings → Environment Variables に、`.env.example` に並んでいる変数を
**Production / Preview / Development の全環境**に設定します。

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MONTHLY
STRIPE_PRICE_YEARLY
APP_URL
EXPO_PUBLIC_PAYWALL_ENABLED     ← まだ false のまま
```

保存したら **Deployments → 最新のものを Redeploy**。
`EXPO_PUBLIC_*` はビルド時にバンドルへ焼き込まれるため、再デプロイしないと反映されません。

---

## 4. 動作確認（テストモードのまま）

1. `https://shadowing-app-gray.vercel.app/login` を開き、自分のメールで登録。
2. 届いたリンクをタップ → `/account` でトライアル残り7日と表示されること。
3. Supabase → Table Editor → `profiles` に行ができ、`plan = trial` になっていること。
4. `/paywall` → 「購読をはじめる」→ Stripe のテストカード `4242 4242 4242 4242`
   （有効期限は未来の任意の日付、CVC は任意の3桁）で決済。
5. `/account` に戻り「購読中」と次回更新日が出ること。
   `profiles.plan` が `pro` に変わっていること。
6. Stripe → 開発者 → Webhook → 該当エンドポイントで、送信が **200** で成功していること。
   ここが失敗していると、支払ったのに開放されないという最悪の状態になります。
7. カスタマーポータルから解約 → `cancel_at_period_end` が `true` になること。

### うまくいかないとき
| 症状 | 見るところ |
| --- | --- |
| 決済したのに `trial` のまま | Stripe の Webhook ログ。401/500 なら Vercel の Function ログへ |
| `/api/checkout` が 401 | ログインしていない／トークン期限切れ。再ログインで解消 |
| `/api/*` が 404 | `vercel.json` の rewrite が `/((?!api/).*)` になっているか確認 |
| マジックリンクが弾かれる | Supabase の Redirect URLs にそのオリジンが登録されているか |

---

## 5. 本番に切り替える

1. Stripe を**本番モード**に切り替え、商品・料金・Webhook を本番側でも同じ手順で作り直す
   （テストモードと本番モードはデータが完全に別です）。
2. 本番の `sk_live_...` / `whsec_...` / `price_...` で Vercel の環境変数を上書き。
3. `app/legal.tsx` の TODO を実際の情報で埋める。
4. **`EXPO_PUBLIC_PAYWALL_ENABLED=true`** に変更 → Redeploy。
5. ここで初めて課金が始まります。

---

## 設計のメモ

- **7日トライアルはカード登録不要**。サインアップ時点で `profiles.trial_ends_at` に
  7日後が入るだけで、Stripe は一切関与しません。カードを求めるのは実際に課金する瞬間のみで、
  登録のハードルを最小化しています。
- **最新3エピソードは未ログインでも開きます**（`lib/access.ts` の `FREE_PREVIEW_TOPICS`）。
  検索や SNS から来た人が音声を聴く前に締め出されると、集客の投資が全部無駄になるためです。
- **Web で課金しているのは意図的**です。App Store 経由だと手数料が 15〜30% ですが、
  Web + Stripe なら 3.6% で済みます。
- 権限判定のルールは `lib/entitlement.ts` の `entitlementOf()` 一箇所にあり、
  アプリ・API・SQL（`public.has_access()`）がすべてこれに従います。
