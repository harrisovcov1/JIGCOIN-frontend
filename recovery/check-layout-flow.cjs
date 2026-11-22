'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const classes=(initial=[])=>{const s=new Set(initial);return{add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}};
function route(ready){
 const old={classList:classes(['show'])},next={classList:classes(),querySelector:()=>body},body={scrollTop:200};
 const backdrop={classList:classes()},leaderboard={style:{display:'flex'}};let active=null,cleared=null,cancelled=false,invalidated=false;
 const ctx={boostSheet:old,stopRewardWait(){cancelled=true;},invalidateRefillPreparation(){invalidated=true;},hideDailyNotice(){},accountIsReady:()=>ready,document:{body:{style:{overflow:'hidden'}},getElementById:()=>leaderboard,querySelectorAll:()=>[old]},window:{__sponsorCountdownTick:12},clearInterval:id=>{cleared=id},sheetBackdrop:backdrop,setActiveTab:t=>{active=t}};
 vm.createContext(ctx);vm.runInContext(slice('function showAppSheet(', '// Coin Shop:'),ctx);
 ctx.showAppSheet(next,'Shop');return{old,next,body,backdrop,leaderboard,ctx,active,cleared,cancelled,invalidated};
}
test('navigation refuses an unready account without touching panels',()=>{const r=route(false);assert.equal(r.old.classList.contains('show'),true);assert.equal(r.next.classList.contains('show'),false);assert.equal(r.active,null);assert.equal(r.cleared,null)});
test('switching section closes previous panel and leaderboard, cancels old countdown and resets scroll',()=>{const r=route(true);assert.equal(r.old.classList.contains('show'),false);assert.equal(r.next.classList.contains('show'),true);assert.equal(r.backdrop.classList.contains('show'),true);assert.equal(r.leaderboard.style.display,'none');assert.equal(r.ctx.document.body.style.overflow,'');assert.equal(r.cleared,12);assert.equal(r.body.scrollTop,0);assert.equal(r.active,'Shop');assert.equal(r.cancelled,true);assert.equal(r.invalidated,true)});
function cards(products) {
 const elements={hubStarter:{},hubShopNotice:{},hubSupport:{}};
 const classes=new Set();
 const coinPackList={innerHTML:'',querySelector:()=>null,classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);}}};
 const c={hubCatalog:{products,enabled:true},hubPurchaseBusy:false,shopCatalogFresh:()=>true,
  hubCatalogOwner:10001,homeIdentity:10001,homeUserId:()=>10001,homeGoalModel:()=>null,homeConfirmedBalance:0,
  document:{getElementById:id=>elements[id]},coinPackList,coinShopSheet:{querySelectorAll:()=>[]},renderHubOrders(){},updateBoostHub(){},
  hubNow:Date.now,escapeHtml:String,formatNumber:x=>x.toLocaleString('en-GB')};
 vm.createContext(c);
 vm.runInContext(slice('function packGoal(', 'async function loadCoinPacks('),c);
 c.renderStarsCatalog();
 return {c,markup:coinPackList.innerHTML,classes};
}
test('only the pack with the highest ratio gets the best-value label when a lower rate exists',()=>{
 const packs=[{sku:'JC_SMALL',title:'Small',coins:1000,stars:100},{sku:'JC_LARGE',title:'Large',coins:7000,stars:500}];
 const badgeOwner=()=>cards(packs).markup.match(/<article [^>]*hub-best[^>]*>[\s\S]*?<div class="hub-product-label">([^<]+)/)?.[1];
 assert.equal(badgeOwner(),'Large');
 packs[0].coins=2000;
 assert.equal(badgeOwner(),'Small');
});
test('equal value packs and starter offers do not receive unsupported best-value claims',()=>{
 const packs=[{sku:'JC_SMALL',coins:1000,stars:100},{sku:'JC_LARGE',coins:5000,stars:500}];
 const {c,markup}=cards(packs);
 assert.doesNotMatch(markup,/Most coins per Star/);
 assert.doesNotMatch(c.starsProductCard({...packs[0],coins:99999,starter:true},true,false,null,999.99),/Most coins per Star/);
});
test('share text uses the confirmed invite link and share image uses saved balance',()=>{
 const drawn=[];const noop=()=>{};const canvasContext={save:noop,restore:noop,beginPath:noop,arc:noop,moveTo:noop,lineTo:noop,createRadialGradient:()=>({addColorStop:noop}),clearRect:noop,strokeRect:noop,createLinearGradient:()=>({addColorStop:noop}),fillRect:noop,fillText:t=>drawn.push(t),measureText:()=>({width:30}),fill:noop,stroke:noop};
 const c={homeIdentity:1,homeUserId:()=>1,homeConfirmedBalance:12784,homeGoalModel:()=>({current:{name:"Grinder"}}),formatNumber:n=>n.toLocaleString('en-GB'),inviteSnapshot:()=>({invite_link:'https://t.me/JIGCOINBOT?startapp=ref_10001',welcome_coins:1000}),state:{bal:12784,balance:0,today:238,streakDays:1},document:{getElementById:id=>id==='rankName'?{textContent:'Grinder'}:id==='shareCardCanvas'?{width:960,height:540,getContext:()=>canvasContext}:null},inviteLinkText:{textContent:'https://t.me/JIGCOINBOT?startapp=ref_test'},FALLBACK_REF_LINK:'fallback',roundRect:noop};
 vm.createContext(c);vm.runInContext(slice('function buildShareText()', 'function roundRect'),c);assert.match(c.buildShareText(),/startapp=ref_10001/);assert.match(c.buildShareText(),/1,000 free coins/);assert.doesNotMatch(c.buildShareText(),/farming|cash|airdrop/i);c.renderShareCardCanvas();assert.ok(drawn.includes('12,784 saved coins · Grinder'));assert.ok(!drawn.includes('0'));
});
test('starter allocation counts are not presented as limited referral places',()=>{
 assert.doesNotMatch(html,/id="launchBoostInvite"|refreshReferralPromotion|places remaining.*coins per eligible referral/);
});

