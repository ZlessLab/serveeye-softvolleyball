/* Shared, explicit user-initiated checkout. No payment or auth on page load. */
(function() {
  'use strict';
  let busy = false;
  let requestPending = false;
  let plan = null;
  const money = n => new Intl.NumberFormat('ja-JP').format(n);
  function message(text) {
    document.querySelectorAll('[data-purchase-message]').forEach(el => { el.textContent = text; });
  }
  function paint() {
    document.querySelectorAll('[data-purchase-retry]').forEach(el => { el.disabled = requestPending; });
    document.querySelectorAll('[data-checkout]').forEach(el => {
      const disabled = busy || !plan || !plan.available;
      el.setAttribute('aria-disabled', String(disabled));
      if ('disabled' in el) el.disabled = disabled;
      el.classList.toggle('purchase-disabled', disabled);
      el.textContent = busy ? '決済ページを準備中…' : plan && !plan.available ? '現在、新規購入を受け付けていません' : plan ? `購入する · ${money(plan.price_jpy)}円（税込）` : '販売情報を確認中…';
    });
    document.querySelectorAll('[data-live-price]').forEach(el => { el.textContent = plan && Number.isInteger(plan.price_jpy) ? money(plan.price_jpy) : '—'; });
  }
  async function load() {
    plan = null;
    paint();
    message('販売情報を確認しています。');
    try {
      const response = await fetch('/api/campaign/status', { cache:'no-store' });
      const data = await response.json();
      if (!response.ok || typeof data.available !== 'boolean' || (data.available && (!Number.isInteger(data.price_jpy) || data.price_jpy <= 0))) throw new Error('status');
      plan = data;
      message(data.available ? '買い切り・利用者1名・最大2端末。決済はStripeの画面で行います。' : '現在、新規購入を受け付けていません。操作体験と購入済みの利用は可能です。');
    } catch (_) {
      message('販売情報を確認できませんでした。通信環境をご確認のうえ「販売情報を再確認」を押してください。操作体験は利用できます。');
    }
    paint();
  }
  async function checkout(event) {
    if (event) event.preventDefault();
    if (busy || !plan || !plan.available) return;
    busy = true; requestPending = true; paint(); message('Stripeの決済ページを準備しています。まだ購入は確定していません。');
    try {
      const response = await fetch('/api/checkout/session', { method:'POST' });
      const data = await response.json();
      if (response.status === 409) {
        plan = { ...plan, available:false };
        message('この販売プランの受付は終了しました。販売情報を再確認してください。');
        busy = false; requestPending = false; paint(); return;
      }
      if (!response.ok || typeof data.url !== 'string') throw new Error('checkout');
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com','buy.stripe.com'].includes(url.hostname)) throw new Error('destination');
      window.location.assign(url.href);
      requestPending = false;
      document.querySelectorAll('[data-purchase-retry]').forEach(el => { el.disabled = false; });
      // Keep buttons disabled until navigation or explicit retry.
      message('決済ページへ移動します。移動しない場合は「販売情報を再確認」からやり直してください。');
    } catch (_) {
      busy = false; requestPending = false; paint();
      message('決済ページを開けませんでした。購入は確定していません。通信環境をご確認のうえ、もう一度お試しください。');
    }
  }
  window.refreshPurchaseUI = paint;
  window.startCheckout = checkout;
  window.startCheckoutFromApp = checkout;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-checkout]').forEach(el => {
      el.removeAttribute('onclick');
      el.addEventListener('click', checkout);
    });
    document.querySelectorAll('[data-purchase-retry]').forEach(el => el.addEventListener('click', () => { if (requestPending) return; busy=false; load(); }));
    window.addEventListener('pageshow', event => { if (event.persisted) { busy=false; load(); } });
    load();
  });
})();
