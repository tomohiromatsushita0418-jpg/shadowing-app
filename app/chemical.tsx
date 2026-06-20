import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import LoginGate from '../components/LoginGate';

/* ----------------------------- 型 ----------------------------- */

interface Identity {
  found: boolean;
  query: string;
  cid?: number;
  casNumber?: string | null;
  name?: string;
  iupacName?: string | null;
  molecularFormula?: string | null;
  molecularWeight?: string | null;
  smiles?: string | null;
  synonyms?: string[];
  structureImageUrl?: string;
  pubchemUrl?: string;
}

interface Report {
  productName?: string;
  hsCode?: string;
  hsCodeRationale?: string;
  summary?: string;
  globalMarket?: {
    year?: string;
    volume?: string;
    valueUsd?: string;
    cagr?: string;
    notes?: string;
  };
  regions?: { region: string; share: string; volume: string; notes: string }[];
  countries?: { country: string; role: string; volume: string; notes: string }[];
  suppliers?: { name: string; country: string; notes: string }[];
  endUsers?: { segment: string; share: string; notes: string }[];
  applications?: string[];
  pricing?: { unitPrice?: string; trend?: string; notes?: string };
  trade?: {
    majorExporters?: string[];
    majorImporters?: string[];
    tariffs?: string;
    customsNotes?: string;
    japan?: { importVolume?: string; exportVolume?: string; notes?: string };
  };
  regulatory?: string[];
  sources?: string[];
  confidence?: 'high' | 'medium' | 'low';
  disclaimer?: string;
}

interface VerifyLink {
  name: string;
  desc: string;
  url: string;
}
interface ApiResponse {
  identity: Identity;
  report: Report;
  verify: { hs6: string | null; chemLinks: VerifyLink[]; links: VerifyLink[] };
  error?: string;
}

const CONFIDENCE_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: '信頼度: 高', color: '#34d399' },
  medium: { text: '信頼度: 中', color: '#fbbf24' },
  low: { text: '信頼度: 低', color: '#f87171' },
};

/* --------------------------- 小物UI --------------------------- */

