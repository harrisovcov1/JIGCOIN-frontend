'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const pure=html.slice(html.indexOf('const HOME_TIERS ='),html.indexOf('const state ='))+html.slice(html.indexOf('const HOME_SEASON_KEY'),html.indexOf('// End of pure Home models.'));
const snap=(rank,balance)=>({ok:true,me:{telegram_id:123,balance,global_rank:rank,global_total:143},window:[{telegram_id:456,balance:rank===1?balance-1:balance+1,global_rank:rank===1?2:rank-1}]});
function models(){const c={};vm.createContext(c);vm.runInContext(pure,c);return c;}
test('overtake needs two verified snapshots, increased saved coins and a new best position',()=>{
 const c=models();assert.equal(c.homeOvertakeModel(snap(3,100),snap(2,200),123,3).rank,2);
 assert.equal(c.homeOvertakeModel(snap(10,100),snap(1,200),123,10).places,9);
 for(const [before,after,id,best] of [[null,snap(2,200),123,3],[snap(3,100),snap(2,100),123,3],[snap(3,200),snap(2,100),123,3],[snap(3,100),snap(3,200),123,3],[snap(3,100),snap(4,200),123,3],[snap(3,100),snap(2,200),456,3],[snap(3,100),snap(2,200),123,2]])assert.equal(c.homeOvertakeModel(before,after,id,best),null);
});
test('low-energy threshold uses actual capacity and rejects invalid or full values',()=>{
 const c=models();for(const [n,cap] of [[0,50],[15,50],[30,100]])assert.equal(c.homeEnergyLow(n,cap),true);
 for(const [n,cap] of [[16,50],[50,50],[31,100],[-1,50],[NaN,50],[0,0],[0,NaN]])assert.equal(c.homeEnergyLow(n,cap),false);
});
function race(){
 const el={hidden:true,replaceChildren(t){this.text=t;},append(t){this.sub=t.textContent;}};
 const c={state:{globalRank:3},homeConfirmedBalance:100,homeBestRaceRank:null,homeRaceSnapshot:null,homeRaceSyncedAt:0,homeCelebrationTimer:null,
 homeUserId:()=>123,document:{hidden:false,getElementById:id=>id==='homeCelebration'?el:{inert:false},createTextNode:t=>t,createElement:()=>({})},formatNumber:n=>String(n),clearTimeout(){},setTimeout:fn=>{c.end=fn;},appStorage:{getItem:()=> 'off'},window:{}};
 vm.createContext(c);vm.runInContext(pure+html.slice(html.indexOf('function observeHomeRace('),html.indexOf('function animateHomeTap(')),c);return {c,el};
}
test('observer baselines reloads, celebrates once, and does not replay rank oscillations',()=>{
 const {c,el}=race();c.observeHomeRace(snap(3,100),123,100000);assert.equal(el.hidden,true);
 c.state.globalRank=2;c.homeConfirmedBalance=200;c.observeHomeRace(snap(2,200),123,108000);assert.equal(el.text,'You moved up to #2!');assert.equal(el.hidden,false);
 c.end();c.observeHomeRace(snap(2,200),123,109000);assert.equal(el.hidden,true);
 c.state.globalRank=3;c.homeConfirmedBalance=210;c.observeHomeRace(snap(3,210),123,110000);
 c.state.globalRank=2;c.homeConfirmedBalance=220;c.observeHomeRace(snap(2,220),123,118000);assert.equal(el.hidden,true);
});
test('stale, mismatched, hidden or covered snapshots cannot interrupt Home',()=>{
 for(const mode of ['stale','rank-mismatch','balance-mismatch','hidden','covered','existing-rank-celebration']){
  const {c,el}=race();c.observeHomeRace(snap(3,100),123,100000);c.state.globalRank=2;c.homeConfirmedBalance=200;
  if(mode==='rank-mismatch')c.state.globalRank=3;
  if(mode==='balance-mismatch')c.homeConfirmedBalance=201;
  if(mode==='hidden')c.document.hidden=true;
  if(mode==='covered')c.document.getElementById=id=>id==='homeCelebration'?el:{inert:true};
  if(mode==='existing-rank-celebration'){el.hidden=false;el.text='Operator unlocked!';}
  c.observeHomeRace(snap(2,200),123,mode==='stale'?191000:108000);
  if(mode==='existing-rank-celebration')assert.equal(el.text,'Operator unlocked!');else assert.equal(el.hidden,true,mode);
 }
});
function refill(){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},setAttribute(name,value){this[name]=value;}});return nodes.get(id);};
 const c={document:{getElementById:get},window:{JigPilot:{canRefill:()=>true}},navigator:{onLine:true},state:{energy:10},maxEnergy:50,accountIsReady:()=>true,homeUserId:()=>101,missionsOwner:101,refillPreparation:{owner:101,status:'idle'},getPendingTaps:()=>0,getTapQueue:()=>[],preparedRefillFor:()=>null,requestRefillPreparation(){},recordRefillPrompt(){},
 recoveryTapView:s=>({energy:s.energy}),hubMissions:[{code:'sp_emergency_energy',provider:'monetag',status:'available',countdown_as_of_ms:Date.now()}],hubMissionLoadedAt:Date.now(),msToCountdown:()=> '04:30',getBoostView:()=>({action:'prepare',disabled:false,label:'Check ad availability',detail:'Watch ad becomes available when ready.'})};
 vm.createContext(c);vm.runInContext(pure+html.slice(html.indexOf('function renderHomeSession('),html.indexOf('async function refreshHomeRefillStatus(')),c);return {c,get};
}
test('Home promotes only a prepared advert or a confirmed refill, otherwise the weekly race',()=>{
 const {c,get}=refill(),button=get('homeBoostAction');
 for(const view of [{action:'prepare',disabled:false,label:'Check ads'},{action:'none',disabled:true,label:'Preparing'},{action:'none',disabled:true,label:'Available in 2m'}]){
  c.getBoostView=()=>view;c.renderHomeSession();assert.equal(button.dataset.focus,'weekly');assert.equal(button['aria-controls'],'weeklySheet');
 }
 c.getBoostView=()=>({action:'show',disabled:false,label:'Watch ad to refill'});c.renderHomeSession();
 assert.equal(button.dataset.focus,'sp_emergency_energy');assert.equal(button['aria-controls'],'boostSheet');assert.match(button.textContent,/Refill energy.*ad/i);
 c.getBoostView=()=>({action:'claim',disabled:false,label:'Claim full energy'});c.renderHomeSession();assert.equal(button.textContent,'Claim refill');
 c.navigator.onLine=false;c.renderHomeSession();assert.equal(button.dataset.focus,'weekly');
 c.accountIsReady=()=>false;c.renderHomeSession();assert.equal(button.disabled,true);
});
test('energy-strip refill entry appears at 30% before exhaustion and stays hidden for healthy or ineligible accounts',()=>{
 const {c,get}=refill(),button=get('homeRefillOpen');
 for(const [energy,cap,visible] of [[16,55,true],[17,55,false],[0,55,true],[30,100,true],[31,100,false],[100,100,false]]){
  c.state.energy=energy;c.maxEnergy=cap;c.renderHomeSession();assert.equal(button.hidden,!visible,`${energy}/${cap}`);
 }
 c.state.energy=2;c.window.JigPilot.canRefill=()=>false;c.renderHomeSession();assert.equal(button.hidden,true);
 c.window.JigPilot.canRefill=()=>true;c.accountIsReady=()=>false;c.renderHomeSession();assert.equal(button.hidden,true);assert.equal(button.disabled,true);
});
test('energy-strip entry distinguishes ready, preparation, retry, cooldown and unavailable states without claiming an ad is ready',()=>{
 const {c,get}=refill(),button=get('homeRefillOpen'),label=get('homeRefillState');
 for(const [view,expected] of [
  [{action:'show',label:'Watch ad to refill'},'Ad ready'],[{action:'claim',label:'Claim full energy'},'Claim ready'],
  [{action:'prepare',disabled:false,label:'Check ad availability'},'Check ads'],
  [{action:'none',disabled:true,label:'Checking ad availability…'},'Checking'],
  [{action:'none',disabled:true,label:'Try again in 37s'},'In 37s'],
  [{action:'none',disabled:true,label:'Available in 4m 30s'},'In 4m 30s'],
  [{action:'none',disabled:true,label:'Ads paused'},'Unavailable']
 ]){
  c.getBoostView=()=>view;c.renderHomeSession();assert.equal(label.textContent,expected);
  assert.match(button['aria-label'],/Open Rewards/);assert.ok(button['aria-label'].includes(view.label));
  assert.equal(button.disabled,false,'the route to status details remains usable');
 }
 c.refillPreparation.status='loading';c.getBoostView=()=>({action:'none',label:'Checking ad availability…'});c.renderHomeSession();assert.equal(label.textContent,'Preparing');
 c.navigator.onLine=false;c.renderHomeSession();assert.equal(label.textContent,'Offline');
});
test('a preparation or owned confirmed refill stays reachable after natural energy regeneration',()=>{
 const {c,get}=refill(),button=get('homeRefillOpen');c.state.energy=14;
 c.refillPreparation.status='loading';c.renderHomeSession();assert.equal(button.hidden,false);
 assert.equal(c.refillPreparation.offerVisible,true);c.state.energy=20;c.renderHomeSession();assert.equal(button.hidden,false,'a visible loading offer stays reachable above 30%');
 c.refillPreparation.status='idle';c.preparedRefillFor=()=>({});c.renderHomeSession();assert.equal(button.hidden,false);
 c.preparedRefillFor=()=>null;Object.assign(c.hubMissions[0],{status:'claimable',attempt_id:'receipt'});c.renderHomeSession();assert.equal(button.hidden,false);
 c.window.JigPilot.canRefill=()=>false;c.renderHomeSession();assert.equal(button.hidden,false,'a confirmed receipt remains reachable when new adverts are disabled');
 c.missionsOwner=202;c.renderHomeSession();assert.equal(button.hidden,true,'another account’s receipt is not an offer');
 c.missionsOwner=101;c.state.energy=50;c.renderHomeSession();assert.equal(button.hidden,true,'full energy does not invite a refill');
});
test('refill availability polling pauses for hidden, offline, covered, busy and healthy sessions',async()=>{
 let loads=0,renders=0;const c={accountIsReady:()=>true,document:{hidden:false,getElementById:()=>({inert:false})},navigator:{onLine:true},window:{},rewardAvailabilityNeedsRetry:()=>false,boostCheckedAt:0,boostRefreshInFlight:null,homeRefillCheckedAt:0,hubMissions:[],state:{energy:3},maxEnergy:50,recoveryTapView:s=>s,refreshBoostMissions:async()=>{loads++;},renderHomeSession:()=>{renders++;}};
 vm.createContext(c);vm.runInContext(pure+html.slice(html.indexOf('async function refreshHomeRefillStatus('),html.indexOf('function renderHomeRace(')),c);
 await c.refreshHomeRefillStatus();await c.refreshHomeRefillStatus();assert.equal(loads,1);assert.equal(renders,1);
 for(const field of ['hidden','offline','covered','busy','inflight','healthy']){
  c.homeRefillCheckedAt=0;c.document.hidden=field==='hidden';c.navigator.onLine=field!=='offline';c.document.getElementById=()=>({inert:field==='covered'});c.window.__rewardActionBusy=field==='busy';c.boostRefreshInFlight=field==='inflight'?{}:null;c.state.energy=field==='healthy'?50:3;
  await c.refreshHomeRefillStatus();assert.equal(loads,1,field);
 }
});

test('background preparation stays quiet at40%, latches an offer at30%, then remains visible during regeneration',()=>{
 const {c,get}=refill(),button=get('homeRefillOpen');c.maxEnergy=55;c.state.energy=22;
 c.refillPreparation={status:'loading',owner:101,offerVisible:false};
 c.renderHomeSession();assert.equal(button.hidden,true);
 c.state.energy=16;c.renderHomeSession();assert.equal(button.hidden,false);assert.equal(c.refillPreparation.offerVisible,true);
 c.state.energy=17;c.renderHomeSession();assert.equal(button.hidden,false);assert.equal(get('homeRefillState').textContent,'Preparing');
 c.refillPreparation.status='ready';c.preparedRefillFor=()=>({});c.state.energy=23;c.renderHomeSession();assert.equal(button.hidden,false);
 c.preparedRefillFor=()=>null;c.refillPreparation.status='expired';c.renderHomeSession();assert.equal(button.hidden,true);
});
