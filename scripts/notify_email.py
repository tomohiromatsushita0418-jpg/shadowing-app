#!/usr/bin/env python3
"""
notify_email.py

Sends an email notification when a new shadowing topic has been generated,
with a direct link to open that topic in the deployed web app.

Mirrors the stock_analyzer mailer: Gmail SMTP_SSL (port 465), same secret
names (GMAIL_ADDRESS / GMAIL_APP_PASSWORD / REPORT_TO).

Behaviour:
  - Reads data/topics.json and takes the newest topic.
  - Only sends if that topic's createdAt is "today" in JST (i.e. it was just
    generated in this run). Set FORCE_NOTIFY=1 to send regardless (testing).

Env:
  GMAIL_ADDRESS        sender Gmail address
  GMAIL_APP_PASSWORD   Gmail app password
  REPORT_TO            comma-separated recipient list
  APP_BASE_URL         deployed site base (default https://shadowing-app.vercel.app)
  FORCE_NOTIFY         "1" to bypass the today-check

Run:  python3 scripts/notify_email.py
"""
import json
import os
import smtplib
import sys
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOPICS_PATH = ROOT / "data" / "topics.json"
JST = timezone(timedelta(hours=9))

CATEGORY_COLOR = {
    "Daily Conversation": "#ef4444",
    "Business": "#3b82f6",
    "Current Affairs": "#22c55e",
}


def load_latest_topic():
    if not TOPICS_PATH.exists():
        return None
    topics = json.loads(TOPICS_PATH.read_text(encoding="utf-8") or "[]")
    return topics[-1] if topics else None


def created_today_jst(topic) -> bool:
    raw = topic.get("createdAt")
    if not raw:
        return False
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(JST)
    except ValueError:
        return False
    return dt.date() == datetime.now(JST).date()


def build_html(topic, url: str) -> str:
    title = topic.get("title", "New Topic")
    title_ja = topic.get("titleJa", "")
    category = topic.get("category", "")
    n = len(topic.get("sentences", []))
    today = datetime.now(JST).strftime("%Y年%m月%d日")
    accent = CATEGORY_COLOR.get(category, "#60a5fa")

    return f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#0f0f14;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="letter-spacing:6px;font-size:12px;font-weight:700;color:#fafafa;">ECHO</div>
    <div style="color:#64748b;font-size:13px;margin:4px 0 24px;">{today} ・ 今日のシャドーイング</div>

    <div style="background:#161b27;border:1px solid #1e2d45;border-radius:16px;padding:24px;">
      <span style="display:inline-block;background:rgba(96,165,250,0.12);color:{accent};
                   font-size:12px;font-weight:700;letter-spacing:0.5px;
                   padding:4px 12px;border-radius:12px;">{category}</span>

      <h1 style="color:#f0f9ff;font-size:22px;line-height:1.35;margin:16px 0 6px;">{title}</h1>
      <div style="color:#94a3b8;font-size:15px;margin-bottom:20px;">{title_ja}</div>

      <a href="{url}"
         style="display:inline-block;background:{accent};color:#0b0c14;text-decoration:none;
                font-size:15px;font-weight:800;padding:13px 28px;border-radius:999px;">
        ▶ 今日のトピックを開く
      </a>

      <div style="color:#64748b;font-size:13px;margin-top:18px;">
        全 {n} 文 ・ タップで音声再生、単語タップで意味表示
      </div>
    </div>

    <div style="color:#475569;font-size:12px;margin-top:20px;text-align:center;">
      毎日 0:00 (JST) に新しいトピックが自動生成されます。<br>
      <a href="{url.rsplit('/topic/', 1)[0]}" style="color:#60a5fa;">ホームを開く</a>
    </div>
  </div>
</body></html>"""


def build_plain(topic, url: str) -> str:
    title = topic.get("title", "New Topic")
    title_ja = topic.get("titleJa", "")
    category = topic.get("category", "")
    n = len(topic.get("sentences", []))
    return (
        f"【ECHO 今日のシャドーイング】\n\n"
        f"[{category}] {title}\n{title_ja}\n\n"
        f"全 {n} 文。タップで音声再生、単語タップで意味表示。\n\n"
        f"▶ 今日のトピックを開く:\n{url}\n"
    )


def main() -> int:
    gmail = os.getenv("GMAIL_ADDRESS", "").strip()
    app_pass = os.getenv("GMAIL_APP_PASSWORD", "").strip()
    to_raw = os.getenv("REPORT_TO", "").strip()
    base = os.getenv("APP_BASE_URL", "https://shadowing-app.vercel.app").strip().rstrip("/")

    if not gmail or not app_pass or not to_raw:
        print("メール通知スキップ: GMAIL_ADDRESS / GMAIL_APP_PASSWORD / REPORT_TO が未設定")
        return 0  # don't fail the workflow

    topic = load_latest_topic()
    if not topic:
        print("メール通知スキップ: トピックが見つかりません")
        return 0

    if os.getenv("FORCE_NOTIFY") != "1" and not created_today_jst(topic):
        print(f"メール通知スキップ: 新トピックなし (latest createdAt={topic.get('createdAt')})")
        return 0

    url = f"{base}/topic/{topic['id']}"
    recipients = [e.strip() for e in to_raw.split(",") if e.strip()]
    subject = f"【ECHO 今日のシャドーイング】{topic.get('titleJa') or topic.get('title')}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(build_plain(topic, url), "plain", "utf-8"))
    msg.attach(MIMEText(build_html(topic, url), "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail, app_pass)
            server.sendmail(gmail, recipients, msg.as_string())
        print(f"通知メール送信完了: {', '.join(recipients)} -> {url}")
        return 0
    except Exception as e:
        print(f"メール送信失敗: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
