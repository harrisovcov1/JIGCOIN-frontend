'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const ladder=html.slice(html.indexOf('const HOME_TIERS ='),html.indexOf('const state ='));
const code=ladder+html.slice(html.indexOf('const HOME_SEASON_KEY'),html.indexOf('// End of pure Home models.'));
const model=()=>{const c={};vm.createContext(c);vm.runInContext(code,c);return c;};
test('12,961 targets Operator at 50,000 rather than an unrelated 13,000 milestone',()=>{
 const c=model(),m=c.homeGoalModel(12961);assert.equal(m.next,50000);assert.equal(m.nextName,'Operator');assert.equal(m.remaining,37039);assert.equal(m.progress,2961/40000);assert.equal(m.current.name,'Grinder');
});
test('each rank boundary advances the shared target and the top rank remains uncapped',()=>{
 const c=model();
 for(const [b,next,tier] of [[0,10000,0],[9999,10000,0],[10000,50000,1],[49999,50000,1],[50000,150000,2],[150000,500000,3],[500000,1500000,4],[1500000,5000000,5],[5000000,10000000,6],[9999999,10000000,6]]){
  const g=c.homeGoalModel(b);assert.equal(g.next,next);assert.equal(g.tier,tier);assert.ok(g.progress>=0&&g.progress<1);
 }
 for(const b of [10000000,50000000,100000000,Number.MAX_SAFE_INTEGER]){const g=c.homeGoalModel(b);assert.equal(g.complete,true);assert.equal(g.current.name,'JigCoin Legend');assert.equal(g.progress,1);assert.equal(g.next,null);}
 for(const b of [-1,NaN,Infinity,1.2,null,'12961'])assert.equal(c.homeGoalModel(b),null);
});
test('a maximum pack advances the actual balance and rank without a separate purchase ladder',()=>{
 const c=model(),g=c.homeGoalModel(12961+700000);assert.equal(g.current.name,'General');assert.equal(g.next,1500000);assert.equal(g.remaining,787039);
 assert.equal(c.homeGoalModel(14*700000).current.name,'Champion');assert.equal(c.homeGoalModel(15*700000).current.name,'JigCoin Legend');
});
test('celebrations match ranks and ignore small incidental totals',()=>{
 const c=model();assert.equal(c.advanceHomeMilestone({highWater:12961},13000).milestone,null);
 assert.equal(c.advanceHomeMilestone({highWater:149999},150000).milestone,150000);
 assert.equal(c.advanceHomeMilestone({highWater:1499999},1500000).milestone,1500000);
 assert.equal(c.advanceHomeMilestone({highWater:4999999},5000000).milestone,5000000);
 assert.equal(c.advanceHomeMilestone({highWater:9999999},10000000).milestone,10000000);
});
test('first load and returning sessions baseline existing wealth without celebration',()=>{const c=model();for(const prev of [null,{highWater:1000}]){const r=c.advanceHomeMilestone(prev,1000000,true);assert.equal(r.milestone,null);assert.equal(r.record.highWater,1000000)}});
test('one confirmed leap celebrates only its highest meaningful milestone',()=>{const c=model();const r=c.advanceHomeMilestone({highWater:999},12000);assert.equal(r.milestone,10000);assert.equal(r.record.highWater,12000);assert.equal(c.advanceHomeMilestone(r.record,12000).milestone,null)});
test('refund followed by re-crossing cannot replay a celebrated milestone',()=>{const c=model();const first=c.advanceHomeMilestone({highWater:9999},10000);assert.equal(first.milestone,10000);const refund=c.advanceHomeMilestone(first.record,9000);assert.equal(refund.record.highWater,10000);assert.equal(c.advanceHomeMilestone(refund.record,10000).milestone,null)});
test('invalid balance cannot corrupt milestone history',()=>{const c=model();const record={highWater:25000};for(const n of [-1,NaN,Infinity,1000.1,'50000']){const r=c.advanceHomeMilestone(record,n);assert.equal(r.record,record);assert.equal(r.milestone,null)}});
test('coin tiers follow the existing rank thresholds including millions',()=>{const c=model();for(const [balance,tier] of [[0,0],[9999,0],[10000,1],[49999,1],[50000,2],[150000,3],[500000,4],[1500000,5],[5000000,6],[10000000,7]])assert.equal(c.homeTierIndex(balance),tier)});
const snapshot=(rank,balance,otherBalance,total=143)=>({ok:true,me:{telegram_id:123,balance,global_rank:rank,global_total:total},window:[{telegram_id:456,balance:otherBalance,global_rank:rank===1?2:rank-1}]});
test('overtake requires one more coin than a rival, including equal-score ties',()=>{const c=model();assert.equal(c.homeRaceModel(snapshot(2,12809,13000),123).text,'192 coins to pass #1');assert.equal(c.homeRaceModel(snapshot(2,13000,13000),123).text,'1 coin to pass #1')});
test('rival gap follows each whole coin, reconciles a rejected tap and never awards a projected rank',()=>{
 const c=model(),old=snapshot(2,18226,31878),gap=b=>c.homeRaceModel(old,123,b);
 assert.equal(gap(18226).text,'13,653 coins to pass #1');
 assert.equal(gap(18231.25).text,'13,648 coins to pass #1');
 assert.equal(gap(18230).text,'13,649 coins to pass #1');
 assert.equal(gap(31878.95).text,'1 coin to pass #1');
 assert.equal(gap(31879).rank,2);
 assert.equal(gap(31879).refreshNeeded,true);
 assert.equal(c.homeRaceModel(snapshot(1,31879,31878),123,31880).text,'2 coins ahead of #2');
 assert.equal(c.homeRaceModel(snapshot(2,18230,31890),123,18230).text,'13,661 coins to pass #1');
 assert.equal(c.homeRaceModel(old,124,18231),null);
 assert.equal(c.homeRaceModel(old,123,null),null);
});
test('first position handles a lead, tie and sole player without invented opponents',()=>{const c=model();assert.equal(c.homeRaceModel(snapshot(1,13000,12809),123).text,'191 coins ahead of #2');assert.match(c.homeRaceModel(snapshot(1,13000,13000),123).text,/Tied on coins/);assert.match(c.homeRaceModel(snapshot(1,13000,0,1),123).text,/No rival yet/)});
test('Home uses live tap feedback during a delayed refresh, expires old standings and reloads the opponent',async()=>{
 let now=125000,resolve;
 const label={},c=model();
 Object.assign(c,{Date:{now:()=>now},navigator:{onLine:true},document:{hidden:false,getElementById:id=>id==='homeRace'?label:{inert:false}},
  homeUserId:()=>123,accountIsReady:()=>true,recoveryTapView:s=>s,state:{bal:100,globalRank:2},
  homeRaceSnapshot:snapshot(2,100,110),homeConfirmedBalance:100,homeRaceSyncedAt:120000,homeRaceAttemptAt:120000,homeRaceBusy:false,
  apiPost:()=>new Promise(done=>{resolve=done;}),observeHomeRace:value=>{c.homeRaceSnapshot=value;c.homeRaceSyncedAt=now;}});
 vm.runInContext(html.slice(html.indexOf('function renderHomeRace('),html.indexOf('function openHomeJourney(')),c);
 const refresh=c.refreshHomeRace(true);
 c.state.bal=103.15;c.renderHomeRace();
 assert.equal(label.textContent,'8 coins to pass #1');
 resolve({ok:false,reason:'NETWORK'});await refresh;
 assert.equal(label.textContent,'8 coins to pass #1');
 now=215000;c.navigator.onLine=false;await c.refreshHomeRace();
 assert.equal(label.textContent,'View your nearest rivals');
 c.navigator.onLine=true;
 const retry=c.refreshHomeRace();resolve(snapshot(2,103,118));await retry;
 assert.equal(label.textContent,'16 coins to pass #1');
 now+=8000;c.state.bal=c.homeConfirmedBalance=120;
 const crossed=c.refreshHomeRace();resolve(snapshot(1,120,118));c.state.globalRank=1;await crossed;
 assert.equal(label.textContent,'2 coins ahead of #2');
});
test('leaderboard mismatches, negative values and malformed rivals have no target',()=>{const c=model();assert.equal(c.homeRaceModel(snapshot(2,100,200),124),null);assert.equal(c.homeRaceModel(snapshot(2,200,100),123),null);assert.equal(c.homeRaceModel(snapshot(1,100,200),123),null);assert.equal(c.homeRaceModel(snapshot(0,100,200),123),null);const s=snapshot(2,100,200);s.window[0].telegram_id=123;assert.equal(c.homeRaceModel(s,123),null)});
test('boost countdown requires a valid future server expiry',()=>{const c=model();const now=Date.parse('2026-11-16T16:00:00Z');assert.equal(c.homeBoostRemaining(true,'2026-11-16T16:10:00Z',now),600000);for(const until of ['',null,'bad','2026-11-16T15:59:59Z'])assert.equal(c.homeBoostRemaining(true,until,now),0);assert.equal(c.homeBoostRemaining(false,'2026-11-16T16:10:00Z',now),0)});
test('Home confirmed observer isolates accounts and ignores optimistic rendering',()=>{
 const store=new Map(),celebrations=[],nodes=new Map();const c={window:{Telegram:{WebApp:{initDataUnsafe:{user:{id:123}}}}},document:{hidden:false,getElementById:id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,inert:false});return nodes.get(id);}},appStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},safeParseJSON:(v,f)=>v?JSON.parse(v):f,clearTimeout(){},showHomeCelebration:v=>celebrations.push(v)};
 vm.createContext(c);vm.runInContext(code+html.slice(html.indexOf('let homeIdentity='),html.indexOf('function showHomeCelebration(')),c);
 c.observeHomeConfirmedState({ok:true,balance:9999});assert.equal(celebrations.length,0);
 // Rendering a projected goal is pure and cannot change confirmed achievements.
 c.homeGoalModel(10005);assert.equal(celebrations.length,0);
 c.observeHomeConfirmedState({ok:true,balance:10000});assert.deepEqual(celebrations,[10000]);
 c.window.Telegram.WebApp.initDataUnsafe.user.id=456;c.observeHomeConfirmedState({ok:true,balance:49999});assert.equal(celebrations.length,1);
 c.observeHomeConfirmedState({ok:true,balance:50000});assert.deepEqual(celebrations,[10000,50000]);assert.equal(store.size,2);
 c.window.Telegram.WebApp.initDataUnsafe.user.id=123;c.observeHomeConfirmedState({ok:true,balance:900});c.observeHomeConfirmedState({ok:true,balance:10000});assert.equal(celebrations.length,2);
});
test('missing or unsupported animation APIs cannot interrupt tap processing',()=>{
 const feedback=html.slice(html.indexOf('function animateHomeTap('),html.indexOf('function renderHomeProgress('));
 for(const el of [null,{animate(){throw new Error('unsupported')}},{animate(){},getAnimations(){return[]}}]){
  const c={window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>el}};vm.createContext(c);vm.runInContext(feedback,c);assert.doesNotThrow(()=>c.animateHomeTap(1));
 }
});
test('reduced motion omits all tap particles and coin animation',()=>{
 let created=0;const c={window:{matchMedia:()=>({matches:true})},document:{getElementById:()=>({animate(){created++}}),createElement(){created++}},Date:{now:()=>1000},homeLastHaptic:999,appStorage:{getItem:()=> 'off'}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function animateHomeTap('),html.indexOf('function renderHomeProgress(')),c);c.animateHomeTap(1);assert.equal(created,0);
});

test('pending taps cannot split the rank badge, ring and bar or unlock a rank early',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},dataset:{},classList:{toggle(){}}});return nodes.get(id);};
 const c={document:{getElementById:get},balanceText:{textContent:'50,001',classList:{toggle(){}}},rankNameEl:get('badge'),rankPointsTextEl:get('points'),nextRankPointsTextEl:get('next'),rankProgressFill:get('bar'),accountIsReady:()=>true,homeConfirmedBalance:49999,formatNumber:n=>n.toLocaleString('en-GB'),renderHomeRace(){},renderHomeSession(){},renderCollectibleCoin(){}};
 vm.createContext(c);vm.runInContext(code+html.slice(html.indexOf('function renderHomeProgress('),html.indexOf('function renderHomeSession(')),c);
 c.renderHomeProgress({bal:50001});assert.equal(get('badge').textContent,'Grinder');assert.match(get('homeGoal').textContent,/Operator target reached · Saving/);assert.equal(get('next').textContent,'50,000');
 assert.equal(Number(get('homeGoalRing').style.strokeDashoffset),0);assert.equal(get('bar').style.transform,'scaleX(1)');
 c.renderHomeProgress({bal:49999});assert.equal(get('homeGoal').textContent,'1 coin to Operator');assert.equal(get('bar').style.transform,'scaleX(0.999975)');
 c.homeConfirmedBalance=50001;c.renderHomeProgress({bal:50001});assert.equal(get('badge').textContent,'Operator');assert.equal(get('homeGoal').textContent,'99,999 coins to Commander');assert.equal(get('next').textContent,'150,000');
 c.homeConfirmedBalance=10000000;c.renderHomeProgress({bal:10000000});assert.equal(get('badge').textContent,'JigCoin Legend');assert.equal(get('homeGoalRing').style.strokeDashoffset,'0');assert.equal(get('next').textContent,'unlocked');
});
