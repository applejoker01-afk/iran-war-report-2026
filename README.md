# 🌍 中東戦争レポート 2026 — GitHub Pages + Note 自動掲載システム

## 概要

このリポジトリは、中東情勢（イスラエル・イラン戦争）の解説レポートを
GitHub Pagesでホスティングし、Noteに自動投稿するシステムです。

```
git push → GitHub Pages 自動デプロイ → Note に下書き記事を自動作成
```

---

## 📁 ファイル構成

```
middle-east-report/
├── index.html               ← 統合レポート本体（台本+全ビジュアル）
├── .github/
│   └── workflows/
│       └── deploy.yml       ← GitHub Actions設定
├── scripts/
│   ├── post-to-note.js      ← Note自動投稿スクリプト
│   └── package.json
└── README.md
```

---

## 🚀 セットアップ手順

### Step 1: GitHubリポジトリを作成

```bash
# リポジトリ名: middle-east-report
# Public リポジトリとして作成（GitHub Pages の無料利用に必要）
```

### Step 2: ファイルをアップロード

```bash
git init
git add .
git commit -m "初回: 中東戦争レポート2026"
git branch -M main
git remote add origin https://github.com/あなたのID/middle-east-report.git
git push -u origin main
```

### Step 3: GitHub Pages を有効化

1. GitHubのリポジトリページへ
2. `Settings` → `Pages`
3. `Source`: `GitHub Actions` を選択
4. 保存

### Step 4: Note セッショントークンを取得

**Chromeで行う手順:**
1. Noteにログイン (https://note.com)
2. F12キーで開発者ツールを開く
3. `Application` → `Cookies` → `https://note.com`
4. `note_gw_session` の値をコピー

**注意:** トークンは定期的に失効します。エラーが出たら再取得してください。

### Step 5: GitHub Secrets を設定

GitHubリポジトリの `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

| シークレット名 | 値 | 取得方法 |
|---|---|---|
| `NOTE_SESSION_TOKEN` | Cookieの `note_gw_session` の値 | Step 4で取得 |
| `NOTE_USER_ID` | NoteのユーザーID（数値） | Noteプロフィールページで確認 |
| `PAGES_URL` | `https://あなたのID.github.io/middle-east-report` | Step 3後に確認 |

### Step 6: 動作確認

ファイルを変更して `git push` するだけで自動実行されます！

```bash
git add .
git commit -m "レポート更新"
git push
```

---

## ⚙️ カスタマイズ

### Note記事を即公開したい場合

`scripts/post-to-note.js` の `publishStatus` を変更:

```javascript
publishStatus: 'published', // 'draft' → 'published' に変更
```

### 記事タイトルを変更したい場合

```javascript
title: 'あなたのタイトル',
```

### 手動で投稿だけしたい場合

GitHub Actions の `Actions` タブ → `Deploy & Post to Note` → `Run workflow`

---

## 🔒 セキュリティ注意事項

- `NOTE_SESSION_TOKEN` は**絶対に**コードにハードコードしないでください
- トークンは GitHub Secrets 経由でのみ使用してください
- リポジトリは Public ですが、Secrets は外部から見えません

---

## ❓ トラブルシューティング

| エラー | 原因 | 対処法 |
|---|---|---|
| `401 Unauthorized` | セッショントークン失効 | Step 4を再実行してSecretを更新 |
| `403 Forbidden` | ユーザーID誤り | NoteのユーザーIDを確認 |
| `429 Too Many Requests` | レート制限 | 少し待ってから再実行 |
| Pages が表示されない | Pages未設定 | Step 3を確認 |

---

## 📊 情報源

- CSIS / IISS / 防衛省防衛研究所 / JIIA / JETRO
- 日本経済新聞・Bloomberg・時事通信

情報は2026年4月22日時点のものです。