function SectionTitle({ icon, title }: { icon: any; title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={16} color="#67e8f9" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

/* --------------------------- 画面 --------------------------- */

export default function ChemicalScreen() {
  const insets = useSafeAreaInsets();
  const { token, ready, isAuthed, login, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  async function run() {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-auth-token': token } : {}),
        },
        body: JSON.stringify({ query: q }),
      });
      const json: ApiResponse = await res.json();
      if (res.status === 401) {
        // トークンが無効/失効 → ログイン画面へ戻す
        await logout();
        throw new Error('セッションが切れました。再度ログインしてください。');
      }
      if (!res.ok || json.error) {
        throw new Error(json.error || `エラー (${res.status})`);
      }
      setData(json);
    } catch (e: any) {
      setError(e.message || '調査に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  // 認証状態の読み込み中
  if (!ready) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#67e8f9" />
      </View>
    );
  }

  // 未ログイン → ログインゲート
  if (!isAuthed) {
    return (
      <View style={styles.container}>
        <LoginGate onSubmit={login} />
      </View>
    );
  }

  const identity = data?.identity;
  const report = data?.report;
  const verify = data?.verify;
  const conf = report?.confidence ? CONFIDENCE_LABEL[report.confidence] : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 48 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* ヘッダー */}
      <LinearGradient
        colors={['#0b1424', '#0a1a1f', '#0a0a10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <Text style={styles.brand}>CHEM MARKET INTEL</Text>
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
            onPress={logout}
          >
            <Ionicons name="log-out-outline" size={14} color="#94a3b8" />
            <Text style={styles.logoutText}>ログアウト</Text>
          </Pressable>
        </View>
        <Text style={styles.heroTitle}>化学品 世界市場リサーチ</Text>
        <Text style={styles.heroSub}>
          化学品名 または CAS番号 を入力すると、世界市場数量・サプライヤー・ユーザー・単価・
          エリア/国別・関税・輸出入通関までを網羅したレポートを自動生成します。
        </Text>
      </LinearGradient>

      {/* 検索 */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          placeholder="例: Ethylene / 酢酸エチル / 64-17-5"
          placeholderTextColor="#64748b"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={run}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Pressable
          style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.85 }]}
          onPress={run}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0c4a6e" size="small" />
          ) : (
            <Ionicons name="search" size={20} color="#0c4a6e" />
          )}
        </Pressable>
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#67e8f9" />
          <Text style={styles.loadingText}>
            PubChem で同定し、市場レポートを生成しています…(20〜40秒)
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color="#f87171" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ---------------- 同定情報 ---------------- */}
      {identity && (
        <View style={styles.card}>
          <SectionTitle icon="flask-outline" title="化学品 同定情報 (PubChem)" />
          {identity.found ? (
            <View style={styles.identityRow}>
              {identity.structureImageUrl && (
                <Image
                  source={{ uri: identity.structureImageUrl }}
                  style={styles.structure}
                  resizeMode="contain"
                />
              )}
              <View style={styles.identityInfo}>
                <Text style={styles.chemName}>{identity.name}</Text>
                <KV label="CAS番号" value={identity.casNumber || undefined} />
                <KV label="分子式" value={identity.molecularFormula || undefined} />
                <KV
                  label="分子量"
                  value={identity.molecularWeight ? `${identity.molecularWeight} g/mol` : undefined}
                />
                <KV label="IUPAC名" value={identity.iupacName || undefined} />
                {identity.pubchemUrl && (
                  <Pressable onPress={() => Linking.openURL(identity.pubchemUrl!)}>
                    <Text style={styles.link}>PubChem で開く ↗</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>
              PubChem では同定できませんでしたが、入力語を基にレポートを生成しました。
            </Text>
          )}
        </View>
      )}

      {/* ---------------- サマリー ---------------- */}
      {report?.summary && (
        <View style={styles.card}>
          <View style={styles.summaryHeader}>
            <SectionTitle icon="document-text-outline" title="エグゼクティブサマリー" />
            {conf && (
              <View style={[styles.badge, { borderColor: conf.color }]}>
                <Text style={[styles.badgeText, { color: conf.color }]}>{conf.text}</Text>
              </View>
            )}
          </View>
          <Text style={styles.body}>{report.summary}</Text>
        </View>
      )}

      {/* ---------------- 世界市場 ---------------- */}
      {report?.globalMarket && (
        <View style={styles.card}>
          <SectionTitle icon="globe-outline" title="世界市場(全世界)" />
          <View style={styles.metricGrid}>
            <Metric label="世界需要量" value={report.globalMarket.volume} />
            <Metric label="市場規模" value={report.globalMarket.valueUsd} />
            <Metric label="CAGR" value={report.globalMarket.cagr} />
            <Metric label="基準年" value={report.globalMarket.year} />
          </View>
          {report.globalMarket.notes ? (
            <Text style={styles.note}>{report.globalMarket.notes}</Text>
          ) : null}
        </View>
      )}

      {/* ---------------- エリア別 ---------------- */}
      {report?.regions && report.regions.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="map-outline" title="エリア別(地域別シェア)" />
          {report.regions.map((r, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.listHead}>
                <Text style={styles.listTitle}>{r.region}</Text>
                {!!r.share && <Text style={styles.listTag}>{r.share}</Text>}
              </View>
              {!!r.volume && <Text style={styles.listMeta}>数量: {r.volume}</Text>}
              {!!r.notes && <Text style={styles.listNote}>{r.notes}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* ---------------- 国別 ---------------- */}
      {report?.countries && report.countries.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="flag-outline" title="主要国別(生産・消費)" />
          {report.countries.map((c, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.listHead}>
                <Text style={styles.listTitle}>{c.country}</Text>
                {!!c.role && <Text style={styles.listTag}>{c.role}</Text>}
              </View>
              {!!c.volume && <Text style={styles.listMeta}>数量: {c.volume}</Text>}
              {!!c.notes && <Text style={styles.listNote}>{c.notes}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* ---------------- サプライヤー ---------------- */}
      {report?.suppliers && report.suppliers.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="business-outline" title="主要サプライヤー / メーカー" />
          {report.suppliers.map((s, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.listHead}>
                <Text style={styles.listTitle}>{s.name}</Text>
                {!!s.country && <Text style={styles.listTag}>{s.country}</Text>}
              </View>
              {!!s.notes && <Text style={styles.listNote}>{s.notes}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* ---------------- ユーザー / 用途 ---------------- */}
      {report?.endUsers && report.endUsers.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="people-outline" title="主要ユーザー(需要業界 / 用途別)" />
          {report.endUsers.map((u, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.listHead}>
                <Text style={styles.listTitle}>{u.segment}</Text>
                {!!u.share && <Text style={styles.listTag}>{u.share}</Text>}
              </View>
              {!!u.notes && <Text style={styles.listNote}>{u.notes}</Text>}
            </View>
          ))}
          {report.applications && report.applications.length > 0 && (
            <View style={styles.chipWrap}>
              {report.applications.map((a, i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ---------------- 単価 ---------------- */}
      {report?.pricing && (report.pricing.unitPrice || report.pricing.trend) && (
        <View style={styles.card}>
          <SectionTitle icon="pricetag-outline" title="単価 / 価格動向" />
          <KV label="単価" value={report.pricing.unitPrice} />
          <KV label="トレンド" value={report.pricing.trend} />
          {!!report.pricing.notes && <Text style={styles.note}>{report.pricing.notes}</Text>}
        </View>
      )}

      {/* ---------------- 関税・通関・貿易 ---------------- */}
      {report?.trade && (
        <View style={styles.card}>
          <SectionTitle icon="boat-outline" title="関税・輸出入通関・貿易フロー" />
          {!!report.hsCode && (
            <View style={styles.hsBox}>
              <Text style={styles.hsLabel}>推定 HSコード</Text>
              <Text style={styles.hsCode}>{report.hsCode}</Text>
            </View>
          )}
          {!!report.hsCodeRationale && <Text style={styles.note}>{report.hsCodeRationale}</Text>}
          <KV label="主要輸出国" value={report.trade.majorExporters?.join(', ')} />
          <KV label="主要輸入国" value={report.trade.majorImporters?.join(', ')} />
          <KV label="関税率" value={report.trade.tariffs} />
          {!!report.trade.customsNotes && (
            <>
              <Text style={styles.kvLabel}>通関の留意点</Text>
              <Text style={styles.body}>{report.trade.customsNotes}</Text>
            </>
          )}
          {report.trade.japan && (
            <View style={styles.jpBox}>
              <Text style={styles.jpTitle}>🇯🇵 日本の貿易</Text>
              <KV label="輸入量" value={report.trade.japan.importVolume} />
              <KV label="輸出量" value={report.trade.japan.exportVolume} />
              {!!report.trade.japan.notes && <Text style={styles.note}>{report.trade.japan.notes}</Text>}
            </View>
          )}
        </View>
      )}

      {/* ---------------- 検証用リンク(実データDB) ---------------- */}
      {verify && verify.links.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="link-outline" title="実データで検証(貿易統計DB)" />
          <Text style={styles.muted}>
            下記は HSコード{verify.hs6 ? ` ${verify.hs6}` : ''} を基にした、実在する公的・公開DBへのリンクです。
            数量・金額・関税の一次データを直接確認できます。
          </Text>
          {verify.links.map((l, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
              onPress={() => Linking.openURL(l.url)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.linkRowTitle}>{l.name}</Text>
                <Text style={styles.linkRowDesc}>{l.desc}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#67e8f9" />
            </Pressable>
          ))}
        </View>
      )}

      {/* ---------------- 規制 / 情報源 ---------------- */}
      {report?.regulatory && report.regulatory.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="shield-checkmark-outline" title="主な規制" />
          {report.regulatory.map((r, i) => (
            <Text key={i} style={styles.bullet}>
              ・{r}
            </Text>
          ))}
        </View>
      )}

      {/* ---------------- NITE-CHRIP(化学品詳細・規制) ---------------- */}
      {verify?.chemLinks && verify.chemLinks.length > 0 && (
        <View style={styles.card}>
          <SectionTitle icon="library-outline" title="化学品の詳細・法規制を調べる (NITE-CHRIP)" />
          <Text style={styles.muted}>
            NITE-CHRIP(化学物質総合情報提供システム)で、日本・海外の法規制や有害性などの
            一次情報を確認できます。
            {identity?.casNumber ? ` CAS番号「${identity.casNumber}」で検索してください。` : ''}
          </Text>
          {verify.chemLinks.map((l, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
              onPress={() => Linking.openURL(l.url)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.linkRowTitle}>{l.name}</Text>
                <Text style={styles.linkRowDesc}>{l.desc}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#67e8f9" />
            </Pressable>
          ))}
        </View>
      )}

      {report?.disclaimer && (
        <Text style={styles.disclaimer}>※ {report.disclaimer}</Text>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value || '—'}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

/* --------------------------- styles --------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16 },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logoutText: { color: '#94a3b8', fontSize: 11.5, fontWeight: '700' },
  hero: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.15)',
  },
  brand: {
    color: '#67e8f9',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 8,
  },
  heroTitle: { color: '#f0f9ff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  heroSub: { color: 'rgba(240,249,255,0.6)', fontSize: 12.5, lineHeight: 19 },
  searchBox: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  input: {
    flex: 1,
    backgroundColor: '#1a1a24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f1f5f9',
    fontSize: 15,
  },
  searchBtn: {
    width: 52,
    borderRadius: 14,
    backgroundColor: '#67e8f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  loadingText: { color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  errorText: { color: '#fca5a5', fontSize: 13, flex: 1 },
  card: {
    backgroundColor: '#15151d',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  identityRow: { flexDirection: 'row', gap: 14 },
  structure: {
    width: 110,
    height: 110,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  identityInfo: { flex: 1 },
  chemName: { color: '#f0f9ff', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  kvRow: { flexDirection: 'row', marginBottom: 5, flexWrap: 'wrap' },
  kvLabel: { color: '#64748b', fontSize: 12.5, fontWeight: '700', width: 96 },
  kvValue: { color: '#cbd5e1', fontSize: 12.5, flex: 1, minWidth: 120 },
  link: { color: '#67e8f9', fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  muted: { color: '#94a3b8', fontSize: 12.5, lineHeight: 18, marginBottom: 8 },
  body: { color: '#cbd5e1', fontSize: 13.5, lineHeight: 21 },
  note: { color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 8, fontStyle: 'italic' },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 10 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#0f0f17',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  metricValue: { color: '#67e8f9', fontSize: 16, fontWeight: '800' },
  metricLabel: { color: '#64748b', fontSize: 10.5, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  listItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  listTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', flex: 1 },
  listTag: {
    color: '#a5f3fc',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(103,232,249,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  listMeta: { color: '#94a3b8', fontSize: 12, marginTop: 3 },
  listNote: { color: '#778199', fontSize: 12, marginTop: 3, lineHeight: 17 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  hsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(103,232,249,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  hsLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  hsCode: { color: '#67e8f9', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  jpBox: {
    marginTop: 12,
    backgroundColor: '#0f0f17',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  jpTitle: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  linkRowTitle: { color: '#e2e8f0', fontSize: 13.5, fontWeight: '700' },
  linkRowDesc: { color: '#778199', fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  bullet: { color: '#cbd5e1', fontSize: 13, lineHeight: 21 },
  disclaimer: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
});
