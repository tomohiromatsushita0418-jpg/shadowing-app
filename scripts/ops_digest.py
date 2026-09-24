#!/usr/bin/env python3
"""
ops_digest.py — 毎日の運営ダッシュボードをメール送信する。

内容:
  1. 稼働チェック（サイト / 最新エピソード / 音声 / 決済API）
  2. 教材生成の成否（topics.json の最新 createdAt が当日か）
  3. 新着お問い合わせ・ご要望を Gemini が「対応可否・方法」まで分析
本文=HTML、送信=Gmail SMTP（daily-topics と同じ仕組み）。

Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   … feedback の読み書き
  GEMINI_API_KEY                            … 分析
  GMAIL_ADDRESS, GMAIL_APP_PASSWORD, REPORT_TO
  APP_BASE_URL (default https://shadowing-app-gray.vercel.app)
"""
import json, os, smtplib, ssl, sys, urllib.request, urllib.error
from urllib.parse import quote
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JST = timezone(timedelta(hours=9))
BASE = os.getenv("APP_BASE_URL", "https://shadowing-app-gray.vercel.app").rstrip("/")
UA = {"User-Agent": "Mozilla/5.0"}


def http(url, method="GET", headers=None, data=None):
    h = dict(UA); h.update(headers or {})
    body = json.dumps(data).encode() if data is not None else None
    if body is not None: h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, None
    except Exception as e:
        return 0, str(e)


