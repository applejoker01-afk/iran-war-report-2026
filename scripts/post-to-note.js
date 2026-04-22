// scripts/post-to-note.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Noteへの自動投稿スクリプト
//
// 動作:
//   1. GitHub PagesのURLを含むNote記事（下書き）を作成
//   2. 投稿内容: タイトル・概要文・GitHub Pagesリンク・ハッシュタグ
//
// 必要な環境変数:
//   NOTE_SESSION_TOKEN  - NoteのCookieから取得したセッショントークン
//   NOTE_USER_ID        - NoteのユーザーID（数値）
//   PAGES_URL           - GitHub PagesのURL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fetch from 'node-fetch';

// ── 設定 ──────────────────────────────────
const CONFIG = {
  sessionToken: process.env.NOTE_SESSION_TOKEN,
  userId: process.env.NOTE_USER_ID,
  pagesUrl: process.env.PAGES_URL || 'https://yourname.github.io/middle-east-report',
  noteApiBase: 'https://note.com/api/v1',

  // 記事設定
  article: {
    title: '🌍【中東戦争レポート2026】イスラエル・イラン戦争の全貌と日本経済への影響',
    hashtags: ['中東情勢', 'イラン戦争', 'イスラエル', '国際情勢', '地政学', '原油', '日本経済', 'ホルムズ海峡', '兵器解説'],
    publishStatus: 'draft', // 'draft'（下書き）または 'published'（即公開）
  }
};

// ── Note記事の本文テンプレート ──────────────
function buildArticleBody(pagesUrl, today) {
  return `
## 📌 この記事について

本記事は、2026年の中東情勢（イスラエル・イラン戦争）を**戦況・兵器・経済**の3視点から多角的に分析したレポートです。

**更新日**: ${today}

---

## 📊 インタラクティブ解説ビジュアルはこちら

下記のリンクから、**タイムライン・戦況マップ・兵器解説・経済グラフ・シンクタンク分析**を含む完全版インタラクティブレポートをご覧いただけます。

👉 **[中東戦争レポート2026 インタラクティブ解説](${pagesUrl})**

（PC・スマートフォン両対応）

---

## 🔑 今回のレポートの主要ポイント

### 1️⃣ 歴史的転換点：2026年2月28日

米国とイスラエルが史上初の合同軍事作戦でイランを攻撃。ハメネイ最高指導者が暗殺されました。最初の24時間だけで1000か所以上を攻撃するという、前例のない規模の軍事行動でした。

### 2️⃣ ホルムズ海峡封鎖——日本のエネルギー動脈が止まった

3月2日、イランがホルムズ海峡を封鎖。世界の原油供給の約20%が通過するこの海峡が止まったことで、日本でも原油価格が60ドル台から最高117ドルへ急騰。ガソリンは158円から190円へ約20%上昇しました。

**日本の原油輸入の94%は中東依存**です。これは私たちの生活に直接影響する問題です。

### 3️⃣ 今回使われた最新鋭兵器

- **B-2スピリット**（ステルス爆撃機）：米本土から18時間かけてイランへ
- **GBU-57 MOP**（バンカーバスター）：地下60mを貫通する超大型爆弾
- **F-35Iアディール**：イランの防空網を無力化、史上初の空対空撃墜
- **LUCAS**：イランのドローン「シャヘド136」を逆工学でコピーした新兵器

### 4️⃣ シンクタンクの多角的評価

CSIS・IISS・防衛研究所・JETROなどの分析によれば、今回の攻撃はガザ紛争の「大詰め」としての側面を持ち、単なる核問題の抑止を超えた体制転換を視野に入れた戦略的行動とされています。

---

## 🗺 インタラクティブビジュアルの内容

完全版レポートでは以下をご覧いただけます：

| タブ | 内容 |
|------|------|
| 📄 台本・解説 | 25〜30分動画の完全台本 |
| 📅 タイムライン | 2023年10月〜現在の主要11イベント |
| 🗺 戦況マップ | 中東地図＋攻撃ルート図解 |
| 🔫 兵器解説 | 主要6兵器の詳細スペック |
| 📈 経済影響 | 原油・ガソリン価格グラフ |
| 🏛 シンクタンク | 8機関の分析まとめ |

👉 **[インタラクティブレポートを見る](${pagesUrl})**

---

## 📚 主な情報源

- CSIS（米戦略国際問題研究所）「Iran War By the Numbers」2026年3月
- 防衛研究所 NIDSコメンタリー第423号 2026年3月
- 日本国際問題研究所 国問研戦略コメント（2026-8）
- JETRO 地域・分析レポート 2026年4月
- 日本経済新聞・Bloomberg・時事通信 各種報道

※ 本記事の情報は${today}時点の公開情報に基づいています。情勢は急変する可能性があります。
`.trim();
}

// ── メイン処理 ──────────────────────────────
async function postToNote() {
  // バリデーション
  if (!CONFIG.sessionToken) {
    console.error('❌ ERROR: NOTE_SESSION_TOKEN が設定されていません');
    console.error('   GitHub Secrets に NOTE_SESSION_TOKEN を追加してください');
    process.exit(1);
  }
  if (!CONFIG.userId) {
    console.error('❌ ERROR: NOTE_USER_ID が設定されていません');
    process.exit(1);
  }

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const body = buildArticleBody(CONFIG.pagesUrl, today);
  const hashtags = CONFIG.article.hashtags.map(t => `#${t}`).join(' ');

  console.log('📝 Note記事を作成中...');
  console.log(`   タイトル: ${CONFIG.article.title}`);
  console.log(`   GitHub Pages URL: ${CONFIG.pagesUrl}`);
  console.log(`   投稿ステータス: ${CONFIG.article.publishStatus}`);

  try {
    // Note API: 記事の下書き作成
    const response = await fetch(`${CONFIG.noteApiBase}/text_notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `note_gw_session=${CONFIG.sessionToken}`,
        'X-Note-Client-Version': '3.0.0',
        'User-Agent': 'Mozilla/5.0 (compatible; NoteAutoPost/1.0)',
        'Referer': 'https://note.com',
        'Origin': 'https://note.com',
      },
      body: JSON.stringify({
        note: {
          title: CONFIG.article.title,
          body: body,
          status: CONFIG.article.publishStatus,
          tags: CONFIG.article.hashtags,
          type: 'TextNote',
          can_comment: true,
          is_limited: false,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Note API エラー: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const result = await response.json();
    const noteUrl = `https://note.com/${result.data?.user?.urlname}/n/${result.data?.key}`;

    console.log('');
    console.log('✅ Note記事の作成が完了しました！');
    console.log(`   記事URL: ${noteUrl}`);
    console.log(`   記事ID: ${result.data?.id}`);
    console.log(`   ステータス: ${result.data?.status}`);

    if (CONFIG.article.publishStatus === 'draft') {
      console.log('');
      console.log('📌 記事は下書き状態です。');
      console.log('   Noteの編集画面で内容を確認してから公開してください。');
      console.log(`   編集URL: https://note.com/notes/${result.data?.id}/edit`);
    }

  } catch (error) {
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('');
      console.error('❌ 認証エラー: セッショントークンが無効です');
      console.error('   NOTE_SESSION_TOKEN を更新してください（取得方法は README 参照）');
    } else if (error.message.includes('429')) {
      console.error('');
      console.error('❌ レート制限エラー: しばらく待ってから再試行してください');
    } else {
      console.error('');
      console.error('❌ 投稿エラー:', error.message);
    }
    process.exit(1);
  }
}

// 実行
postToNote();
