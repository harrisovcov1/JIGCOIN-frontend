'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('let hubCatalog = null'),html.indexOf('function renderHubOrders()'));
const fixture=(id=10001)=>({ok:true,telegram_id:id,server_now:new Date().toISOString(),enabled:true,products:[{sku:'JC_SMALL',title:'Small',coins:1000,stars:100}],recent_orders:[]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(){
  const els=new Map(),calls=[],events={};let now=Date.now(),id=10001,ready=true,reply=async()=>fixture(id);
  function node(){return {innerHTML:'',textContent:'',hidden:false,dataset:{},children:[],attrs:{},classList:{add(){},toggle(){},contains:()=>true},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){this.children=[];this.innerHTML='';},append(x){this.children.push(x);},addEventListener(){},querySelector:()=>({addEventListener(){}}),querySelectorAll:()=>[]};}
  const el=id=>{if(!els.has(id))els.set(id,node());return els.get(id);};
  class Clock extends Date{static now(){return now;}}
  const ctx={allPacksVisible:false,Date:Clock,console,homeUserId:()=>id,homeIdentity:id,homeConfirmedBalance:null,homeGoalModel:()=>null,accountIsReady:()=>ready,window:{addEventListener:(k,fn)=>events[k]=fn},setTimeout:fn=>fn(),
    document:{getElementById:el,createElement:node},coinPackList:el('coinPackList'),coinShopSheet:node(),escapeHtml:String,formatNumber:n=>n.toLocaleString('en-GB'),
    renderHubOrders(){},updateBoostHub(){},buyStarsPack(){},apiPost:async(...args)=>{calls.push(args);return reply(...args);}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,calls,els,events,advance:ms=>now+=ms,identity:v=>id=v,ready:v=>ready=v,response:fn=>reply=fn,run:s=>vm.runInContext(s,ctx)};
}
test('first open shows five disabled price previews, duplicate opens share one request; repeat visit renders without a request',async()=>{
  const c=setup(),d=deferred();c.response(()=>d.promise);
  const a=c.ctx.loadCoinPacks(),b=c.ctx.loadCoinPacks();
  assert.equal(c.calls.length,1);assert.equal((c.ctx.coinPackList.innerHTML.match(/data-preview="true"/g)||[]).length,5);
  assert.equal((c.ctx.coinPackList.innerHTML.match(/ disabled/g)||[]).length,5);
  d.resolve(fixture());await Promise.all([a,b]);assert.match(c.ctx.coinPackList.innerHTML,/1,000/);
  await c.ctx.loadCoinPacks();assert.equal(c.calls.length,1);assert.doesNotMatch(c.ctx.coinPackList.innerHTML,/hub-skeleton/);
});
test('preload uses only the read-only endpoint; real visit keeps cards while recording the visit',async()=>{
  const c=setup();await c.ctx.loadCoinPacks({preview:true});assert.equal(c.calls[0][0],'/api/stars/catalog-preview');
  const d=deferred();c.response(()=>d.promise);const visit=c.ctx.loadCoinPacks();
  assert.equal(c.calls[1][0],'/api/stars/catalog');assert.match(c.ctx.coinPackList.innerHTML,/1,000/);assert.doesNotMatch(c.ctx.coinPackList.innerHTML,/hub-skeleton/);
  d.resolve(fixture());await visit;await c.ctx.loadCoinPacks();assert.equal(c.calls.length,2);
});
test('opening during preload performs one real visit even with repeated clicks',async()=>{
  const c=setup(),d=deferred();c.response(()=>d.promise);const pre=c.ctx.loadCoinPacks({preview:true});const a=c.ctx.loadCoinPacks(),b=c.ctx.loadCoinPacks();
  assert.equal(c.calls.length,1);c.response(async()=>fixture());d.resolve(fixture());await Promise.all([pre,a,b]);
  assert.equal(c.calls.length,2);assert.equal(c.calls[1][0],'/api/stars/catalog');
});
test('stale cache remains visible but cannot be bought while refresh is pending or failed; retry restores it',async()=>{
  const c=setup();await c.ctx.loadCoinPacks();c.advance(61000);const d=deferred();c.response(()=>d.promise);const pending=c.ctx.loadCoinPacks();
  assert.match(c.ctx.coinPackList.innerHTML,/1,000/);assert.match(c.ctx.coinPackList.innerHTML,/disabled/);assert.equal(c.ctx.shopCatalogFresh(),false);
  d.resolve({ok:false,reason:'TIMEOUT'});await pending;assert.match(c.ctx.coinPackList.innerHTML,/1,000/);assert.equal(c.els.get('hubCatalogStatus').hidden,false);
  c.response(async()=>fixture());await c.ctx.loadCoinPacks({force:true});assert.equal(c.ctx.shopCatalogFresh(),true);assert.doesNotMatch(c.ctx.coinPackList.innerHTML,/disabled/);
});
test('a failed first request offers retry without invented packs or prices',async()=>{
  const c=setup();c.response(async()=>{throw Error('offline');});await c.ctx.loadCoinPacks();
  assert.equal(c.els.get('hubCatalogStatus').children.at(-1).textContent,'Retry');assert.doesNotMatch(c.ctx.coinPackList.innerHTML,/data-stars-sku/);assert.match(c.ctx.coinPackList.innerHTML,/data-preview/);assert.equal(c.ctx.coinPackList.attrs['aria-busy'],'false');
});
test('different-account and malformed responses are discarded without enabling checkout',async()=>{
  for(const response of [fixture(10002),{...fixture(),products:null},{...fixture(),server_now:'invalid'}]){
    const c=setup();c.response(async()=>response);await c.ctx.loadCoinPacks();assert.equal(c.ctx.shopCatalogFresh(),false);assert.doesNotMatch(c.ctx.coinPackList.innerHTML,/data-stars-sku/);
  }
});
test('late old-account response cannot replace the current account or its order history',async()=>{
  const c=setup(),d=deferred();c.response(()=>d.promise);const old=c.ctx.loadCoinPacks();c.identity(10002);c.response(async()=>({...fixture(10002),products:[{sku:'JC_NEW',coins:2222,stars:100}]}));
  await c.ctx.loadCoinPacks();d.resolve(fixture());await old;assert.match(c.ctx.coinPackList.innerHTML,/2,222/);assert.doesNotMatch(c.ctx.coinPackList.innerHTML,/1,000/);assert.equal(c.run('hubCatalogOwner'),10002);
});
test('forced post-payment refresh bypasses a fresh cache and waits past an older pending request',async()=>{
  const c=setup(),d=deferred();c.response(()=>d.promise);const first=c.ctx.loadCoinPacks();const afterPayment=c.ctx.loadCoinPacks({force:true});
  c.response(async()=>({...fixture(),enabled:false}));d.resolve(fixture());await Promise.all([first,afterPayment]);assert.equal(c.calls.length,2);assert.match(c.ctx.coinPackList.innerHTML,/disabled/);
});
test('ready event preloads once; no requests run before account confirmation',async()=>{
  const c=setup();c.ready(false);await c.ctx.loadCoinPacks({preview:true});assert.equal(c.calls.length,0);c.ready(true);await c.events['jigcoin:account-ready']();assert.equal(c.calls[0][0],'/api/stars/catalog-preview');
});
test('cold Home has neutral artwork until a rank is confirmed and recovers without stale SVG',()=>{
  const c=setup();c.ctx.progressionCurrent=()=>null;c.ctx.launchEquipped=()=>false;
  c.ctx.homeIdentity=c.ctx.homeUserId();
  const themes=[];c.ctx.syncMintWorld=tier=>themes.push(tier);
  const rendered=[];c.ctx.setCoinArtwork=(el,tier)=>{rendered.push(tier);el.innerHTML='tier-'+tier;el.dataset.artwork=String(tier);};
  const start=html.indexOf('function renderCollectibleCoin('),end=html.indexOf('async function refreshProgression',start);vm.runInContext(html.slice(html.indexOf('const HOME_TIERS ='),html.indexOf('const state ='))+html.slice(start,end),c.ctx);
  c.ready(false);c.ctx.renderCollectibleCoin(null);assert.equal(rendered.length,0);assert.equal(c.els.get('homeCoinWrap').dataset.loading,'true');
  c.ready(true);c.ctx.renderCollectibleCoin({tier:1,nextName:'Operator'});assert.deepEqual(rendered,[1,2]);assert.equal(c.els.get('homeCoinWrap').dataset.loading,'false');
  c.ready(false);c.ctx.renderCollectibleCoin({tier:1});assert.equal(c.els.get('homeCoinArtwork').innerHTML,'');assert.equal(c.els.get('homeCoinArtwork').dataset.artwork,undefined);
  assert.deepEqual(themes,[null,1,null]);
});

test('affordable recommendation and rank unlock are independently accurate',()=>{
  const c=setup();
  c.ctx.homeConfirmedBalance=22009;
  const start=html.indexOf('function homeTierIndex('),end=html.indexOf('function advanceHomeMilestone(',start);
  vm.runInContext(html.slice(html.indexOf('const HOME_TIERS ='),html.indexOf('const state ='))+html.slice(start,end),c.ctx);
  c.ctx.homeIdentity=c.ctx.homeUserId();
  const packs=[
    {sku:'JC_SMALL',title:'Small coin pack',coins:1000,stars:100},
    {sku:'JC_MEDIUM',title:'Medium coin pack',coins:3000,stars:250},
    {sku:'JC_LARGE',title:'Large coin pack',coins:7000,stars:500},
    {sku:'JC_GROWTH',title:'Growth coin pack',coins:37500,stars:2500}
  ];
  const affordable=c.ctx.packGoal(packs),rank=c.ctx.rankReachPack(packs);
  assert.equal(affordable.product.sku,'JC_MEDIUM');
  assert.equal(rank.product.sku,'JC_GROWTH');
  assert.equal(rank.goal.remaining,27991);
  assert.match(c.ctx.starsProductCard(rank.product,false,true,null,0,rank.goal),/59,509 coins/);
  assert.match(c.ctx.starsProductCard(rank.product,false,true,null,0,rank.goal),/Operator unlocked/);
  assert.doesNotMatch(c.ctx.starsProductCard(affordable.product,false,true,affordable.goal),/Operator unlocked/);
  assert.equal(c.ctx.packGoal(packs).product.stars,250);
});