def code_only(url, method="GET"):
    try:
        req = urllib.request.Request(url, method=method, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


# ---------- 1 & 2: health ----------
def health():
    checks = []
    checks.append(("サイト", code_only(BASE)))
    topics = json.loads((ROOT / "data" / "topics.json").read_text())
    latest = topics[-1]
    checks.append(("最新エピソード", code_only(f"{BASE}/topic/{latest['id']}")))
    # newest audio (either ext)
    audio = latest["sentences"][0].get("audioPath", "")
    if audio:
        checks.append(("音声配信", code_only(f"{BASE}/{audio.lstrip('./')}")))
    # checkout API alive → 401 (unauthorized) is healthy
    checks.append(("決済API", code_only(f"{BASE}/api/checkout", "POST")))

    created = latest.get("createdAt", "")
    fresh = False
    try:
        d = datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone(JST)
        fresh = d.date() == datetime.now(JST).date()
    except Exception:
        pass
    return checks, latest, fresh, len(topics)


# ---------- 3: feedback ----------
def fetch_feedback():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return None
    s, rows = http(
        f"{url}/rest/v1/feedback?status=eq.new&select=id,created_at,kind,message,email&order=created_at.asc",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    return rows if isinstance(rows, list) else []


def analyze(message, kind):
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return None
    prompt = f"""あなたは英語学習アプリ「Resound」のプロダクト責任者の補佐です。
アプリは「シャドーイング/瞬間英作文/熟語」の3機能に絞ったサブスク(Web,Expo/React Native,Supabase,Stripe)。
以下のユーザーからの{('不具合報告' if kind=='bug' else 'ご要望' if kind=='request' else '意見')}を分析し、JSONだけ返す:
「{message}」
{{
 "summary": "一文要約",
 "feasibility": "high" | "medium" | "low" | "no",   // 実装/対応の現実性
 "effort": "小" | "中" | "大",
 "approach": "対応方法・実装方針を1-2文で（日本語）",
 "recommend": "run" | "hold" | "decline"            // 運営への推奨
}}"""
    s, j = http(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}",
        method="POST",
        data={"contents": [{"role": "user", "parts": [{"text": prompt}]}],
              "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"}},
    )
    try:
        t = j["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(t)
    except Exception:
        return None


def mark_notified(ids):
    url = os.getenv("SUPABASE_URL", "").rstrip("/"); key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    for fid in ids:
        http(f"{url}/rest/v1/feedback?id=eq.{fid}", method="PATCH",
             headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"},
             data={"status": "notified"})


# ---------- funnel analytics ----------
def _sb(path):
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return None
    s, rows = http(f"{url}/rest/v1/{path}",
                   headers={"apikey": key, "Authorization": f"Bearer {key}"})
    return rows if isinstance(rows, list) else []


def fetch_funnel():
    """閲覧(SEO) → アプリ流入(source別) → 新規登録 → 課金 の24時間ファネル。"""
    since = quote((datetime.now(timezone.utc) - timedelta(hours=24)).replace(microsecond=0).isoformat())
    visits = _sb(f"visits?created_at=gte.{since}&select=kind,source&limit=100000")
    if visits is None:
        return None
    seo_views = sum(1 for v in visits if v.get("kind") == "seo_view")
    app_visits = [v for v in visits if v.get("kind") == "app_visit"]
    by_source = {}
    for v in app_visits:
        by_source[v.get("source") or "direct"] = by_source.get(v.get("source") or "direct", 0) + 1
    signups = _sb(f"profiles?created_at=gte.{since}&select=id&limit=100000") or []
    conversions = _sb(f"profiles?plan=eq.pro&updated_at=gte.{since}&select=id&limit=100000") or []
    total_pro = _sb("profiles?plan=eq.pro&select=id&limit=100000") or []
    return {
        "seo_views": seo_views,
        "app_visits": len(app_visits),
        "by_source": by_source,
        "signups": len(signups),
        "conversions": len(conversions),
        "total_pro": len(total_pro),
    }


def fetch_threads_views():
    """直近24時間に投稿したThreads各件のview数を合計（要 threads_manage_insights）。"""
    uid = os.getenv("THREADS_USER_ID", "")
    tok = os.getenv("THREADS_ACCESS_TOKEN", "")
    if not uid or not tok:
        return None
    since = int((datetime.now(timezone.utc) - timedelta(hours=24)).timestamp())
    s, j = http(f"https://graph.threads.net/v1.0/{uid}/threads?fields=id,timestamp&since={since}&limit=50&access_token={tok}")
    if not isinstance(j, dict):
        return None
    total, counted = 0, 0
    for p in j.get("data", []):
        pid = p.get("id")
        if not pid:
            continue
        s2, ins = http(f"https://graph.threads.net/v1.0/{pid}/insights?metric=views&access_token={tok}")
        try:
            for m in ins.get("data", []):
                if m.get("name") == "views":
                    tv = (m.get("total_value") or {}).get("value")
                    if tv is None and m.get("values"):
                        tv = sum(v.get("value", 0) for v in m["values"])
                    total += tv or 0
                    counted += 1
        except Exception:
            pass
    return {"views": total, "posts": counted}


def analyze_funnel(f):
    key = os.getenv("GEMINI_API_KEY", "")
    if not key or not f:
        return None
    prompt = f"""あなたは英語学習サブスク「Resound」のグロース担当です。
直近24時間のファネル数値:
- SEO記事の閲覧(セッション): {f['seo_views']}
- Threads閲覧: {f.get('threads_views', '未計測')}
- アプリ流入(合計): {f['app_visits']} / 内訳: {json.dumps(f['by_source'], ensure_ascii=False)}
- 新規登録: {f['signups']}
- 新規課金(pro化): {f['conversions']}
- 現在の有料会員合計: {f['total_pro']}
集客経路はSEOサイト(learn.resound.study)とThreads(@syosyaman_no_eigo)の無料2本のみ。
次のJSONだけ返す:
{{
 "summary": "今日のファネルの一言講評（日本語）",
 "bottleneck": "最も詰まっている段階と理由（日本語1文）",
 "suggestions": ["改善案1（具体・すぐ実行可能）", "改善案2"]
}}"""
    s, j = http(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}",
        method="POST",
        data={"contents": [{"role": "user", "parts": [{"text": prompt}]}],
              "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"}},
    )
    try:
        return json.loads(j["candidates"][0]["content"]["parts"][0]["text"])
    except Exception:
        return None


