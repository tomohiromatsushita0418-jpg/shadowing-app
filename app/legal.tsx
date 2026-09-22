import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// ---------------------------------------------------------------------------
// 特定商取引法に基づく表記 / 利用規約 / プライバシーポリシー
//
// 運営方針（2026-09 確定）:
//  - 住所・電話番号は「請求があったら遅滞なく開示」で運用（個人事業主に認められた
//    方式。自宅住所を公開せずに済む）。もし全面記載に切り替える場合はバーチャル
//    オフィスの契約が現実的な選択肢。
//  - 価格は税込表示（総額表示）。¥980 / ¥7,800 はいずれも税込。
// ---------------------------------------------------------------------------

const OPERATOR = 'Matsushita Tomohiro';
const CONTACT_EMAIL = 'tomohiro.matsushita.0418@gmail.com';
const SERVICE_NAME = 'Resound';

type Row = { label: string; value: string };

const TOKUSHOHO: Row[] = [
  { label: '販売事業者', value: OPERATOR },
  { label: '運営統括責任者', value: OPERATOR },
  {
    label: '所在地',
    value: '請求があったら遅滞なく開示します。下記メールアドレスまでご連絡ください。',
  },
  {
    label: '電話番号',
    value: '請求があったら遅滞なく開示します。下記メールアドレスまでご連絡ください。',
  },
  { label: 'メールアドレス', value: CONTACT_EMAIL },
  { label: '販売価格', value: '月額プラン ¥980（税込） / 年額プラン ¥7,800（税込）' },
  { label: '商品代金以外の必要料金', value: 'インターネット接続に係る通信料はお客様のご負担となります。' },
  { label: 'お支払い方法', value: 'クレジットカード決済（Stripe）' },
  { label: '無料で利用できる範囲', value: '最初の10エピソード（Stage 1）は登録の有無にかかわらず無料でご利用いただけます。Stage 2以降のエピソードおよび一部機能は有料プランのご購読が必要です。' },
  { label: 'お支払い時期', value: 'プラン購読のお申し込み時に初回分を決済し、以後は購読期間ごとに同日に自動更新されます。' },
  {
    label: 'サービス提供時期',
    value: '決済完了後、ただちにすべての機能をご利用いただけます。',
  },
  {
    label: '返品・キャンセル',
    value:
      'サービスの性質上、決済後の返金は原則として承っておりません。解約はアカウント画面からいつでも可能で、解約後も課金期間の終了日までご利用いただけます。次回以降の自動更新は停止されます。',
  },
  { label: '動作環境', value: 'モダンなWebブラウザ（Chrome / Safari / Edge の最新版）' },
];

const TERMS: { heading: string; body: string }[] = [
  {
    heading: '第1条（適用）',
    body: `本規約は、${OPERATOR}（以下「運営者」）が提供する${SERVICE_NAME}（以下「本サービス」）の利用条件を定めるものです。利用者は本規約に同意のうえ本サービスを利用するものとします。`,
  },
  {
    heading: '第2条（アカウント）',
    body: '利用者はメールアドレスを登録してアカウントを作成します。登録情報の管理責任は利用者に帰属し、第三者による不正利用について運営者は責任を負いません。',
  },
  {
    heading: '第3条（料金および支払い）',
    body: '有料プランの料金および支払い方法は本ページの「特定商取引法に基づく表記」に定めるとおりです。サブスクリプションは解約されるまで自動的に更新されます。',
  },
  {
    heading: '第4条（無料で利用できる範囲）',
    body: '最初の10エピソード（Stage 1）は無料でご利用いただけます。Stage 2以降のエピソードおよび瞬間英作文・熟語帳等の一部機能は、有料プランのご購読によりご利用いただけます。無料の範囲では自動的に課金が始まることはありません。',
  },
  {
    heading: '第5条（禁止事項）',
    body: '本サービスのコンテンツ（英文・音声・翻訳・解説を含む）を無断で複製・転載・再配布する行為、リバースエンジニアリング、および本サービスの運営を妨害する行為を禁止します。',
  },
  {
    heading: '第6条（コンテンツの性質）',
    body: '本サービスの学習コンテンツは生成AIを用いて作成されています。学習教材としての有用性に配慮していますが、内容の完全な正確性を保証するものではありません。',
  },
  {
    heading: '第7条（サービスの変更・中断）',
    body: '運営者は、事前の通知なく本サービスの内容を変更し、または提供を中断することがあります。これにより利用者に生じた損害について、運営者は責任を負いません。',
  },
  {
    heading: '第8条（免責）',
    body: '運営者は、本サービスの利用により得られる学習成果について、いかなる保証も行いません。運営者の責任は、故意または重過失による場合を除き、利用者が直近12か月に支払った料金の総額を上限とします。',
  },
  {
    heading: '第9条（準拠法・管轄）',
    body: '本規約は日本法に準拠し、本サービスに関する紛争については運営者の住所地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。',
  },
];

const PRIVACY: { heading: string; body: string }[] = [
  {
    heading: '取得する情報',
    body: 'アカウント作成時のメールアドレス、学習の進捗状況、およびアクセスログ（IPアドレス、ブラウザ情報）を取得します。',
  },
  {
    heading: 'クレジットカード情報',
    body: '決済はStripe社が処理します。カード番号は同社のシステムで処理され、運営者のサーバーに保存されることは一切ありません。',
  },
  {
    heading: '利用目的',
    body: '本サービスの提供、本人確認、課金処理、重要なお知らせの通知、および品質改善のための統計的な分析に利用します。',
  },
  {
    heading: '第三者提供',
    body: '法令に基づく場合を除き、本人の同意なく第三者に提供することはありません。サービス提供のため、Supabase（認証・データ保管）、Stripe（決済）、Vercel（配信）の各社に処理を委託しています。',
  },
  {
    heading: '開示・削除の請求',
    body: `ご自身の情報の開示、訂正、削除をご希望の場合は ${CONTACT_EMAIL} までご連絡ください。アカウントの削除により、保存された学習データも削除されます。`,
  },
];

export default function LegalScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.h1}>特定商取引法に基づく表記</Text>
      <View style={styles.table}>
        {TOKUSHOHO.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h1}>利用規約</Text>
      {TERMS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.h2}>{section.heading}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}

      <Text style={styles.h1}>プライバシーポリシー</Text>
      {PRIVACY.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.h2}>{section.heading}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}

      <Pressable onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
        <Text style={styles.link}>お問い合わせ: {CONTACT_EMAIL}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  scroll: { padding: 20, paddingBottom: 60, gap: 10 },
  h1: { color: '#f1f5f9', fontSize: 20, fontWeight: '800', marginTop: 24, marginBottom: 6 },
  h2: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  section: { gap: 4, marginBottom: 12 },
  body: { color: '#94a3b8', fontSize: 13, lineHeight: 21 },
  table: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: { padding: 12, gap: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  rowValue: { color: '#e2e8f0', fontSize: 13, lineHeight: 20 },
  link: { color: '#fbbf24', fontSize: 13, marginTop: 20, textAlign: 'center' },
});
