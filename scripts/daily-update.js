// scripts/daily-update.js（中東戦争レポート用）
import fetch from 'node-fetch';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

const TODAY = new Date().toLocaleDateString('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
});
const TODAY_ISO = new Date().toISOString().split('T')[0];
const HAS_CLAUDE = !!process.env.ANTHROPIC_API_KEY;

// ── RSS情報源 ──────────────────────────────────
const RSS_SOURCES = [
  { name: 'NHK国際',   url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
];

// CSIS専用RSSソース（複数URLを試す）
const CSIS_RSS_SOURCES = [
  'https://www.csis.org/feeds/all/rss.xml',
  'https://www.csis.org/rss',
  'https://feeds.feedburner.com/csis-all',
];

const KEYWORDS = [
  'イラン','イスラエル','ガザ','中東','ホルムズ','レバノン','ヒズボラ','ハマス',
  'iran','israel','gaza','middle east','hezbollah','hamas','hormuz','lebanon',
  'パレスチナ','palestine','ネタニヤフ','netanyahu','テヘラン','tehran'
];

// ── RSS取得 ────────────────────────────────────
async function fetchRSS(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml  = await res.text();
    const data = await parseStringPromise(xml, { explicitArray: false });
    const channel = data?.rss?.channel || data?.feed;
    const items   = channel?.item || channel?.entry || [];
    const list    = Array.isArray(items) ? items : [items];
    return list.slice(0, 20).map(item => ({
      title:   (item.title?._ || item.title || '').trim(),
      link:    item.link?.href || item.link || '',
      pubDate: item.pubDate || item.updated || '',
      desc:    (item.description?._ || item.description || item.summary?._ || '')
               .replace(/<[^>]+>/g, '').trim(),
      source:  source.name,
    }));
  } catch (e) {
    console.warn(`  ⚠ ${source.name}: ${e.message}`);
    return [];
  }
}

function isRelevant(item) {
  const text = `${item.title} ${item.desc}`.toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// ── Claude API ────────────────────────────────
async function callClaude(prompt, maxTokens = 800) {
  if (!HAS_CLAUDE) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const raw  = data.content?.[0]?.text?.trim() || null;
    if (!raw) return null;
    return raw
      .replace(/^```(?:html|json)?\s*/gi, '')
      .replace(/\s*```$/gi, '')
      .trim();
  } catch (e) {
    console.warn(`  ⚠ Claude API: ${e.message}`);
    return null;
  }
}

