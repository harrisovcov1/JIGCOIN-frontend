'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('let hubCatalog = null'),html.indexOf('// ------------ Momentum Shield UI'));
function setup({enabled=true,products=[{sku:'JC_SMALL',title:'Small pack',coins:1000,stars:100}],expires=null,openInvoice,replies=[]}={}){
 const calls=[],toasts=[];let syncs=0;
 const ctx={Date,console,setTimeout:(fn)=>fn(),document:{hidden:false,getElementById:()=>null},window:{Telegram:{WebApp:openInvoice?{openInvoice}:{} }},
 escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),formatNumber:n=>n.toLocaleString('en-GB'),showToast:s=>toasts.push(s),
 syncStateIfIdle:async()=>{syncs++;},apiPost:async(...args)=>{calls.push(args);const r=replies.shift();return typeof r==='function'?r():r;}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.catalog={enabled,products,offer_expires_at:expires};
 vm.runInContext('hubCatalog=catalog; renderStarsCatalog=()=>{}; loadCoinPacks=async()=>{};',ctx);
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

test('Hub shows actual cooldown and claimable state, preserving active boost countdown',()=>{
 const c=setup();
 const makeCard=()=>{const classes=new Set();return {dataset:{},reward:{textContent:''},classList:{add:x=>classes.add(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x)},querySelector(){return this.reward;}};};
 const energy=makeCard(),double=makeCard(),els={};
 c.document={getElementById:id=>els[id]||(els[id]={textContent:'',hidden:false})};
 c.coinShopSheet={querySelector:sel=>sel.includes('boost_energy')?energy:double,querySelectorAll:()=>[]};
 c.state={energy:3,streakDays:1,momentumShieldQty:0,doubleBoostActive:true};c.maxEnergy=50;
 c.msToCountdown=()=> '2h';double.reward.textContent='Active · 5m';
 c.missions=[{code:'sp_emergency_energy',cooldown_remaining_seconds:7200,status:'cooldown'},{code:'sp_double_points',cooldown_remaining_seconds:7200,status:'cooldown'}];
 vm.runInContext('hubMissions=missions;hubMissionLoadedAt=Date.now();',c);c.updateBoostHub();
 assert.equal(energy.dataset.disabledReason,'This boost is available in 2h.');assert.equal(double.reward.textContent,'Active · 5m');
 c.missions=[{code:'sp_emergency_energy',cooldown_remaining_seconds:0,status:'claimable'}];
 vm.runInContext('hubMissions=missions;',c);c.updateBoostHub();assert.equal(energy.reward.textContent,'Ready to claim');assert.match(els.hubRecommendation.textContent,/ready to claim/);
});
