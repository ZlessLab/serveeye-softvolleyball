# ソフトバレー得点管理アプリ（ServeEye）

4人制ソフトバレーボール用 PWA スコア管理アプリ。

## 起動方法

```
node server.js
```

ブラウザで `http://localhost:8080` を開く。

---

## 作業ログ

### 2026-11-18（ブランチ: feat/price980-trial / 未デプロイ）

#### 価格改定（個人ライセンス ¥980 一本化）と無料体験ライセンスの追加

**変更ファイル:**
- `config/plans.js` — launch/standard とも price_jpy を 980 に統一、launch のキャンペーン（先着100本）を終了（campaign: null）、trial プラン定義を追加
- `api/auth/verify.js` — ライセンスの有効期限チェックを追加（expires_at を過ぎていれば 403 'License expired'）。成功レスポンスに expires_at を含める
- `api/auth/session.js` — 新規。起動時のセッション再確認用（session_token で状態・期限を再チェック）
- `soft-volleyball-score.html` — 認証時に expires_at を保存、起動時24時間ごとの再確認（オフライン時は猶予）、設定画面に「無料体験中（あと○日）」表示、期限切れエラーメッセージ、価格表記 980円
- `index.html` — 価格表記 980円（メタ情報・購入ボタン・料金カード）、料金カードに無料体験（30日間・Instagram DM受付）の案内を追加
- `legal/terms.html` — 価格 980円、無料体験ライセンスの定義を追加
- `legal/tokushoho.html` — 販売価格を「個人ライセンス 980円」に統一、販売数量・申込期間の記載を改定
- `.env.example` — 価格コメント更新、LICENSE_CODE_SECRET / STRIPE_PAYMENT_LINK_URL を追記
- `scripts/issue-trial-license.js` — 新規。無料体験ライセンス発行スクリプト（購入時と同じコード導出、expires_at=30日）
- `supabase/add_trial_plan.sql` — 新規。trial プランを plans テーブルへ追加するSQL
- `supabase/update_prices_980.sql` — 新規。DB側の価格統一とキャンペーン無効化SQL

**動作確認済み:**
- `npm test` 8/8 パス
- 変更した全JSファイルの構文チェック（node --check）OK
- 価格表記の残存チェック（1,980円/2,980円は履歴コメントのみ）

**未実施（本番反映に必要）:**
- Stripe で ¥980 価格を作成し、Vercel 環境変数 STRIPE_PRICE_LAUNCH_INDIVIDUAL を差し替え
- Supabase で add_trial_plan.sql / update_prices_980.sql を実行
- 本番での体験コード発行→認証→期限切れ判定の一連の動作確認

**備考:**
- 体験の期限切れは「起動時・オンライン・前回確認から24時間経過後」に判定する。体育館などオフライン環境では期限を過ぎても次回オンライン時まで使える猶予仕様（現場利用を止めないため）
- deleteHistoryItem() 内の confirm() は今回もスコープ外（従来からの申し送り）

### 2026-06-26

#### confirm() → showConfirm() 統一

**変更ファイル:** `soft-volleyball-score.html`

**変更内容:**
- `promptNextSet()` 内のネイティブ `confirm()` を `showConfirm()` に変更
- `confirmReset()` 内のネイティブ `confirm()` を `showConfirm()` に変更

**動作確認済み:**
- リセット確認：アプリ内カスタムダイアログ（黒背景・中央表示）で動作
- 次セット（未終了時）確認：アプリ内カスタムダイアログで動作
- ブラウザ標準ダイアログ（OS依存グレーポップアップ）は表示されないことを確認

**備考:**
- `deleteHistoryItem()` 内の `confirm()` は未対応（今回スコープ外）