# ---------- compose + send ----------
FEAS = {"high": "#34d399", "medium": "#fbbf24", "low": "#f59e0b", "no": "#f87171"}
REC = {"run": "対応推奨", "hold": "保留", "decline": "見送り推奨"}


def build_funnel_html(f, fa):
    if f is None:
        return '<p style="color:#f59e0b">※ 計測データを取得できません（Supabase未設定）。</p>'
    src = "".join(
        f'<tr><td style="padding:3px 10px;color:#94a3b8">{k}</td>'
        f'<td style="padding:3px 10px;color:#e2e8f0;font-weight:700">{v}</td></tr>'
        for k, v in sorted(f["by_source"].items(), key=lambda x: -x[1])
    ) or '<tr><td style="padding:3px 10px;color:#64748b" colspan="2">流入なし</td></tr>'
    ana = ""
    if fa:
        sug = "".join(f"<li>{s}</li>" for s in (fa.get("suggestions") or []))
        ana = f"""<div style="background:#161b27;border-radius:8px;padding:12px 14px;margin-top:10px;color:#cbd5e1;font-size:13px;line-height:1.7">
          <b>講評:</b> {fa.get('summary','-')}<br>
          <b>ボトルネック:</b> {fa.get('bottleneck','-')}<br>
          <b>改善提案:</b><ul style="margin:6px 0 0 18px;padding:0">{sug}</ul>
        </div>"""
    tv_row = ""
    if f.get("threads_views") is not None:
        tv_row = (f'<tr><td style="padding:4px 10px;color:#94a3b8">Threads 閲覧（{f.get("threads_posts",0)}投稿）</td>'
                  f'<td style="padding:4px 10px;color:#e2e8f0;font-weight:700">{f["threads_views"]}</td></tr>')
    return f"""
    <table style="border-collapse:collapse;background:#111827;border-radius:8px;width:100%">
      <tr><td style="padding:4px 10px;color:#94a3b8">SEO記事 閲覧</td><td style="padding:4px 10px;color:#e2e8f0;font-weight:700">{f['seo_views']}</td></tr>
      {tv_row}
      <tr><td style="padding:4px 10px;color:#94a3b8">アプリ流入（合計）</td><td style="padding:4px 10px;color:#e2e8f0;font-weight:700">{f['app_visits']}</td></tr>
      <tr><td style="padding:4px 10px;color:#94a3b8">新規登録</td><td style="padding:4px 10px;color:#e2e8f0;font-weight:700">{f['signups']}</td></tr>
      <tr><td style="padding:4px 10px;color:#94a3b8">新規課金</td><td style="padding:4px 10px;color:#34d399;font-weight:800">{f['conversions']}</td></tr>
      <tr><td style="padding:4px 10px;color:#94a3b8">有料会員 合計</td><td style="padding:4px 10px;color:#fbbf24;font-weight:800">{f['total_pro']}</td></tr>
    </table>
    <div style="color:#64748b;font-size:12px;margin:8px 0 4px">流入の内訳（経路別）</div>
    <table style="border-collapse:collapse;background:#111827;border-radius:8px">{src}</table>
    {ana}"""


