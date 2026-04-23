// scripts/daily-update.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 毎日自動更新スクリプト
//
// 処理の流れ:
//   1. RSS / 公開フィードからニュース記事を取得
//   2. Claude APIで日本語要約を生成
//   3. index.html の「最新ニュース」セクションを更新
//   4. GitHub Actionsが自動コミット
//
// 環境変数:
//   ANTHROPIC_API_KEY  : Claude APIキー（なければRSS見出しのみ）
//   REPORT_TYPE        : middle-east / ukraine / taiwan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fetch from 'node-fetch';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

// ── 設定 ──────────────────────────────────────────

const REPORT_TYPE = process.env.REPORT_TYPE || 'middle-east';
const HAS_CLAUDE  = !!process.env.ANTHROPIC_API_KEY;
const TODAY       = new Date().toLocaleDateString('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
});

// レポート別設定
const REPORT_CONFIG = {
  'middle-east': {
    title:    '🌍 中東・イラン戦争レポート',
    keywords: ['イラン', 'イスラエル', 'ガザ', '中東', 'ホルムズ', 'レバノン', 'ヒズボラ', 'ハマス', 'パレスチナ'],
    sources:  [
      { name: 'NHK国際', url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
      { name: 'CNN World', url: 'https://rss.cnn.com/rss/edition_world.rss' },
      { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    ],
    summaryPrompt: `あなたは中東情勢の専門アナリストです。以下の英語・日本語ニュース見出しを分析し、
中東・イラン・イスラエル・ガザに関する最新情勢を日本語で簡潔に要約してください。
箇条書き（•）で3〜5点、1点につき1〜2文で記述してください。専門的かつ分かりやすく。`,
  },

  'ukraine': {
    title:    '🇺🇦 ウクライナ戦争レポート',
    keywords: ['ウクライナ', 'ロシア', 'ゼレンスキー', 'プーチン', 'ドネツク', 'キーウ', 'NATO', '停戦'],
    sources:  [
      { name: 'NHK国際', url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
      { name: 'Ukrinform', url: 'https://www.ukrinform.jp/rss/block-lastnews' },
      { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/worldNews' },
    ],
    summaryPrompt: `あなたはロシア・ウクライナ戦争の専門アナリストです。以下のニュース見出しを分析し、
最新の戦況・停戦交渉・兵器支援に関する情勢を日本語で簡潔に要約してください。
箇条書き（•）で3〜5点、1点につき1〜2文で記述してください。専門的かつ分かりやすく。`,
  },

  'taiwan': {
    title:    '🇹🇼 台湾有事レポート',
    keywords: ['台湾', '中国', '人民解放軍', '台湾海峡', '半導体', 'TSMC', '習近平', '頼清徳'],
    sources:  [
      { name: 'NHK国際', url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
      { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'CNN World', url: 'https://rss.cnn.com/rss/edition_world.rss' },
      { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/worldNews' },
    ],
    summaryPrompt: `あなたは中国・台湾問題の専門アナリストです。以下のニュース見出しを分析し、
台湾海峡の緊張・中国軍の動向・半導体サプライチェーン・米中関係に関する最新情勢を
日本語で簡潔に要約してください。箇条書き（•）で3〜5点、1点につき1〜2文で。専門的かつ分かりやすく。`,
  },
};

const CONFIG = REPORT_CONFIG[REPORT_TYPE] || REPORT_CONFIG['middle-east'];

// ── RSS取得 ───────────────────────────────────────

async function fetchRSS(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
      timeout: 10000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml  = await res.text();
    const data = await parseStringPromise(xml, { explicitArray: false });

    const channel = data?.rss?.channel || data?.feed;
    const items   = channel?.item || channel?.entry || [];
    const list    = Array.isArray(items) ? items : [items];

    return list.slice(0, 20).map(item => ({
      title:     item.title?._ || item.title || '',
      link:      item.link?.href || item.link || '',
      pubDate:   item.pubDate || item.updated || '',
      desc:      item.description?._ || item.description || item.summary?._ || '',
      source:    source.name,
    }));
  } catch (e) {
    console.warn(`  ⚠ ${source.name} の取得に失敗: ${e.message}`);
    return [];
  }
}

// キーワードフィルタ
function isRelevant(item) {
  const text = `${item.title} ${item.desc}`.toLowerCase();
  return CONFIG.keywords.some(kw => text.includes(kw.toLowerCase()));
}

// ── Claude API で要約 ──────────────────────────────

async function summarizeWithClaude(articles) {
  if (!HAS_CLAUDE || articles.length === 0) return null;

  const headlines = articles
    .slice(0, 15)
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `${CONFIG.summaryPrompt}\n\n【最新ニュース見出し】\n${headlines}`
        }]
      })
    });

    if (!res.ok) throw new Error(`Claude API: HTTP ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (e) {
    console.warn(`  ⚠ Claude API エラー: ${e.message}`);
    return null;
  }
}

// ── HTML の「最新ニュース」セクションを更新 ────────

function buildNewsHTML(articles, summary) {
  const articleHTML = articles.slice(0, 8).map(a => {
    const title = a.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
    <div class="news-item">
      <span class="news-source">${a.source}</span>
      <span class="news-title">${title}</span>
    </div>`;
  }).join('');

  const summaryHTML = summary
    ? `<div class="news-summary">${summary.replace(/\n/g, '<br>')}</div>`
    : '';

  return `<!-- NEWS_START -->
<div id="latest-news" style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:20px;margin:20px 0;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
    <div style="font-family:'Noto Serif JP';font-size:16px;font-weight:700;">📡 最新ニュース（自動更新）</div>
    <div style="font-size:11px;color:var(--gray);">更新日時：${TODAY}</div>
  </div>
  ${summaryHTML ? `
  <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:14px;margin-bottom:14px;font-size:13px;line-height:1.8;color:#ccd8e4;">
    <div style="font-size:11px;color:var(--gold);letter-spacing:1px;margin-bottom:8px;font-family:'Oswald';">🤖 AI要約（Claude Sonnet）</div>
    ${summaryHTML}
  </div>` : ''}
  <div style="display:flex;flex-direction:column;gap:6px;">
    ${articleHTML}
  </div>
  <div style="margin-top:10px;font-size:10px;color:var(--gray);">
    ※ 情報はRSSフィードから自動収集。内容の正確性は各情報源でご確認ください。
  </div>
</div>
<!-- NEWS_END -->`;
}

