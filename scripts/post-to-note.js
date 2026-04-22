import fs from 'fs';

const pagesUrl = process.env.PAGES_URL || 'YOUR_PAGES_URL';
const today = new Date().toLocaleDateString('ja-JP', {
  year: 'numeric', month: 'long', day: 'numeric'
});

const draft = `
タイトル：
🌍【中東戦争レポート2026】イスラエル・イラン戦争の全貌と日本経済への影響

本文：
📌 更新日：${today}

インタラクティブ解説ビジュアルはこちら👇
${pagesUrl}

（タイムライン・戦況マップ・兵器解説・経済グラフをご覧いただけます）

---

## 今回のレポートの主要ポイント

### 1️⃣ 2026年2月28日：米・イスラエル合同でイランを攻撃
史上初の米・イスラエル合同軍事作戦。ハメネイ最高指導者が暗殺されました。

### 2️⃣ ホルムズ海峡封鎖で日本に直撃
原油価格が60ドル台から最高117ドルへ急騰。ガソリンは158円→190円に上昇。日本の原油輸入の94%は中東依存です。

### 3️⃣ 今回使われた最新鋭兵器
- B-2スピリット（ステルス爆撃機）：米本土から18時間かけてイランへ
- GBU-57 MOP（バンカーバスター）：地下60mを貫通
- F-35Iアディール：イラン防空網を無力化、史上初の空対空撃墜
- LUCAS：イランのドローンを逆工学でコピーした新兵器

### 4️⃣ シンクタンクの評価
CSIS・IISS・防衛研究所・JETROなどが多角的に分析。

---

詳細はこちら👉 ${pagesUrl}

#中東情勢 #イラン戦争 #イスラエル #国際情勢 #地政学 #原油 #日本経済 #ホルムズ海峡
`.trim();

fs.writeFileSync('note-draft.txt', draft, 'utf8');
console.log('✅ note-draft.txt を生成しました');
console.log('GitHubのActionsタブからダウンロードしてNoteに貼り付けてください');
