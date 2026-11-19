'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('let dailyRewardsBusy=false;'),html.indexOf("document.getElementById('homeDailyOpen').addEventListener"));
const fixture=()=>({day:'2026-11-16',days:6,claimed:true,broken:false,today_reward:500,next_reward:1250,next_day:7,resets_at:'2026-11-17T00:00:00Z',tier:{name:'Momentum',tap_bonus_percent:5,energy_bonus:5},next_tier:{day:7,name:'Growth',tap_bonus_percent:10,energy_bonus:10},next_milestone:{day:7,reward:1250},calendar:Array.from({length:7},(_,i)=>({day:i+1,reward:i===6?1250:500,claimed:i<6,focus:i===5,cosmetic:i===6?'momentum_aura':null})),milestones:[{day:3,reward:700},{day:7,reward:1250}],cosmetics:[{key:'momentum_aura',days:7,name:'Momentum aura',owned:false},{key:'veteran_frame',days:30,name:'Veteran frame',owned:false}]});
function setup(){const els=new Map(),storage=new Map(),calls=[];const el=id=>{if(!els.has(id))els.set(id,{dataset:{},append(){},parentElement:{dataset:{}},hidden:true,contains:()=>false,setAttribute(name,value){this[name]=value;},focus(){},inert:false});return els.get(id);};
 const ctx={reviewGamePurchase:async()=>true,console,Date,Math,Number,String,window:{},setTimeout:()=>1,clearTimeout(){},progressionError:false,now:Date.parse('2026-11-16T12:00:00Z'),data:{checkin:fixture(),event:{status:'upcoming'}},updateRewardRecommendation(){},document:{createElement:()=>({}),hidden:false,activeElement:null,querySelector:()=>null,getElementById:el},progressionCurrent:()=>ctx.data,progressionNow:()=>ctx.now,homeUserId:()=>10001,accountIsReady:()=>true,formatNumber:n=>Number(n).toLocaleString('en-GB'),escapeHtml:s=>String(s).replaceAll('<','&lt;'),msToCountdown:()=> '12h',collectibleCountdown:()=> '6d',setCoinArtwork(){},appStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},showToast:t=>calls.push(t),backToHome:()=>calls.push('home'),handleDailyTask:async()=>calls.push('claim'),refreshProgression:async()=>calls.push('refresh')};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,els,storage,calls};}
