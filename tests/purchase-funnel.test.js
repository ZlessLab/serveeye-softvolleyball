'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../purchase-ui.js'),'utf8');
function harness(fetch){
 const listeners={},events={},targets=[];
 const button={textContent:'',disabled:false,setAttribute(){},classList:{toggle(){}},removeAttribute(){},addEventListener(n,fn){listeners[n]=fn;}};
 const status={textContent:''},price={textContent:''},retry={addEventListener(n,fn){listeners.retry=fn;}};
 const document={querySelectorAll(s){return s==='[data-checkout]'?[button]:s==='[data-live-price]'?[price]:s==='[data-purchase-message]'?[status]:s==='[data-purchase-retry]'?[retry]:[];},addEventListener(n,fn){events[n]=fn;}};
 const window={location:{assign:url=>targets.push(url)},addEventListener(){}};
 vm.runInNewContext(source,{document,window,fetch,Intl,URL});events.DOMContentLoaded();
 return {window,button,status,price,targets,listeners};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const json=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('price reflects API; no checkout on load; concurrent click sends one request',async()=>{
 let calls=0,release;const h=harness(async(url)=>{if(url.includes('status'))return json({available:true,price_jpy:1980});calls++;return new Promise(r=>release=r);});
 await flush();assert.equal(calls,0);assert.equal(h.price.textContent,'1,980');
 const a=h.window.startCheckout(),b=h.window.startCheckout();assert.equal(calls,1);assert.equal(h.button.disabled,true);
 release(json({url:'https://checkout.stripe.com/c/pay/test'}));await Promise.all([a,b]);assert.equal(h.targets.length,1);assert.equal(h.button.disabled,true);
});
test('unavailable and invalid price block checkout; status failure allows retry',async()=>{
 for(const data of [{available:false,price_jpy:null},{available:true,price_jpy:-1}]){
 let calls=0;const h=harness(async(url)=>{calls++;return json(data);});await flush();await h.window.startCheckout();assert.equal(calls,1);assert.equal(h.button.disabled,true);
 }
 const h=harness(async()=>{throw new Error('offline');});await flush();assert.match(h.status.textContent,/確認できません/);
});
test('409 disables checkout and network failure releases button with helpful error',async()=>{
 for(const mode of ['soldout','network','unsafe']){
 const h=harness(async url=>{if(url.includes('status'))return json({available:true,price_jpy:2980});if(mode==='network')throw new Error('offline');return mode==='soldout'?json({},409):json({url:'https://example.com/payment'});});
 await flush();assert.equal(h.price.textContent,'2,980');await h.window.startCheckout();assert.equal(h.targets.length,0);assert.equal(h.button.disabled,mode==='soldout');assert.match(h.status.textContent,mode==='soldout'?/受付は終了/:/開けません/);
 }
});
test('demo is isolated from paid app state and arbitrary inputs',()=>{
 const html=fs.readFileSync(require.resolve('../demo.html'),'utf8');
 assert.doesNotMatch(html,/localStorage|sessionStorage|svb4_license|<input|<iframe|setInterval|contenteditable/i);
 assert.match(html,/固定サンプル/);assert.match(html,/自動課金なし/);assert.match(html,/data-checkout/);
 const lp=fs.readFileSync(require.resolve('../index.html'),'utf8');assert.match(lp,/href="\/demo.html"/);
 const app=fs.readFileSync(require.resolve('../soft-volleyball-score.html'),'utf8');assert.match(app,/href="#" data-checkout/);
});
