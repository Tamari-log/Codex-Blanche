# Codex-Blanche

自分のために作った、サーバーレスなAIクライアントです。  
GitHubに置いてあるのは、URLを使うためです。使いたい人はどうぞ。
🇺🇸 English version → ./README.en.md

---

## Live

👉 https://tamari-log.github.io/Codex-Blanche/

---

## 特徴

- サーバー不要（完全クライアントサイド）
- APIキーはローカル管理（sessionStorage）
- Google Drive連携で設定・履歴を同期
- モデル（Gemini / OpenAI）切り替え可能
- システムプロンプト・温度・コンテキストを細かく制御
- ログ機能あり（開発者向け）

---

## 設計思想

- アプリは「骨組み」、データはユーザーのもの  
- 囲い込みなし、ロックインなし  
- 自分で管理できる人間のためのツール  

一般向けのサービスではありません。

---

## セットアップ

1. APIキーを用意
   - Gemini または OpenAI

2. アプリを開く

3. 設定画面から入力
   - APIキー
   - モデル
   - 必要なら Google Client ID

4. （任意）Google Drive連携で同期

---

## 注意

- APIキーはブラウザのセッションに保存されます  
- セキュリティは自己責任です  
- 同期はシンプルな設計のため、並行編集には弱い場合があります  

---

## 技術

- Vanilla JavaScript
- Google Drive API
- Gemini API / OpenAI API
- TailwindCSS

---

## 免責

このツールの使用によって発生した問題について責任は負いません。  
自分で管理できる人だけ使ってください。

---

## 最後に

必要だったから作りました。  
同じように必要な人がいれば、どうぞ使ってください。
