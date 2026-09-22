-- お問い合わせ・ご要望ボックス用テーブル
-- Supabase の SQL Editor に貼って Run してください（1回だけ）。
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete set null,
  email        text,
  kind         text not null default 'other'  check (kind in ('bug','request','other')),
  message      text not null,
  status       text not null default 'new'    check (status in ('new','notified','done','dismissed')),
  device       text
);

alter table public.feedback enable row level security;

-- 誰でも（ログイン有無問わず）投稿は作成できる。閲覧・更新はサーバー(service_role)のみ。
drop policy if exists feedback_insert_any on public.feedback;
create policy feedback_insert_any on public.feedback
  for insert with check (true);

create index if not exists feedback_status_idx on public.feedback (status, created_at);
