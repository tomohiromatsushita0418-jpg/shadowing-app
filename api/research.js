/**
 * api/research.js — Vercel Serverless Function
 *
 * 化学品名 または CAS番号 を受け取り、以下を返す:
 *   1. PubChem(無料・キー不要)から化学品の同定情報(実データ)
 *   2. Gemini による世界市場レポート(数量・サプライヤー・ユーザー・単価・
 *      エリア/国別・関税・輸出入通関 を含む構造化 JSON)
 *   3. 実在する貿易統計DB(UN Comtrade / ITC Trade Map / 財務省貿易統計・税関)への
 *      HSコード付きディープリンク(検証用)
 *
 * Runtime: Node.js (Vercel) — グローバル fetch を使用
 * Env:     GEMINI_API_KEY (必須・レポート生成用)
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const CAS_RE = /^\d{2,7}-\d{2}-\d$/;
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

/* ------------------------------------------------------------------ */
/* PubChem: 化学品の同定(実データ)                                    */
/* ------------------------------------------------------------------ */

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function pickCas(synonyms) {
  if (!Array.isArray(synonyms)) return null;
  // CAS番号(例: 64-17-5)。RN形式の最初の一致を採用。
  for (const s of synonyms) {
    if (typeof s === 'string' && CAS_RE.test(s.trim())) return s.trim();
  }
  return null;
}

async function resolveIdentity(query) {
  const q = query.trim();
  // 入力が CAS でも 名称でも PubChem の name エンドポイントで解決できる。
  const encoded = encodeURIComponent(q);

  const cidJson = await fetchJson(`${PUBCHEM}/compound/name/${encoded}/cids/JSON`);
  const cid = cidJson?.IdentifierList?.CID?.[0];
  if (!cid) {
    return { found: false, query: q };
  }

  const propUrl =
    `${PUBCHEM}/compound/cid/${cid}/property/` +
    `IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,Title/JSON`;
  const [propJson, synJson] = await Promise.all([
    fetchJson(propUrl),
    fetchJson(`${PUBCHEM}/compound/cid/${cid}/synonyms/JSON`),
  ]);

  const props = propJson?.PropertyTable?.Properties?.[0] || {};
  const synonyms = synJson?.InformationList?.Information?.[0]?.Synonyms || [];
  const cas = CAS_RE.test(q) ? q : pickCas(synonyms);

  return {
    found: true,
    query: q,
    cid,
    casNumber: cas,
    name: props.Title || synonyms[0] || q,
    iupacName: props.IUPACName || null,
    molecularFormula: props.MolecularFormula || null,
    molecularWeight: props.MolecularWeight || null,
    smiles: props.CanonicalSMILES || null,
    synonyms: synonyms.slice(0, 12),
    structureImageUrl: `${PUBCHEM}/compound/cid/${cid}/PNG`,
    pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
  };
}

/* ------------------------------------------------------------------ */
/* Gemini: 市場レポート生成                                            */
/* ------------------------------------------------------------------ */

function buildPrompt(identity) {
  const idText = identity.found
    ? `PubChemで同定済み:
- 名称: ${identity.name}
- IUPAC名: ${identity.iupacName || '不明'}
- 分子式: ${identity.molecularFormula || '不明'}
- 分子量: ${identity.molecularWeight || '不明'}
- CAS番号: ${identity.casNumber || '不明'}`
    : `PubChemでは同定できませんでした。入力語: "${identity.query}"`;

  return `あなたは化学品の市場調査(マーケットインテリジェンス)の専門アナリストです。
対象化学品について、世界市場の網羅的レポートを作成してください。

【対象】
${idText}

【厳守事項】
- 出力は日本語。専門的だが読みやすいトーンで。
- 数値は公開情報・業界知識に基づく「推定レンジ」で構わない。ただし断定しすぎないこと。
- 不明な項目は "データ不足" と明記し、捏造しない。
- 関税・輸出入通関は、対象に最も妥当な HSコード(6桁)を推定して示す。
- 規制(regulatory)は日本の法規制(化審法・安衛法・化管法・毒劇法 等)と
  海外(REACH・TSCA 等)を、NITE-CHRIP で確認できる粒度で具体的に挙げる。
- 出力は必ず下記スキーマの **有効なJSONのみ**(マークダウン記法やコードフェンス禁止)。

【JSONスキーマ】
{
  "productName": string,
  "hsCode": string,                       // 推定HSコード(6桁, 例 "2905.43")
  "hsCodeRationale": string,              // HSコード選定の根拠
  "summary": string,                      // エグゼクティブサマリー(3-5文)
  "globalMarket": {
    "year": string,                       // 基準年
    "volume": string,                     // 世界需要量(例 "約 95万トン/年")
    "valueUsd": string,                   // 市場規模(例 "約 28億USD")
    "cagr": string,                       // 年平均成長率
    "notes": string
  },
  "regions": [                            // 各エリア別(例: アジア太平洋, 欧州, 北米, 中東, その他)
    { "region": string, "share": string, "volume": string, "notes": string }
  ],
  "countries": [                          // 各国別(主要生産・消費国 6-10件)
    { "country": string, "role": string, "volume": string, "notes": string }  // role例: "主要生産国","主要輸入国"
  ],
  "suppliers": [                          // 主要サプライヤー/メーカー 5-10件
    { "name": string, "country": string, "notes": string }
  ],
  "endUsers": [                           // 主要ユーザー業界/用途別シェア
    { "segment": string, "share": string, "notes": string }
  ],
  "applications": [string],               // 主な用途
  "pricing": {
    "unitPrice": string,                  // 単価(例 "1,800-2,500 USD/トン")
    "trend": string,                      // 価格トレンド
    "notes": string
  },
  "trade": {
    "majorExporters": [string],
    "majorImporters": [string],
    "tariffs": string,                    // 代表的な関税率(日本/EU/米国/中国 など)
    "customsNotes": string,               // 輸出入通関の留意点(規制・許認可等)
    "japan": { "importVolume": string, "exportVolume": string, "notes": string }
  },
  "regulatory": [string],                 // 規制(REACH, 化審法, TSCA 等)
  "sources": [string],                    // 参考にすべき情報源・データベース名
  "confidence": "high" | "medium" | "low",
  "disclaimer": string                    // 推定値である旨の注意書き
}`;
}

