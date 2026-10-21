/* Fixed teaching example. Never accepts team names, scores, or customer state. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ServeEyeDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const frames = [
    { score:[12,12], server:'B', order:[10,11,12,13], title:'サーブ順、もう迷わない。', text:'青クラブのサーブからスタート。緑クラブが得点した場面を操作します。', action:'緑クラブの得点を記録', event:'操作するのは、この固定サンプルだけです。' },
    { score:[13,12], server:'A', order:[11,12,13,10], title:'サーブ権が移ると、自動で回転。', text:'サーブ権が青から緑へ。緑の次のサーバーは #11。得点とローテーションを一緒に管理します。', action:'次のサンプル得点へ', event:'緑クラブ +1点 · サーブ権移動 · #11がサーブ' },
    { score:[14,12], server:'A', order:[11,12,13,10], title:'続けて得点しても、回転しません。', text:'同じチームのサーブが続くため、サーバーは #11 のまま。今の得点は入力ミスだったとして、取り消してみましょう。', action:'直前の得点を取り消す', event:'サンプル：得点を1つ多く押してしまいました' },
    { score:[13,12], server:'A', order:[11,12,13,10], title:'入力ミスは、ひと押しで元どおり。', text:'13–12に戻りました。得点だけでなく、その時点のサーブ順も復元。最後に記録結果のサンプルを見てみましょう。', action:'記録結果のサンプルを見る', event:'取消完了 · 13–12 · サーバー #11' },
    { score:[15,13], server:'A', order:[11,12,13,10], title:'この使いやすさを、次の試合へ。', text:'操作体験はここまで。実際のチーム名・試合記録・履歴保存は、購入後のServeEyeで利用できます。', action:null, event:'続きのラリーを省略した記録例 · 緑クラブ 2–0 青クラブ' },
  ];
  function snapshot(index) {
    const i = Number.isInteger(index) && index >= 0 && index < frames.length ? index : 0;
    return { index:i, ...frames[i], score:[...frames[i].score], order:[...frames[i].order], complete:i === frames.length-1 };
  }
  function advance(index, expectedIndex) {
    const state = snapshot(index);
    return state.index === expectedIndex && !state.complete ? snapshot(state.index+1) : state;
  }
  return { snapshot, advance, count:frames.length };
});