def build_html(checks, latest, fresh, total, fb_items, funnel=None, funnel_ana=None):
    today = datetime.now(JST).strftime("%Y年%m月%d日")
    rows = "".join(
        f'<tr><td style="padding:4px 10px;color:#94a3b8">{n}</td>'
        f'<td style="padding:4px 10px;font-weight:700;color:{"#34d399" if c in (200,401) else "#f87171"}">{c if c else "×"}</td></tr>'
        for n, c in checks
    )
    gen = ('<span style="color:#34d399">✓ 本日分 生成済み</span>' if fresh
           else '<span style="color:#f87171">✗ 本日分 未生成（要確認）</span>')
    fb_html = ""
    if fb_items is None:
        fb_html = '<p style="color:#f59e0b">※ Supabase未設定のためお問い合わせを取得できません。</p>'
    elif not fb_items:
        fb_html = '<p style="color:#64748b">新着はありません。</p>'
    else:
        for it in fb_items:
            a = it.get("_analysis") or {}
            col = FEAS.get(a.get("feasibility"), "#94a3b8")
            kind = {"bug": "🐞不具合", "request": "💡要望", "other": "💬その他"}.get(it.get("kind"), it.get("kind"))
            fb_html += f"""
            <div style="border-left:3px solid {col};background:#161b27;border-radius:8px;padding:12px 14px;margin:10px 0">
              <div style="color:#e2e8f0;font-size:13px;margin-bottom:6px">{kind}　<span style="color:#64748b">{(it.get('email') or '匿名')}</span></div>
              <div style="color:#f1f5f9;font-size:14px;margin-bottom:8px">{it.get('message','')}</div>
              <div style="color:#cbd5e1;font-size:13px;line-height:1.6">
                <b>要約:</b> {a.get('summary','-')}<br>
                <b>対応可否:</b> <span style="color:{col}">{a.get('feasibility','-')}</span>／工数 {a.get('effort','-')}／
                <b>{REC.get(a.get('recommend'),'-')}</b><br>
                <b>方法:</b> {a.get('approach','-')}
              </div>
            </div>"""
    return f"""<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#0f0f14;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto">
  <div style="letter-spacing:6px;font-size:12px;font-weight:700;color:#fafafa">RESOUND ・ 運営ダッシュボード</div>
  <div style="color:#64748b;font-size:13px;margin:4px 0 20px">{today}</div>

  <h2 style="color:#90caf9;font-size:16px">稼働状況</h2>
  <table style="border-collapse:collapse;background:#111827;border-radius:8px">{rows}</table>
  <p style="color:#94a3b8;font-size:13px;margin-top:10px">教材生成: {gen}　/　総エピソード {total}</p>

  <h2 style="color:#90caf9;font-size:16px;margin-top:24px">集客ファネル（直近24時間・AI分析）</h2>
  {build_funnel_html(funnel, funnel_ana)}

  <h2 style="color:#90caf9;font-size:16px;margin-top:24px">新着お問い合わせ・ご要望（AI分析）</h2>
  {fb_html}

  <p style="color:#475569;font-size:12px;margin-top:24px">
    対応する項目は「これやって」と Claude に伝えれば実装します。導入可否の最終判断はあなたです。
  </p>
</div></body></html>"""


def main():
    gmail = os.getenv("GMAIL_ADDRESS", "").strip()
    app_pass = os.getenv("GMAIL_APP_PASSWORD", "").strip()
    to_raw = os.getenv("REPORT_TO", "").strip()

    checks, latest, fresh, total = health()
    fb = fetch_feedback()
    notified = []
    if fb:
        for it in fb:
            it["_analysis"] = analyze(it.get("message", ""), it.get("kind", "other"))
            notified.append(it["id"])

    funnel = fetch_funnel()
    tv = fetch_threads_views()
    if funnel is not None and tv is not None:
        funnel["threads_views"] = tv["views"]
        funnel["threads_posts"] = tv["posts"]
    funnel_ana = analyze_funnel(funnel)

    html = build_html(checks, latest, fresh, total, fb, funnel, funnel_ana)

    if not (gmail and app_pass and to_raw):
        print("メール未設定のため送信スキップ。健全性:", checks, "fresh:", fresh, "feedback:", None if fb is None else len(fb))
        return 0

    msg = MIMEMultipart("alternative")
    n_fb = 0 if not fb else len(fb)
    msg["Subject"] = f"【Resound 運営】{datetime.now(JST):%m/%d} 稼働{'OK' if fresh else '要確認'}・新着{n_fb}件"
    msg["From"] = gmail
    msg["To"] = to_raw
    msg.attach(MIMEText("HTML対応のメールでご覧ください。", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context()) as s:
        s.login(gmail, app_pass)
        s.sendmail(gmail, [e.strip() for e in to_raw.split(",") if e.strip()], msg.as_string())
    if notified:
        mark_notified(notified)
    print(f"送信完了。新着{n_fb}件を分析・通知。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