function updateHTML(newsHTML) {
  if (!fs.existsSync('index.html')) {
    console.log('  ⚠ index.html が見つかりません');
    return false;
  }

  let html = fs.readFileSync('index.html', 'utf8');

  // 既存のニュースブロックを置き換え、なければ台本セクションの先頭に挿入
  if (html.includes('<!-- NEWS_START -->')) {
    html = html.replace(/<!-- NEWS_START -->[\s\S]*?<!-- NEWS_END -->/m, newsHTML);
  } else {
    // 解説セクションの最初のscript-sectionの前に挿入
    const insertPoint = html.indexOf('<div class="script-section">');
    if (insertPoint !== -1) {
      html = html.slice(0, insertPoint) + newsHTML + '\n' + html.slice(insertPoint);
    }
  }

  fs.writeFileSync('index.html', html, 'utf8');
  return true;
}

// ── GitHub Actions の outputs に書き込み ────────────

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) fs.appendFileSync(outputFile, `${name}=${value}\n`);
}

// ── メイン処理 ────────────────────────────────────

async function main() {
  console.log(`\n🚀 Daily Update 開始`);
  console.log(`   レポートタイプ: ${REPORT_TYPE}`);
  console.log(`   Claude API: ${HAS_CLAUDE ? '✅ 利用可能' : '⚠ なし（見出しのみ）'}`);
  console.log(`   実行日時: ${TODAY}\n`);

  // 1. RSS 収集
  console.log('📡 RSSフィードを収集中...');
  const allArticles = [];
  for (const src of CONFIG.sources) {
    process.stdout.write(`   ${src.name}... `);
    const items = await fetchRSS(src);
    const relevant = items.filter(isRelevant);
    console.log(`${items.length}件取得 → ${relevant.length}件が関連`);
    allArticles.push(...relevant);
  }

  // 重複除去（タイトルベース）
  const seen = new Set();
  const unique = allArticles.filter(a => {
    if (seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  console.log(`\n📊 合計: ${unique.length}件の関連記事を取得\n`);

  if (unique.length === 0) {
    console.log('⚠ 関連記事が見つかりませんでした。更新をスキップします。');
    setOutput('has_updates', 'false');
    return;
  }

  // 2. Claude API で要約
  let summary = null;
  if (HAS_CLAUDE) {
    console.log('🤖 Claude APIで要約を生成中...');
    summary = await summarizeWithClaude(unique);
    if (summary) {
      console.log('✅ 要約生成完了\n');
      console.log('--- 要約内容 ---');
      console.log(summary);
      console.log('----------------\n');
    }
  }

  // 3. HTML 更新
  console.log('📝 index.html を更新中...');
  const newsHTML  = buildNewsHTML(unique, summary);
  const updated   = updateHTML(newsHTML);

  if (updated) {
    console.log('✅ index.html 更新完了');
    setOutput('has_updates', 'true');
  } else {
    setOutput('has_updates', 'false');
  }

  // 4. 更新ログを保存
  const log = {
    date:          new Date().toISOString(),
    reportType:    REPORT_TYPE,
    articlesFound: unique.length,
    hasSummary:    !!summary,
    sources:       CONFIG.sources.map(s => s.name),
  };
  fs.writeFileSync('scripts/last-update.json', JSON.stringify(log, null, 2), 'utf8');

  console.log('\n🎉 Daily Update 完了！');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