test('all five packs are visible in ascending price order with one accurate value badge',()=>{
 const p=[{sku:'JC_MAX_700K',title:'Maximum coin pack',coins:700000,stars:35000},
 {sku:'JC_SMALL',title:'Small',coins:1000,stars:100},{sku:'JC_GROWTH',title:'Growth',coins:37500,stars:2500},
 {sku:'JC_MEDIUM',title:'Medium',coins:3000,stars:250},{sku:'JC_LARGE',title:'Large',coins:7000,stars:500}];
 const {markup:rendered,classes}=cards(p);
 assert.doesNotMatch(rendered,/<details|All other coin packs|hub-pack-stage/);
 assert.equal((rendered.match(/data-stars-sku=/g)||[]).length,5);
 assert.ok(rendered.indexOf('JC_SMALL')<rendered.indexOf('JC_MEDIUM'));
 assert.ok(rendered.indexOf('JC_LARGE')<rendered.indexOf('JC_GROWTH'));
 assert.ok(rendered.indexOf('JC_GROWTH')<rendered.indexOf('JC_MAX_700K'));
 assert.match(rendered,/700,000/);assert.match(rendered,/35,000/);assert.match(rendered,/20 coins per Star/);
 assert.equal((rendered.match(/Top coin rate/g)||[]).length,1);
 assert.ok(classes.has('hub-catalog-dense'));
});
test('the compact first pack cannot inherit the retired display-case row or artwork',()=>{
 const world=fs.readFileSync('assets/mint-world.css','utf8'),compact=fs.readFileSync('assets/integrated.css','utf8');
 assert.doesNotMatch(world,/#coinPackList[^{}]*\.hub-product:first-child/);
 const allRows='#coinPackList > :is(.hub-product,.hub-product:first-child)';
 assert.ok(compact.includes(allRows+',')&&compact.includes('grid-template-rows:auto auto;'));
 assert.ok(compact.includes(allRows+'::before,')&&compact.includes('#coinPackList > :is(.hub-product,.hub-product:first-child:not(.hub-goal))::after {content:none;display:none}'));
 for(const [child,row] of [['hub-product-label','1'],['hub-product-coins','2'],['hub-unit-value','3']]){
  const rule=compact.slice(compact.indexOf(allRows+' .'+child)).split('}')[0];assert.ok(rule.includes('grid-row:'+row+';'),child);
 }
 assert.ok(compact.includes('#coinPackList>:is(.hub-product,.hub-product:first-child) {grid-template-columns:'));
});