test('claimed daily summary shows tomorrow and useful perks without an unclaimed reward label',()=>{const {ctx,els}=setup();ctx.renderDailyRewards();assert.equal(els.get('hubDailyProgress').textContent,'Tomorrow 1,250 coins');assert.equal(els.get('homeDailyTitle').textContent,'✓ Day 6 collected');assert.match(els.get('dailyNextUnlock').textContent,/Day 7 · Momentum aura/);assert.match(els.get('dailyRewardNextPerk').textContent,/\+10% tap coins and \+10 energy/);assert.equal(els.get('rewardsDailyAmount').textContent,'Collected ✓');assert.equal(els.get('dailyRewardBadge').hidden,true);});
test('missing reward metadata explicitly offers refresh and cannot claim',async()=>{const {ctx,els,calls}=setup();ctx.data.checkin=null;ctx.renderDailyRewards();assert.equal(els.get('dailyRewardsError').hidden,false);assert.equal(els.get('dailyRewardClaim').disabled,true);assert.equal(els.get('hubDailyProgress').textContent,'Refresh rewards');await ctx.claimDailyReward();assert.equal(calls.length,0);});
test('UTC rollover and failed refresh block stale claims without changing stored rewards',async()=>{const {ctx,els,calls}=setup();ctx.data.checkin.claimed=false;ctx.now=Date.parse('2026-11-17T00:00:00Z');ctx.renderDailyRewards();assert.equal(els.get('dailyRewardClaim').disabled,true);await ctx.claimDailyReward();assert.equal(calls.length,0);ctx.now-=1000;ctx.progressionError=true;await ctx.claimDailyReward();assert.equal(calls.length,0);});
test('missed day explains retained unlocks and offers a new streak',()=>{const {ctx,els}=setup();Object.assign(ctx.data.checkin,{claimed:false,broken:true,next_day:1});ctx.data.checkin.cosmetics.forEach(c=>c.owned=true);ctx.renderDailyRewards();assert.match(els.get('dailyRewardNext').textContent,/Keep every coin and cosmetic/);assert.match(els.get('dailyCosmeticList').innerHTML,/Owned ✓/);assert.match(els.get('dailyRewardClaim').textContent,/Start new streak/);});
test('daily notice is once per account UTC day, nonblocking and hidden outside Home',()=>{const {ctx,els,storage,calls}=setup();ctx.data.checkin.claimed=false;ctx.document.hidden=true;ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,true);ctx.document.hidden=false;ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,false);assert.equal(els.get('dailyRewardBadge').hidden,false);assert.equal(els.get('mainScroll').inert,false);assert.deepEqual(calls,[]);ctx.hideDailyNotice();ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,true);ctx.homeUserId=()=>10002;ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,false);assert.equal(storage.get('jigcoin_daily_ready_seen:10002:2026-11-16'),'yes');els.get('mainScroll').inert=true;ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,true);});
test('late reminder is opt-in and does not replay repeatedly or after claiming',()=>{const {ctx,els,storage}=setup();ctx.data.checkin.claimed=false;ctx.renderDailyRewards();ctx.hideDailyNotice();ctx.now=Date.parse('2026-11-16T23:00:00Z');ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,true);storage.set('jigcoin_daily_reminder:10001','on');ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,false);assert.match(els.get('dailyNoticeText').textContent,/before 00:00 UTC/);ctx.hideDailyNotice();ctx.renderDailyRewards();assert.equal(els.get('dailyClaimNotice').hidden,true);ctx.data.checkin.claimed=true;ctx.renderDailyRewards();assert.equal(els.get('dailyRewardBadge').hidden,true);});
test('broken, stale and failed daily data never show a claim badge or notice',()=>{for(const state of ['broken','stale','failed']){const {ctx,els}=setup();ctx.data.checkin.claimed=false;if(state==='broken')ctx.data.checkin.broken=true;if(state==='stale')ctx.now=Date.parse('2026-11-17T00:00:00Z');if(state==='failed')ctx.progressionError=true;ctx.renderDailyRewards();assert.equal(els.get('dailyRewardBadge').hidden,true);assert.equal(els.get('dailyClaimNotice').hidden,true);}});
test('real event deadline controls Home strip; expired and inactive events hide it',()=>{const {ctx,els}=setup();ctx.renderDailyRewards();assert.equal(els.get('homeLaunchStrip').hidden,true);ctx.data.event={status:'live',ends_at:'2026-11-17T12:00:00Z',progress:200,target:250};ctx.renderDailyRewards();assert.equal(els.get('homeLaunchStrip').hidden,false);assert.match(els.get('homeLaunchDeadline').textContent,/200\/250/);ctx.now=Date.parse(ctx.data.event.ends_at);ctx.renderDailyRewards();assert.equal(els.get('homeLaunchStrip').hidden,true);});
test('duplicate daily presses send one claim and refresh confirmed data afterwards',async()=>{const {ctx,calls}=setup();ctx.data.checkin.claimed=false;let finish;ctx.handleDailyTask=()=>{calls.push('claim');return new Promise(r=>finish=r);};const p=ctx.claimDailyReward();await ctx.claimDailyReward();assert.deepEqual(calls,['claim']);finish();await p;assert.deepEqual(calls,['claim','refresh']);});
test('leaderboard cosmetics escape names and use only recognised ownership',()=>{const {ctx}=setup();assert.equal(ctx.dailyCosmeticMarkup(['fake'],'<script>'),'&lt;script>');const decorated=ctx.dailyCosmeticMarkup(['veteran_frame','momentum_aura'],'<player>');assert.match(decorated,/Veteran · Momentum/);assert.ok(!decorated.includes('<player>'));});
test('day 300 keeps the mature reward visible on both Home and Rewards',()=>{const {ctx,els}=setup();Object.assign(ctx.data.checkin,{days:300,today_reward:2000,next_reward:2000,next_day:301});ctx.renderDailyRewards();assert.match(els.get('hubDailyProgress').textContent,/2,000/);assert.match(els.get('rewardsDailyStatus').textContent,/Day 300 · Tomorrow 2,000 coins/);});
test('restore option requires server eligibility, enabled sales and real unexpired deadline; free restart remains available',()=>{const {ctx,els}=setup();Object.assign(ctx.data.checkin,{claimed:false,broken:true,restore:{eligible:true,enabled:true,stars:250,days:30,daily_reward:2000,tap_bonus_percent:28,energy_bonus:35,expires_at:'2026-11-17T00:00:00Z'}});ctx.renderDailyRewards();assert.equal(els.get('dailyRestoreCard').hidden,false);assert.equal(els.get('dailyRestoreBuy').disabled,false);assert.match(els.get('dailyRewardClaim').textContent,/free/);ctx.data.checkin.restore.enabled=false;ctx.renderDailyRewards();assert.equal(els.get('dailyRestoreBuy').disabled,true);assert.equal(els.get('dailyRewardClaim').disabled,false);ctx.now=Date.parse('2026-11-17T00:00:00Z');ctx.renderDailyRewards();assert.equal(els.get('dailyRestoreCard').hidden,true);});
test('client paid callback cannot restore a streak without a server-confirmed receipt',async()=>{const {ctx,els}=setup();Object.assign(ctx.data.checkin,{claimed:false,broken:true,restore:{eligible:true,enabled:true,days:6,stars:250,expires_at:'2026-11-17T00:00:00Z'}});const routes=[];ctx.window={Telegram:{WebApp:{openInvoice:(_u,cb)=>cb('paid')}}};ctx.apiPost=async path=>{routes.push(path);return path.endsWith('create-checkout')?{ok:true,order_id:'sr_'+'a'.repeat(48),url:'https://t.me/$test'}:{ok:true,order:{payload:'sr_'+'a'.repeat(48),status:'invoiced',expires_at:'2026-11-17T00:00:00Z'}};};await ctx.buyStreakRestore();assert.equal(ctx.data.checkin.broken,true);assert.match(els.get('dailyRestoreReceipt').textContent,/No streak change confirmed/);assert.deepEqual(routes,['/api/streak/restore/create-checkout','/api/streak/restore/status']);});
test('calendar removes repeated collected text and zero-value warm-up perks',()=>{
 const {ctx,els}=setup();Object.assign(ctx.data.checkin,{days:2,next_day:3,next_reward:300,tier:{name:'Warm-up',tap_bonus_percent:0,energy_bonus:0},next_tier:{day:3,tap_bonus_percent:5,energy_bonus:5},policy:{start:100,step:100,cap:2000,capDay:20}});
 ctx.renderDailyRewards();assert.equal(els.get('dailyRewardEyebrow').textContent,'Daily streak');
 assert.equal(els.get('dailyRewardAmount').textContent,'Day 2 collected ✓');
 assert.match(els.get('dailyRewardPerks').textContent,/Day 3 unlocks \+5%/);
 assert.doesNotMatch(els.get('dailyRewardPerks').textContent,/\+0/);
 assert.match(els.get('dailyRewardSchedule').textContent,/Day 20: 2,000 coins on regular days/);
 assert.match(els.get('hubDailyProgress').textContent,/Tomorrow 300 coins/);
});
test('new reward schedule never relabels a past claimed day with a revised payout',()=>{
 const {ctx}=setup();const c=fixture();c.calendar=[{day:1,reward:100,claimed:true},{day:2,reward:200,claimed:false}];
 const markup=ctx.dailyMarkerMarkup(c,true);assert.doesNotMatch(markup,/<b>100<\/b>/);
 assert.match(markup,/<b>✓<\/b>/);assert.match(markup,/<b>200<\/b>/);
});
test('earned century and endurance achievements decorate leaderboards without trusting names as HTML',()=>{
 const {ctx}=setup();assert.match(ctx.dailyCosmeticMarkup(['century_crest'],'<x>'),/class="cosmetic-avatar century"/);
 const m=ctx.dailyCosmeticMarkup(['century_crest','endurance_frame'],'<x>');
 assert.match(m,/class="cosmetic-avatar endurance"/);assert.match(m,/&lt;x>/);assert.doesNotMatch(m,/<x>/);
});

