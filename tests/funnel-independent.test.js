'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const demo = require('../demo-flow');
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness(fetch) {
  const selectors = ['[data-checkout]', '[data-live-price]', '[data-purchase-message]', '[data-purchase-retry]'];
  const nodes = Object.fromEntries(selectors.map(selector => [selector, [{
    textContent: '', disabled: false, attributes: {}, listeners: {},
    setAttribute(k,v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
    classList: { toggle() {} }, addEventListener(k,fn) { this.listeners[k] = fn; },
  }]]));
  const events = {}, windowEvents = {}, destinations = [];
  const context = { Intl, URL, fetch,
    document: { querySelectorAll: s => nodes[s] || [], addEventListener: (k,f) => { events[k] = f; } },
    window: { location: { assign: url => destinations.push(url) }, addEventListener: (k,f) => { windowEvents[k] = f; } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../purchase-ui'), 'utf8'), context);
  events.DOMContentLoaded();
  return { nodes, destinations, windowEvents, click: selector => nodes[selector][0].listeners.click({ preventDefault() {} }) };
}
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('fixed demo cannot grow into a real match through replay or extra steps', () => {
  for (let replay = 0; replay < 10; replay++) {
    let state = demo.snapshot(0);
    const scores = [];
    for (let click = 0; click < 100; click++) {
      scores.push(state.score.join(':'));
      state = demo.advance(state.index, state.index);
    }
    assert.equal(state.complete, true);
    assert.equal(state.index, demo.count - 1);
    assert.deepEqual([...new Set(scores)], ['12:12', '13:12', '14:12', '15:13']);
  }
  const snapshot = demo.snapshot(0);
  snapshot.score[0] = 999;
  snapshot.order.push(999);
  assert.deepEqual(demo.snapshot(0).score, [12,12]);
  assert.deepEqual(demo.snapshot(0).order, [10,11,12,13]);
});

test('retry cannot unlock checkout while its POST remains pending', async () => {
  let posts = 0, release;
  const h = harness(async url => {
    if (url.includes('/checkout/')) { posts++; return new Promise(resolve => { release = resolve; }); }
    return response({ available:true, price_jpy:1980 });
  });
  await settle();
  h.click('[data-checkout]');
  h.click('[data-checkout]');
  h.click('[data-purchase-retry]');
  await settle();
  h.click('[data-checkout]');
  assert.equal(posts, 1, 'retry must not allow a second unresolved checkout');
  release(response({error:'temporary'}, 500));
  await settle();
  assert.equal(h.nodes['[data-checkout]'][0].disabled, false);
});

test('no active plan is shown as unavailable, not a network error', async () => {
  const h = harness(async () => response({ available:false, remaining:null, price_jpy:null }));
  await settle();
  assert.equal(h.nodes['[data-checkout]'][0].disabled, true);
  assert.match(h.nodes['[data-purchase-message]'][0].textContent, /受け付けていません|受付.*終了|販売.*終了/);
  assert.doesNotMatch(h.nodes['[data-live-price]'][0].textContent, /null|0円/);
});

test('sale true, false and failure remain fail-closed and dynamically priced', async () => {
  for (const state of [true, false, 'failure']) {
    let posts = 0;
    const h = harness(async url => {
      if (url.includes('/checkout/')) { posts++; return response({error:'temporary'}, 500); }
      if (state === 'failure') throw new Error('offline');
      return response({ available:state, price_jpy:1980 });
    });
    await settle();
    assert.equal(h.nodes['[data-checkout]'][0].disabled, state !== true);
    if (state !== 'failure') assert.equal(h.nodes['[data-live-price]'][0].textContent, '1,980');
    await h.click('[data-checkout]');
    assert.equal(posts, state === true ? 1 : 0);
  }
});

test('checkout failure restores controls and foreign redirect never navigates', async () => {
  let posts = 0;
  const h = harness(async url => {
    if (url.includes('/checkout/')) { posts++; return response({url:'https://not-stripe.example/pay'}); }
    return response({available:true,price_jpy:1980});
  });
  await settle();
  await h.click('[data-checkout]');
  assert.equal(h.nodes['[data-checkout]'][0].disabled, false);
  assert.equal(h.destinations.length, 0);
  await h.click('[data-checkout]');
  assert.equal(posts, 2);
});
