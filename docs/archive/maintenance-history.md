# 過去の作業記録（現行手順ではありません）

## 作業ログ

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

