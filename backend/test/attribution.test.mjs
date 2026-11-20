import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { brandRoot } from '../config.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('installed browser package flows from capture to checkout attempt and expires after seven days', async()=>{
  const result=await build({stdin:{contents:"export { captureAfihubClick, afihub } from './src/lib/afihub-tracking.js'; export { checkoutAttempt, readAttribution } from './src/attribution.js';",resolveDir:brandRoot},bundle:true,write:false,format:'iife',globalName:'subject',define:{'import.meta.env':JSON.stringify({VITE_AFIHUB_MERCHANT_ID:id}),'import.meta.hot':'undefined'}});
  const store=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
  const browser={location:{search:'?afihub_click_id=click_tocoks'},localStorage:store()};
  const context={window:browser,localStorage:browser.localStorage,sessionStorage:store(),crypto:{randomUUID},URLSearchParams};
  runInNewContext(result.outputFiles[0].text,context);
  const api=context.subject; assert.equal(api.captureAfihubClick(),true); assert.equal(api.readAttribution(),'click_tocoks');
  const first=api.checkoutAttempt([{productId:'product1',quantity:1}],{email:'buyer@example.test'});
  assert.equal(first.session_token,'click_tocoks');
  assert.equal(first.checkout_key,api.checkoutAttempt([{productId:'product1',quantity:1}],{email:'buyer@example.test'}).checkout_key);
  assert.notEqual(first.checkout_key,api.checkoutAttempt([{productId:'product1',quantity:2}],{email:'buyer@example.test'}).checkout_key);
  browser.localStorage.setItem(api.afihub.storageKey,JSON.stringify({value:'expired',expires:Date.now()-1}));
  assert.equal(api.readAttribution(),''); assert.equal(browser.localStorage.getItem(api.afihub.storageKey),null);
});


test('installer bootstrap enriches checkout without manual payload attribution', async()=>{
  const result=await build({stdin:{contents:"import './src/afihub/bootstrap.js';",resolveDir:brandRoot},bundle:true,write:false,format:'iife',define:{'import.meta.env':JSON.stringify({VITE_AFIHUB_MERCHANT_ID:id}),'import.meta.hot':'undefined'}});
  const values=new Map();const calls=[];
  const browser={location:{href:'https://tocoks.test/?afihub_click_id=automatic_click',origin:'https://tocoks.test',search:'?afihub_click_id=automatic_click'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetch:async(...args)=>{calls.push(args);return new Response('{}');}};
  runInNewContext(result.outputFiles[0].text,{window:browser,URL,URLSearchParams,Request,Headers});
  browser.location.search='';
  await browser.fetch('/api/v1/storefront/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:[{product_id:'sku-1',quantity:1}],checkout_key:'existing-key'})});
  const payload=await calls[0][0].json();assert.equal(payload.session_token,'automatic_click');assert.equal(payload.checkout_key,'existing-key');assert.deepEqual(payload.items,[{product_id:'sku-1',quantity:1}]);
});