test('calendar makes the next recurring 4,000 total explicit, with no doubling of future regular days',()=>{
 const {ctx,els}=setup();Object.assign(ctx.data.checkin,{days:99,next_day:100,next_reward:4000,policy:{start:100,step:100,cap:2000,capDay:20,milestoneEvery:100,milestoneBonus:2000},next_milestone:{day:100,base:2000,bonus:2000,reward:4000}});
 ctx.renderDailyRewards();assert.equal(els.get('dailyDoubleReward').textContent,'Next Double Reward Day: Day 100 · 4,000 coins.');
 assert.match(els.get('hubDailyProgress').textContent,/Tomorrow 4,000 coins/);
 assert.match(els.get('dailyRewardMilestones').textContent,/4,000 total: 2,000 regular \+ 2,000 bonus/);
 Object.assign(ctx.data.checkin,{days:100,next_day:101,next_reward:2000,next_milestone:{day:200,base:2000,bonus:2000,reward:4000}});
 ctx.renderDailyRewards();assert.match(els.get('dailyDoubleReward').textContent,/Day 200/);assert.match(els.get('hubDailyProgress').textContent,/Tomorrow 2,000 coins/);
 Object.assign(ctx.data.checkin,{days:100,claimed:false,broken:true,next_day:1,next_reward:100,today_reward:100,next_milestone:{day:100,reward:4000}});
 ctx.renderDailyRewards();assert.match(els.get('dailyDoubleReward').textContent,/Day 100/);assert.match(els.get('dailyRewardClaim').textContent,/free · 100 coins/);
 ctx.progressionError=true;ctx.renderDailyRewards();assert.equal(els.get('dailyDoubleReward').hidden,true);
});