async function generateReport(identity, apiKey) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}` +
    `:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(identity) }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini から空の応答が返りました。');
  return JSON.parse(content);
}

/* ------------------------------------------------------------------ */
/* 実在する貿易統計DBへの検証用ディープリンク                          */
/* ------------------------------------------------------------------ */

function buildVerifyLinks(hsCode, casNumber) {
  // HSコードの数字のみ(6桁)を抽出
  const digits = (hsCode || '').replace(/\D/g, '').slice(0, 6);
  const hs6 = digits.length >= 6 ? digits : null;
  const hs4 = hs6 ? hs6.slice(0, 4) : null;
  const casLabel = casNumber ? `（CAS番号 ${casNumber} で検索）` : '（化学品名/CAS番号で検索）';

  return {
    hs6,
    // 化学品の詳細・規制(NITE-CHRIP)
    chemLinks: [
      {
        name: 'NITE-CHRIP(化学物質総合情報提供システム)',
        desc: `日本の法規制(化審法・安衛法・化管法 等)・有害性・国際規制を横断検索${casLabel}`,
        url: 'https://www.nite.go.jp/chem/chrip/chrip_search/systemTop',
      },
      {
        name: 'NITE-CHRIP (English)',
        desc: `Regulatory & hazard information across domestic/international lists${casLabel}`,
        url: 'https://www.nite.go.jp/en/chem/chrip/chrip_search/systemTop',
      },
    ],
    // 貿易・関税(数量/金額/関税の一次データ)
    links: [
      {
        name: 'UN Comtrade(国連貿易統計)',
        desc: '全世界・各国別の輸出入数量/金額(無料・実データ)',
        url: hs6
          ? `https://comtradeplus.un.org/TradeFlow?Frequency=A&Flows=X,M&CommodityCodes=${hs6}&Partners=0&Reporters=all&period=all&AggregateBy=none&BreakdownMode=plus`
          : 'https://comtradeplus.un.org/',
      },
      {
        name: 'ITC Trade Map',
        desc: '国別・製品別の貿易フロー、輸入関税(要無料登録)',
        url: hs6
          ? `https://www.trademap.org/Country_SelProduct.aspx?nvpm=1%7c%7c%7c%7c%7c${hs6}%7c%7c%7c6%7c1%7c1%7c2%7c1%7c1%7c1%7c1%7c1%7c1`
          : 'https://www.trademap.org/',
      },
      {
        name: '財務省 貿易統計(税関)',
        desc: '日本の輸出入通関実績(品目別・国別、実データ)',
        url: 'https://www.customs.go.jp/toukei/srch/index.htm',
      },
      {
        name: 'Web Tariff(実行関税率表 / 税関)',
        desc: '日本の輸入関税率(HSコード別)',
        url: hs4
          ? `https://www.customs.go.jp/tariff/2024_4/data/i202404j_${hs4.slice(0, 2)}.htm`
          : 'https://www.customs.go.jp/tariff/index.htm',
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* ハンドラ                                                            */
/* ------------------------------------------------------------------ */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST のみ対応しています。' });
    return;
  }

  try {
    // 共有パスワード保護: SITE_PASSWORD が設定されている場合はトークンを検証
    const sitePassword = process.env.SITE_PASSWORD;
    if (sitePassword) {
      const token = (req.headers['x-auth-token'] || '').toString();
      const valid =
        token.length > 0 &&
        token.length === 64 &&
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sha256(sitePassword)));
      if (!valid) {
        res.status(401).json({ error: '認証が必要です。ログインしてください。' });
        return;
      }
    }

    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const query = (body?.query || '').toString().trim();

    if (!query) {
      res.status(400).json({ error: '化学品名 または CAS番号 を入力してください。' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'サーバーに GEMINI_API_KEY が設定されていません。Vercel の環境変数を確認してください。',
      });
      return;
    }

    const identity = await resolveIdentity(query);
    const report = await generateReport(identity, apiKey);
    const cas = identity?.casNumber || report?.casNumber || null;
    const verify = buildVerifyLinks(report?.hsCode || '', cas);

    res.status(200).json({ identity, report, verify });
  } catch (err) {
    res.status(500).json({ error: `レポート生成に失敗しました: ${err.message}` });
  }
};
