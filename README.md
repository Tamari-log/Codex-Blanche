# Codex Blanche

**日本語** | [English](README.en.md)

## 法務

- **ソースコードのライセンス**: [MIT License](LICENSE)（著作権者: **Belleval office**。再配布・改変可で、著作権表示と許諾文の維持が条件）
- **再配布について**: MIT の条件に加え、**本ソフトウェアが Belleval office（および本リポジトリ）由来であることが分かるクレジットを残してください**。著作権表示や出典を消して「自作・オリジナル作品のみ」であるかのような主張・表示は行わないでください。
- [利用規約（Markdown）](docs/TERMS_OF_SERVICE.md) / [Terms of Service (Markdown)](docs/TERMS_OF_SERVICE.en.md)
- [プライバシーポリシー（Markdown）](docs/PRIVACY_POLICY.md) / [Privacy Policy (Markdown)](docs/PRIVACY_POLICY.en.md)
- **サイト上のページ（配布ビルド）**: [利用規約](https://tamari-log.github.io/Codex-Blanche/terms.html) · [プライバシー](https://tamari-log.github.io/Codex-Blanche/privacy.html)（同内容を HTML で掲載）

| | リポジトリ |
|---|------------|
| **Web アプリ（本リポジトリ）** | [Tamari-log/Codex-Blanche](https://github.com/Tamari-log/Codex-Blanche) |
| **Android アプリ** | [Tamari-log/Codex-Blanche-App](https://github.com/Tamari-log/Codex-Blanche-App) |

---

ブラウザだけで動く、サーバーレスなAIチャットアプリです。  
個人利用を前提に作っていますが、必要な人はそのまま使えます。

- Live: https://tamari-log.github.io/Codex-Blanche/

---

## このアプリでできること

### 1) AIと会話する

- Gemini / OpenAI を切り替えて利用
- モデルを選択して会話
- ストリーミング表示（対応プロバイダ）
- 生成中の中断（Stop）
- 任意メッセージ地点からの再生成

### 2) 出力スタイルを調整する

- システムプロンプト設定
- 温度（temperature）調整
- 最大トークン（コンテキスト長）調整
- シンキングレベル選択（低い / 普通 / 高い）
  - OpenAIの推論モデルで利用

### 3) プリセットと会話を管理する

- カスタムプリセット作成・編集・削除
- 会話ごとの設定編集（三点リーダー）
- 会話の名前変更 / 削除 / ピン留め
- プリセット適用時に会話へ設定を引き継ぎ
  - モデル / 検索許可 / 温度 / トークン / シンキングレベル / 署名

### 4) 添付・取り込み・書き出し

- 画像添付
- ファイル添付（テキスト抽出して送信）
  - txt / md / json / csv / コード / pdf / docx など
- 履歴インポート（`.js` / `.json`）
- 開発者向けJSON抽出
  - 世界設定ごとの会話JSON抽出
  - 会話履歴のみJSON抽出

### 5) データ保存と同期

- 完全クライアントサイド（サーバー不要）
- 会話・設定・プリセットをローカル保存
- Google Drive同期（任意）
  - ログイン後の同期
  - タイムスタンプベースの競合処理

### 6) UI / UX

- モバイル対応
- ダーク / ライトテーマ
- 文字表示速度切り替え
- チャット下部へ戻るボタン
- 履歴検索付きのサイドパネル

### 7) 開発者向け

- アプリ内ログビューア
- APIエラー表示
- モジュール分割（UI / API / Sync / State / DOM）

---

## クイックスタート

1. アプリを開く  
2. 設定でAPIキーを入力（Gemini または OpenAI）  
3. プロバイダとモデルを選ぶ  
4. 必要ならシステムプロンプト・温度・トークン・シンキングレベルを設定  
5. 送信して会話開始  

Google Drive同期を使う場合は、設定でGoogle Client IDを入れて連携してください。

---

## 設定の場所（迷ったとき用）

- `設定 > カスタムプリセット作成 > モデル設定`
  - プロバイダ / モデル / シンキングレベル
- `設定 > カスタムプリセット作成 > 振る舞い`
  - システムプロンプト / 温度
- `設定 > カスタムプリセット作成 > コンテキスト / 署名`
  - 最大トークン / 署名
- `設定 > 新規会話時のモデル設定`
  - 新規会話で使う既定モデル
- `プリセットパネル > 三点リーダー`
  - 会話設定編集 / プリセット編集 / ピン留め / 削除

---

## データとセキュリティ

- APIキーは `sessionStorage`（設定によっては `localStorage`）に保存されます
- 入力テキストや添付情報は、生成時に選択したAI APIへ送信されます
- 開発者サーバーに会話データを保存する設計ではありません
- 同期機能をONにすると、あなたのGoogle Driveへ保存されます
- セキュリティ運用はユーザー責任です

### セーフティ設定について

- 本アプリは Gemini 呼び出し時に `safetySettings` を無効化して送信します
- 利用ポリシーと運用責任を理解した上で使用してください

---

## 技術スタック

- Vanilla JavaScript
- Tailwind CSS
- Gemini API
- OpenAI API
- Google Drive API

---

---

## 免責

概要は上記「法務」の利用規約に委ねます。詳細は [利用規約](docs/TERMS_OF_SERVICE.md) および [terms.html](https://tamari-log.github.io/Codex-Blanche/terms.html) を参照してください。