function readHTML()       { return fs.readFileSync('index.html', 'utf8'); }
function writeHTML(html)  { fs.writeFileSync('index.html', html, 'utf8'); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSIS最新レポートを戦況マップに表示
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateCSISReport(html) {
  if (!html.includes('<!-- MAP:CSIS:START -->')) return html;
  console.log('\n🔍 CSIS中東レポートを取得中...');

  let csisArticles = [];
  for (const url of CSIS_RSS_SOURCES) {
    const items = await fetchRSS({ name: 'CSIS', url });
    const filtered = items.filter(a =>
      /iran|israel|middle east|gulf|saudi|hormuz|hamas|hezbollah/i.test(a.title + a.desc)
    );
    if (filtered.length > 0) {
      csisArticles = filtered;
      console.log(`  ✅ CSIS取得成功: ${filtered.length}件`);
      break;
    }
    console.log(`  ⚠ CSIS取得失敗: ${url}`);
  }

  if (csisArticles.length === 0) {
    console.log('  ⚠ CSISレポートなし・スキップ');
    return html;
  }

  const listItems = csisArticles.slice(0, 10).map(a => {
    const title = a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const date  = a.pubDate
      ? new Date(a.pubDate).toLocaleDateString('ja-JP', {month:'long', day:'numeric'})
      : '';
    return `
    <li style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;gap:3px;">
      <a href="${a.link || '#'}" target="_blank" rel="noopener"
         style="font-size:12px;color:#d5e8f0;text-decoration:none;line-height:1.5;font-weight:500;"
         onmouseover="this.style.color='#5b9bd5'"
         onmouseout="this.style.color='#d5e8f0'">
        ${title}
      </a>
      ${date ? `<span style="font-size:10px;color:var(--gray);">${date}</span>` : ''}
    </li>`;
  }).join('');

  const csisBlock = `<!-- MAP:CSIS:START -->
<div style="margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
    <div style="font-family:'Noto Serif JP';font-size:15px;font-weight:700;color:#5b9bd5;">
      🆙 CSIS 中東分析レポート
      <span style="font-size:10px;font-weight:400;color:var(--gray);margin-left:8px;">Center for Strategic and International Studies</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:7px;height:7px;border-radius:50%;background:#e74c3c;animation:blink 1.2s ease-in-out infinite;display:inline-block;"></span>
      <span style="font-size:10px;color:var(--gray);">自動更新：${TODAY}</span>
    </div>
  </div>
  <ul style="list-style:none;padding:0;margin:0;">
    ${listItems}
  </ul>
  <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:10px;color:var(--gray);">※ CSIS公式サイトより自動収集。中東関連のみ表示。</span>
    <a href="https://www.csis.org/topics/conflict-and-stabilization/middle-east" target="_blank" rel="noopener"
       style="font-size:10px;color:var(--gold);text-decoration:none;border-bottom:1px solid rgba(201,168,76,0.3);">
      CSIS公式サイト →
    </a>
  </div>
</div>
<!-- MAP:CSIS:END -->`;

  html = html.replace(
    /<!-- MAP:CSIS:START -->[\s\S]*?<!-- MAP:CSIS:END -->/,
    csisBlock
  );
  console.log(`  ✅ CSISレポート ${csisArticles.slice(0,10).length}件を表示`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 最新ニュースボックス（NEWS_START～NEWS_END）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateNewsBox(html, articles) {
  console.log('\n📡 最新ニュースボックスを更新中...');
  let summary = null;
  if (HAS_CLAUDE && articles.length > 0) {
    const headlines = articles.slice(0, 12)
      .map((a, i) => `${i+1}. [${a.source}] ${a.title}`)
      .join('\n');
    summary = await callClaude(
`あなたは中東情勢の専門アナリストです。以下の最新ニュースをもとに${TODAY}時点の情勢を日本語で要約してください。
【出力ルール】箇条書き（• で始まる）で3〜5点。生テキストのみ出力（HTMLタグ・マークダウン不要）。
【ニュース】\n${headlines}`, 500
    );
  }

  const articleItems = articles.slice(0, 6).map(a => {
    const t = a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="background:rgba(46,117,182,0.15);border:1px solid rgba(46,117,182,0.3);border-radius:3px;padding:1px 6px;font-size:10px;color:#5b9bd5;white-space:nowrap;flex-shrink:0;">${a.source}</span>
      <a href="${a.link||'#'}" target="_blank" rel="noopener" style="font-size:12px;color:#ccd8e4;text-decoration:none;line-height:1.5;">${t}</a>
    </div>`;
  }).join('\n');

  const summaryHTML = summary
    ? summary.split('\n').filter(l=>l.trim())
        .map(l=>`<p style="font-size:12px;line-height:1.8;color:#ccd8e4;margin:3px 0;">${l.trim()}</p>`)
        .join('\n')
    : '';

  const newsBlock = `<!-- NEWS_START -->
<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px;margin:20px 0;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
    <div style="font-family:'Noto Serif JP';font-size:15px;font-weight:700;color:#FFD700;">🆙 最新ニュース</div>
    <div style="font-size:10px;color:var(--gray);">自動更新：${TODAY}</div>
  </div>
  ${summaryHTML ? `<div style="background:rgba(46,117,182,0.06);border-radius:6px;padding:12px;margin-bottom:12px;border-left:3px solid #2e75b6;"><div style="font-size:10px;color:var(--gold);letter-spacing:1px;margin-bottom:6px;">🤖 AI要約</div>${summaryHTML}</div>` : ''}
  <div style="display:flex;flex-direction:column;gap:0;">${articleItems}</div>
  <div style="margin-top:8px;font-size:10px;color:var(--gray);">※ NHK・Al Jazeera・BBC より自動収集。内容は各情報源でご確認ください。</div>
</div>
<!-- NEWS_END -->`;

  if (html.includes('<!-- NEWS_START -->')) {
    html = html.replace(/<!-- NEWS_START -->[\s\S]*?<!-- NEWS_END -->/m, newsBlock);
  } else {
    const idx = html.indexOf('<div class="container">');
    if (idx !== -1) {
      const pos = idx + '<div class="container">'.length;
      html = html.slice(0, pos) + '\n' + newsBlock + '\n' + html.slice(pos);
    }
  }
  console.log('  ✅ ニュースボックス更新完了');
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// タイムライン先頭追記 → 背景編に通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function prependTimeline(html, articles) {
  if (!html.includes('<!-- TIMELINE:INSERT -->')) return { html, item: null };
  console.log('\n📅 タイムラインを更新中...');
  const headlines = articles.slice(0, 8).map((a, i) => `${i+1}. ${a.title}`).join('\n');
  const item = await callClaude(
`以下のニュースから${TODAY}の最重要イベントを1件選んでHTML形式で出力してください。
重要なイベントがなければ <!-- SKIP --> のみ出力。
<div class="tl-item"><div class="tl-date">${TODAY_ISO.slice(5,7)}月<br>${TODAY_ISO.slice(8)}日</div><div class="tl-dot"></div><div class="tl-content"><div class="tl-ev">絵文字 タイトル（20文字以内）</div><div class="tl-desc">説明（60文字以内）</div></div></div>
【ニュース】\n${headlines}`, 300
  );
  if (!item || item.includes('SKIP') || !item.includes('tl-item')) {
    console.log('  ⚠ 追記なし');
    return { html, item: null };
  }
  html = html.replace('<!-- TIMELINE:INSERT -->', `<!-- TIMELINE:INSERT -->\n${item}`);
  console.log('  ✅ タイムライン追記完了');
  return { html, item };
}

function updateTimelineNotice(html, item) {
  if (!html.includes('<!-- TIMELINE:UPDATE:START -->') || !item) return html;
  const evMatch   = item.match(/<div class="tl-ev">(.*?)<\/div>/s);
  const descMatch = item.match(/<div class="tl-desc">(.*?)<\/div>/s);
  const evText    = evMatch   ? evMatch[1].trim()   : '';
  const descText  = descMatch ? descMatch[1].trim()  : '';
  if (!evText) return html;
  const notice = `<!-- TIMELINE:UPDATE:START -->
<div style="background:rgba(46,117,182,0.08);border-left:3px solid #2e75b6;border-radius:0 6px 6px 0;padding:10px 16px;margin:10px 0 16px;">
  <div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;margin-bottom:5px;font-family:'Oswald';">🆙 最新タイムライン更新（${TODAY}）</div>
  <div style="font-size:13px;font-weight:700;color:#FFD700;">${evText}</div>
  ${descText ? `<div style="font-size:12px;color:var(--gray);margin-top:3px;">${descText}</div>` : ''}
</div>
<!-- TIMELINE:UPDATE:END -->`;
  html = html.replace(/<!-- TIMELINE:UPDATE:START -->[\s\S]*?<!-- TIMELINE:UPDATE:END -->/, notice);
  console.log('  ✅ 背景編に最新タイムライン情報を掲載');
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 戦況マップの現在時刻・戦況編に更新通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateMapDatetime(html) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
  const timeStr = now.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
  const datetime = `${dateStr} ${timeStr}`;

  if (html.includes('<!-- MAP:DATETIME -->')) {
    html = html.replace('<!-- MAP:DATETIME -->',
      `<!-- MAP:DATETIME -->
<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);border-radius:6px;padding:6px 14px;margin-bottom:14px;font-size:12px;">
  <span style="color:var(--gold);font-family:'Oswald';letter-spacing:1px;">🕐 ${datetime}現在の戦況</span>
  <span style="width:8px;height:8px;border-radius:50%;background:#e74c3c;animation:blink 1.2s ease-in-out infinite;display:inline-block;"></span>
</div>`);
  }

  if (html.includes('<!-- WAR:UPDATE:START -->')) {
    const notice = `<!-- WAR:UPDATE:START -->
<div style="background:rgba(46,117,182,0.08);border-left:3px solid #2e75b6;border-radius:0 6px 6px 0;padding:10px 16px;margin:10px 0 16px;">
  <div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;margin-bottom:5px;font-family:'Oswald';">🆙 戦況マップ更新</div>
  <div style="font-size:13px;font-weight:700;color:#FFD700;">${datetime}現在の戦況図</div>
  <div style="font-size:11px;color:var(--gray);margin-top:3px;">詳細は「<a href="#" onclick="show('map');return false;" style="color:#5b9bd5;text-decoration:none;">戦況マップ</a>」タブをご覧ください</div>
</div>
<!-- WAR:UPDATE:END -->`;
    html = html.replace(/<!-- WAR:UPDATE:START -->[\s\S]*?<!-- WAR:UPDATE:END -->/, notice);
  }

  if (!html.includes('@keyframes blink')) {
    html = html.replace('</style>', `@keyframes blink{0%,100%{opacity:1;}50%{opacity:0.3;}}\n</style>`);
  }
  console.log(`  ✅ 戦況マップに現在時刻（${datetime}）を表示`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 経済編の最新情報通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function updateEconomyNotice(html, articles) {
  if (!html.includes('<!-- ECONOMY:UPDATE:START -->')) return html;
  const econArticles = articles.filter(a =>
    /原油|石油|ガソリン|エネルギー|ホルムズ|経済|制裁|LNG|oil|energy|sanction|price/i
      .test(a.title + a.desc)
  ).slice(0, 5);
  if (econArticles.length === 0) { console.log('  ⚠ 経済ニュースなし・スキップ'); return html; }

  const headlines = econArticles.map((a, i) => `${i+1}. [${a.source}] ${a.title}`).join('\n');
  const urlMap = {};
  econArticles.forEach((a, i) => { urlMap[i+1] = a.link || ''; });

  const result = await callClaude(
`以下の経済ニュースから最重要1件を選んでください。
JSON形式のみ: {"source_num": 番号, "topic": "トピック名（15文字以内）", "summary": "概要（40文字以内）"}
【ニュース】\n${headlines}`, 200
  );

  let topic = '経済・エネルギー情勢', summary = '', url = '';
  if (result) {
    try {
      const p = JSON.parse(result);
      topic   = p.topic   || topic;
      summary = p.summary || '';
      url     = urlMap[p.source_num] || '';
    } catch(e) {}
  }

  const linkO = url ? `<a href="${url}" target="_blank" rel="noopener" style="color:#5b9bd5;text-decoration:none;border-bottom:1px solid rgba(91,155,213,0.3);">` : '<span style="color:#5b9bd5;">';
  const linkC = url ? '</a>' : '</span>';

  const notice = `<!-- ECONOMY:UPDATE:START -->
<div style="background:rgba(46,117,182,0.08);border-left:3px solid #2e75b6;border-radius:0 6px 6px 0;padding:10px 16px;margin:10px 0 16px;">
  <div style="font-size:10px;color:var(--gold);letter-spacing:1.5px;margin-bottom:5px;font-family:'Oswald';">🆙 最新情報（${TODAY}）</div>
  <div style="font-size:13px;font-weight:700;color:#FFD700;">${linkO}${topic}について更新${linkC}</div>
  ${summary ? `<div style="font-size:12px;color:var(--gray);margin-top:3px;">${summary}</div>` : ''}
  <div style="font-size:11px;color:var(--gray);margin-top:4px;">詳細は「<a href="#" onclick="show('economy');return false;" style="color:#5b9bd5;text-decoration:none;">経済影響</a>」タブをご覧ください</div>
</div>
<!-- ECONOMY:UPDATE:END -->`;
  html = html.replace(/<!-- ECONOMY:UPDATE:START -->[\s\S]*?<!-- ECONOMY:UPDATE:END -->/, notice);
  console.log(`  ✅ 経済編に最新情報（${topic}）を掲載`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 兵器解説に先頭追記（情報源リンク付き）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function prependWeapons(html, articles) {
  if (!html.includes('<!-- WEAPONS:INSERT -->')) return html;
  const weaponArticles = articles.filter(a =>
    /ミサイル|兵器|武器|爆撃|F-35|B-2|ドローン|防空|missile|weapon|strike|drone|f-35|stealth/i
      .test(a.title + a.desc)
  ).slice(0, 6);
  if (weaponArticles.length === 0) { console.log('  ⚠ 兵器ニュースなし'); return html; }

  const urlMap = {};
  const weaponNews = weaponArticles.map((a, i) => {
    urlMap[i+1] = { url: a.link||'', title: a.title, source: a.source };
    return `${i+1}. [${a.source}] ${a.title}`;
  }).join('\n');

  console.log('\n🔫 兵器解説を更新中...');
  const result = await callClaude(
`以下の兵器ニュースから最重要1件を選んでください。
JSON形式のみ: {"skip": false, "source_nums": [番号], "icon": "絵文字", "name": "兵器名", "type": "種別｜使用国", "summary": "概要30文字以内", "significance": "意義30文字以内"}
重要情報なければ {"skip": true}
【ニュース】\n${weaponNews}`, 300
  );

  if (!result) return html;
  let parsed;
  try { parsed = JSON.parse(result); } catch(e) { return html; }
  if (parsed.skip || !parsed.name) { console.log('  ⚠ 追記なし'); return html; }

  const card = `<div class="weapon-card">
  <div class="weapon-head"><div class="weapon-icon" style="background:rgba(46,117,182,0.2);">${parsed.icon||'🚀'}</div>
  <div><div class="weapon-name">${parsed.name}</div><div class="weapon-type">${parsed.type||''}</div></div></div>
  <span class="weapon-tag" style="background:rgba(255,215,0,0.15);color:#FFD700;">🆙 ${TODAY_ISO} 新着</span>
  <div class="spec-row"><span class="spec-label">概要</span><span class="spec-val">${parsed.summary||''}</span></div>
  <div class="spec-row"><span class="spec-label">意義</span><span class="spec-val">${parsed.significance||''}</span></div>
</div>`;
  html = html.replace('<!-- WEAPONS:INSERT -->', `<!-- WEAPONS:INSERT -->\n${card}`);

  // 情報源リスト
  if (html.includes('<!-- WEAPONS:SOURCES -->')) {
    const sourceNums = Array.isArray(parsed.source_nums) ? parsed.source_nums : [parsed.source_nums];
    const links = sourceNums.filter(n=>urlMap[n]?.url).map(n => {
      const a = urlMap[n];
      return `<li style="margin:4px 0;"><a href="${a.url}" target="_blank" rel="noopener" style="color:#5b9bd5;font-size:11px;text-decoration:none;border-bottom:1px solid rgba(91,155,213,0.3);">[${a.source}] ${a.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</a></li>`;
    }).join('\n');
    if (links) {
      const srcBlock = `<!-- WEAPONS:SOURCES -->
<div style="margin-top:20px;padding:14px 18px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;">
  <div style="font-size:11px;color:var(--gold);letter-spacing:1.5px;margin-bottom:10px;font-family:'Oswald';">📎 情報源リスト（自動収集）</div>
  <ul style="list-style:none;padding:0;margin:0;">${links}</ul>
  <div style="font-size:10px;color:var(--gray);margin-top:8px;">最終更新：${TODAY}</div>
</div>`;
      html = html.replace(/<!-- WEAPONS:SOURCES -->[\s\S]*?(?=<div class="alert-box"|<!-- WEAPONS:SOURCES -->$)/, srcBlock + '\n');
    }
  }
  console.log(`  ✅ 兵器解説追記完了（${parsed.name}）`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シンクタンクに新カードを先頭追記（リンク付き）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function prependThinktank(html, articles) {
  if (!html.includes('<!-- THINKTANK:INSERT -->')) return html;
  const analysisArticles = articles.filter(a =>
    /分析|評価|見解|報告|研究|専門家|政策|戦略|安全保障|外交|停戦|核|制裁/i
      .test(a.title + a.desc)
  ).slice(0, 6);
  if (analysisArticles.length === 0) { console.log('  ⚠ シンクタンク関連なし'); return html; }

  const urlMap = {};
  const news = analysisArticles.map((a, i) => {
    urlMap[i+1] = a.link || '';
    return `${i+1}. [${a.source}] ${a.title} — ${a.desc.slice(0,80)}`;
  }).join('\n');

  console.log('\n🏛 シンクタンクを更新中...');
  const result = await callClaude(
`中東情勢の専門アナリストとして、以下のニュースをもとに${TODAY}の分析・見解を1件作成してください。
JSON形式のみ: {"skip": false, "source_num": 番号, "org": "機関名・メディア名", "quote": "分析（80〜120文字）"}
重要分析なければ {"skip": true}
【ニュース】\n${news}`, 300
  );

  if (!result) return html;
  let parsed;
  try { parsed = JSON.parse(result); } catch(e) { return html; }
  if (parsed.skip || !parsed.org) { console.log('  ⚠ 追記なし'); return html; }

  const srcUrl = urlMap[parsed.source_num] || '';
  const orgHTML = srcUrl
    ? `<a href="${srcUrl}" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:none;border-bottom:1px solid rgba(201,168,76,0.4);">${parsed.org} 🔗</a>`
    : parsed.org;

  const card = `<div class="tt-card">
  <div class="tt-org">${orgHTML}</div>
  <div class="tt-quote">${parsed.quote.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  <div class="tt-date" style="color:#FFD700;">🆙 ${TODAY}｜自動収集</div>
</div>`;
  html = html.replace('<!-- THINKTANK:INSERT -->', `<!-- THINKTANK:INSERT -->\n${card}`);
  console.log(`  ✅ シンクタンク追記完了（${parsed.org}）`);
  return html;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  console.log('\n🚀 中東戦争レポート 毎日自動更新 開始');
  console.log(`   実行日時: ${TODAY}`);
  console.log(`   Claude API: ${HAS_CLAUDE ? '✅ 利用可能' : '⚠ なし（見出しのみ）'}\n`);

  if (!fs.existsSync('index.html')) { console.error('❌ index.html が見つかりません'); process.exit(1); }

  // RSS収集
  console.log('📡 RSSフィードを収集中...');
  const allArticles = [];
  for (const src of RSS_SOURCES) {
    process.stdout.write(`   ${src.name}... `);
    const items = await fetchRSS(src);
    const relevant = items.filter(isRelevant);
    console.log(`${items.length}件 → ${relevant.length}件関連`);
    allArticles.push(...relevant);
  }

  const seen = new Set();
  const articles = allArticles.filter(a => { if(seen.has(a.title)) return false; seen.add(a.title); return true; });
  console.log(`\n📊 合計 ${articles.length} 件の関連記事を収集\n`);

  if (articles.length === 0) { console.log('⚠ 関連記事なし。更新スキップ。'); process.exit(0); }

  let html = readHTML();
  html = await updateCSISReport(html);              // CSISレポート更新
  html = await updateNewsBox(html, articles);       // ニュースボックス上書き
  const { html: html2, item } = await prependTimeline(html, articles);
  html = html2;
  html = updateTimelineNotice(html, item);          // ① 背景編に更新情報
  html = updateMapDatetime(html);                   // ② 戦況マップ・戦況編更新
  html = await updateEconomyNotice(html, articles); // ③ 経済編に最新情報
  html = await prependWeapons(html, articles);      // 兵器解説追記
  html = await prependThinktank(html, articles);    // シンクタンク追記

  writeHTML(html);
  fs.writeFileSync('scripts/last-update.json', JSON.stringify({ date: new Date().toISOString(), articles: articles.length }), 'utf8');
  console.log('\n🎉 中東レポート自動更新完了！');
}

main().catch(err => { console.error('❌ エラー:', err.message); process.exit(1); });
