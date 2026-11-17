'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('let hubCatalog = null'),html.indexOf('// ------------ Momentum Shield UI'));
function setup({enabled=true,products=[{sku:'JC_SMALL',title:'Small pack',coins:1000,stars:100}],expires=null,openInvoice,replies=[]}={}){
 const calls=[],toasts=[];let syncs=0;
 const ctx={Date,console,progressionCurrent:()=>null,renderDailyRewards(){},accountIsReady:()=>true,homeUserId:()=>10001,setTimeout:(fn)=>fn(),document:{hidden:false,getElementById:()=>null,querySelectorAll:()=>[]},window:{addEventListener(){},Telegram:{WebApp:openInvoice?{openInvoice}:{} }},
 escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),formatNumber:n=>n.toLocaleString('en-GB'),showToast:s=>toasts.push(s),
 syncStateIfIdle:async()=>{syncs++;},apiPost:async(...args)=>{calls.push(args);const r=replies.shift();return typeof r==='function'?r():r;}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.catalog={enabled,products,offer_expires_at:expires};
 vm.runInContext('hubCatalog=catalog; hubCatalogOwner=10001; hubCatalogLoadedAt=Date.now(); renderStarsCatalog=()=>{}; loadCoinPacks=async()=>{};',ctx);
 return Object.assign(ctx,{calls,toasts,syncCount:()=>syncs});
}
test('disabled shop never requests an invoice',async()=>{const c=setup({enabled:false});await c.buyStarsPack('JC_SMALL');assert.equal(c.calls.length,0);});
test('Telegram invoice capability required before creating an order',async()=>{const c=setup();await c.buyStarsPack('JC_SMALL');assert.equal(c.calls.length,0);assert.match(c.toasts[0],/Telegram/);});
test('unknown and expired starter offers cannot start checkout',async()=>{
 const c=setup({openInvoice(){},products:[{sku:'JC_STARTER',coins:1000,stars:50,starter:true}],expires:'2000-01-01T00:00:00Z'});
 await c.buyStarsPack('JC_UNKNOWN');await c.buyStarsPack('JC_STARTER');assert.equal(c.calls.length,0);
});
test('double press creates one invoice while Telegram checkout is open',async()=>{
 let close;const c=setup({openInvoice:(_url,fn)=>{close=fn;},replies:[{ok:true,url:'https://t.me/$invoice',order_id:'abc'},{ok:true,order:{status:'invoiced'}}]});
 const first=c.buyStarsPack('JC_SMALL');await Promise.resolve();await c.buyStarsPack('JC_SMALL');assert.equal(c.calls.length,1);close('cancelled');await first;assert.equal(c.syncCount(),0);
});
test('Telegram paid callback alone never credits or announces delivery',async()=>{
 const c=setup({openInvoice:(_url,fn)=>fn('paid'),replies:[{ok:true,url:'https://t.me/$invoice',order_id:'abc'},...Array.from({length:10},()=>({ok:true,order:{status:'approved'}}))]});
 await c.buyStarsPack('JC_SMALL');assert.equal(c.syncCount(),0);assert.ok(!c.toasts.some(t=>t.includes('coins are saved')));
});
test('server-confirmed paid order refreshes saved state',async()=>{
 const c=setup({openInvoice:(_url,fn)=>fn('paid'),replies:[{ok:true,url:'https://t.me/$invoice',order_id:'abc'},{ok:true,order:{status:'paid'}}]});
 await c.buyStarsPack('JC_SMALL');assert.equal(c.syncCount(),1);assert.ok(c.toasts.some(t=>t.includes('coins are saved')));
});
test('cancelled checkout still checks server for a payment race',async()=>{
 const c=setup({openInvoice:(_url,fn)=>fn('cancelled'),replies:[{ok:true,url:'https://t.me/$invoice',order_id:'abc'},{ok:true,order:{status:'paid'}}]});
 await c.buyStarsPack('JC_SMALL');assert.equal(c.syncCount(),1);
});
test('refunded order refreshes balance and is not called a purchase success',async()=>{
 const c=setup({replies:[{ok:true,order:{status:'refunded'}}]});await c.checkStarsOrder('abc',false);assert.equal(c.syncCount(),1);assert.match(c.toasts[0],/refunded/);
});
test('network errors keep balance untouched and allow a later retry',async()=>{
 const c=setup({openInvoice(){},replies:[()=>{throw Error('offline');},()=>{throw Error('offline');}]});await c.buyStarsPack('JC_SMALL');await c.buyStarsPack('JC_SMALL');assert.equal(c.calls.length,2);assert.equal(c.syncCount(),0);
});
test('catalogue validates quantities and escapes product labels',()=>{
 const c=setup();assert.equal(c.validStarsProduct({sku:'bad"',coins:1,stars:1}),false);assert.equal(c.validStarsProduct({sku:'JC_X',coins:1,stars:0}),false);
 assert.match(c.starsProductCard({sku:'JC_X',title:'<script>',coins:1000,stars:100}),/&lt;script&gt;/);
});

test('shop refresh delegates daily display and expired offers disable checkout',()=>{
 const c=setup();const els={};
 c.document={getElementById:id=>els[id]||(els[id]={textContent:'',hidden:false,dataset:{}})};
 const button={disabled:false},clock={textContent:'',parentElement:{querySelector:()=>button}};
 c.coinShopSheet={querySelectorAll:()=>[clock]};
 c.state={streakDays:1,lastCheckin:new Date().toISOString().slice(0,10),momentumShieldQty:0};
 c.msToCountdown=()=> '2h';
 let refreshed=0;c.renderDailyRewards=()=>refreshed++;vm.runInContext("hubCatalog.offer_expires_at='2000-01-01T00:00:00Z';",c);c.updateBoostHub();
 assert.equal(button.disabled,true);assert.equal(refreshed,1);
});

test('an invoice response for a previous account never opens checkout',async()=>{
 let resolve,opened=0;const pending=new Promise(r=>resolve=r);
 const c=setup({openInvoice(){opened++;},replies:[()=>pending]});
 const buying=c.buyStarsPack('JC_SMALL');c.homeUserId=()=>10002;
 resolve({ok:true,url:'https://t.me/$invoice',order_id:'abc'});await buying;assert.equal(opened,0);assert.equal(c.syncCount(),0);
});
test('checkout closing after an account switch never polls or updates the other account',async()=>{
 let close,opened;const open=new Promise(r=>opened=r);const c=setup({openInvoice:(_url,fn)=>{close=fn;opened();},replies:[{ok:true,url:'https://t.me/$invoice',order_id:'abc'}]});
 const buying=c.buyStarsPack('JC_SMALL');await open;c.homeUserId=()=>10002;close('paid');await buying;
 assert.equal(c.calls.length,1);assert.equal(c.syncCount(),0);
});
test('stale cached prices must refresh before a new checkout is allowed',async()=>{
 const c=setup({openInvoice(){throw Error('should not open');}});vm.runInContext('hubCatalogLoadedAt=Date.now()-61000;',c);
 let refresh=0;c.loadCoinPacks=async()=>{refresh++;return {ok:true};};await c.buyStarsPack('JC_SMALL');assert.equal(refresh,1);assert.equal(c.calls.length,0);
});