test('restore preview shows the actual next claim, including a hundred-day bonus',()=>{
 const {ctx,els}=setup();Object.assign(ctx.data.checkin,{claimed:false,broken:true,restore:{eligible:true,enabled:true,stars:250,days:99,daily_reward:2000,next_reward:4000,tap_bonus_percent:40,energy_bonus:50,expires_at:'2026-11-17T00:00:00Z'}});
 ctx.renderDailyRewards();assert.match(els.get('dailyRestoreBenefits').textContent,/next claim 4,000 coins/);
 assert.equal(els.get('dailyRestoreBuy').textContent,'Restore · ★ 250');
});

test('restore reviews the correct streak and charge; cancellation, account switch or expiry cannot start checkout',async()=>{
 for(const change of ['cancel','account','expired']){
   const {ctx}=setup();
   Object.assign(ctx.data.checkin,{claimed:false,broken:true,restore:{eligible:true,enabled:true,days:6,stars:250,expires_at:'2026-11-17T00:00:00Z'}});
   let finish;const routes=[];ctx.apiPost=async path=>routes.push(path);ctx.window={Telegram:{WebApp:{openInvoice(){throw Error('unexpected');}}}};
   ctx.reviewGamePurchase=(title,grant,stars)=>{
     assert.equal(title,'Review streak restore');assert.match(grant,/6-day streak/);assert.match(grant,/restart for free/);assert.equal(stars,250);
     return new Promise(resolve=>finish=resolve);
   };
   const pending=ctx.buyStreakRestore();
   if(change==='account')ctx.homeUserId=()=>20002;
   if(change==='expired')ctx.now=Date.parse('2026-11-18T00:00:00Z');
   finish(change!=='cancel');await pending;assert.deepEqual(routes,[],change);
 }
});
