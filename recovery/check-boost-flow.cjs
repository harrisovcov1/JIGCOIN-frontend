'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('const COIN_REWARD_CODES ='),html.indexOf('async function loadSponsorMissions'));
function setup({status='available',confirm=false,energy=3}={}) {
  const elements={},events={},calls=[],toasts=[];let refreshes=0,visible=true,now=Date.now();
  const element=id=>elements[id]||(elements[id]={dataset:{},classList:{remove(){},add(){},toggle(){}},setAttribute(){},addEventListener(n,fn){events[id+':'+n]=fn;},scrollIntoView(){}});
  const missions=['sp_emergency_energy','sp_double_points','sp_visit_partner'].map(code=>({code,provider:'monetag',status,payout_amount:code==='sp_visit_partner'?200:0,cooldown_seconds:code==='sp_double_points'?1800:300,cooldown_hours:1,countdown_as_of_ms:now,attempt_id:status==='claimable'?'verified-attempt':null}));
  const list=element('rewardChoices');
  list.children=[];
  list.querySelector=element;
  list.insertBefore=(card,before)=>{
    list.children=list.children.filter(item=>item!==card);
    list.children.splice(before?list.children.indexOf(before):list.children.length,0,card);
  };
  for(const [button,code] of [['coinRewardAction','sp_visit_partner'],['energyBoostAction','sp_emergency_energy'],['doubleBoostAction','sp_double_points']]){
    const card=element(`[data-boost-code="${code}"]`);
    card.dataset.boostCode=code;
    element(button).closest=()=>card;
  }
  const ctx={Date,Promise,console,navigator:{onLine:true},openHomeQuests(){},homeUserId:()=>101,setTimeout,clearTimeout,window:{JigPilot:{canRefill:()=>true}},document:{hidden:false,getElementById:element},hubMissions:missions,hubMissionLoadedAt:now,
    dailyCheckinModel:()=>null,progressionError:false,progressionNow:()=>Date.now(),accountIsReady:()=>true,dailyRewardsBusy:false,restorePurchaseBusy:false,state:{energy,doubleBoostActive:false},maxEnergy:50,msToCountdown:ms=>`${Math.ceil(ms/1000)}s`,
    boostSheet:{classList:{contains:()=>visible,remove(){visible=false;}},querySelector:element},
    sheetBackdrop:{classList:{remove(){}}},tabTasks:{},tabFarm:{},setActiveTab(){},showAppSheet(){visible=true;},updateBoostHub(){},syncStateIfIdle:async()=>{},
    openCoinShopSheet(){},handleSponsorQuests(){throw Error('Boost must not open sponsored tasks');},handleEnergyBoostTask(){},handleDoubleBoostTask(){},
    backToHome:()=>calls.push(["home"]),showToast:s=>toasts.push(s),
    loadSponsorMissions:async()=>missions,
    refreshBalance:async()=>{refreshes++;},
    runMonetagQuest:async code=>{calls.push(['ad',code]);if(confirm){const m=missions.find(m=>m.code===code);m.status='claimable';m.attempt_id='verified-attempt';}},
    apiPost:async(path,body)=>{calls.push([path,body]);missions.find(m=>m.code===body.code).status='cooldown';return {ok:true,reward_label:'Test boost'};},
  };
  vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function homeEnergyLow('),html.indexOf('function homeCoinUnlock('))+code,ctx);
  vm.runInContext('missionsOwner=101;',ctx);
  return {ctx,calls,toasts,events,elements,missions,refreshes:()=>refreshes,setVisible:v=>visible=v};
}
test('a low-energy refill requires a verified provider receipt to claim',async()=>{
  const h=setup({confirm:true});
  await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.calls.length,2);
  assert.deepEqual(h.calls[0],['ad','sp_emergency_energy']);
  assert.equal(h.calls[1][0],'/api/mission/complete');
  assert.equal(h.calls[1][1].code,'sp_emergency_energy');
  assert.equal(h.calls[1][1].attempt_id,'verified-attempt');
  assert.equal(h.refreshes(),1);
  assert.equal(h.ctx.state.energy,3,'the browser cannot grant energy');
});
test('retired placements offer no new ads; previously confirmed coin and multiplier rewards remain claimable',async()=>{
  for(const code of ['sp_visit_partner','sp_double_points']){
    const h=setup();
    await h.ctx.performBoostAction(code);
    assert.equal(h.calls.length,0);
    h.missions.find(m=>m.code===code).status='claimable';
    h.missions.find(m=>m.code===code).attempt_id='prior-receipt';
    await h.ctx.performBoostAction(code);
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0][0],'/api/mission/complete');
    assert.equal(h.calls[0][1].attempt_id,'prior-receipt');
    assert.equal(h.calls[0][1].code,code);
  }
});
test('an ad promise alone never grants a refill',async()=>{
  const h=setup();await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.calls.length,1);assert.equal(h.refreshes(),0);assert.equal(h.ctx.state.energy,3);
});
test('an unqualified advert releases the lock and explains the retry without granting energy',async()=>{
  const h=setup();h.ctx.runMonetagQuest=async()=>{throw Error('AD_NOT_REWARDED');};
  await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.ctx.window.__rewardActionBusy,false);assert.equal(h.calls.length,0);
  assert.equal(h.ctx.state.energy,3);assert.match(vm.runInContext('adNotice.text',h.ctx),/did not qualify/);
});
test('pending adverts show the server retry timer but never authorize a retry locally',()=>{
  const h=setup({status:'pending'}),mission=h.missions[0];
  const now=Date.now();mission.countdown_as_of_ms=now;mission.retry_after_seconds=60;
  assert.equal(h.ctx.getBoostView(mission.code,mission,now+10000).label,'Check again in 50s');
  const expired=h.ctx.getBoostView(mission.code,mission,now+61000);
  assert.equal(expired.label,'Checking availability…');assert.equal(expired.disabled,true);
});
test('ad holdout blocks new refills including at zero energy',async()=>{
  const h=setup({energy:0});
  h.ctx.window.JigPilot.canRefill=()=>false;
  await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.calls.length,0);
});
test('late confirmation is claimable without displaying a second advert',async()=>{
  const h=setup({status:'pending'});await h.ctx.performBoostAction('sp_emergency_energy');assert.equal(h.calls.length,0);
  h.missions[0].status='claimable';h.missions[0].attempt_id='verified-late';
  await h.ctx.performBoostAction('sp_emergency_energy');assert.equal(h.calls.length,1);
  assert.equal(h.calls[0][0],'/api/mission/complete');assert.equal(h.calls[0][1].attempt_id,'verified-late');
});
test('repeated presses and another boost cannot launch overlapping adverts',async()=>{
  const h=setup();let release;h.ctx.runMonetagQuest=async code=>{h.calls.push(['ad',code]);await new Promise(r=>release=r);};
  const action=h.ctx.performBoostAction('sp_emergency_energy');
  await h.ctx.performBoostAction('sp_double_points');await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.calls.length,1);release();await action;assert.equal(h.ctx.window.__rewardActionBusy,false);
});
test('leaving a stalled advert releases the lock; a later receipt remains claimable once',async()=>{
  const h=setup();
  let finishAd;
  h.ctx.runMonetagQuest=async()=>new Promise(resolve=>{finishAd=resolve;});
  const wait=h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.ctx.window.__rewardActionBusy,true);
  h.setVisible(false);
  h.ctx.stopRewardWait();
  await wait;
  assert.equal(h.ctx.window.__rewardActionBusy,false);
  finishAd();
  await Promise.resolve();
  assert.equal(h.calls.length,0);
  h.missions[0].status='claimable';
  h.missions[0].attempt_id='confirmed-after-close';
  h.setVisible(true);
  await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0][1].attempt_id,'confirmed-after-close');
  assert.equal(h.refreshes(),1);
});
test('full energy, active double points and cooldown expiry cannot authorize an advert',async()=>{
  const h=setup({energy:50});await h.ctx.performBoostAction('sp_emergency_energy');
  h.ctx.state.doubleBoostUntil=new Date(Date.now()+300000).toISOString();await h.ctx.performBoostAction('sp_double_points');
  assert.deepEqual(h.calls,[["home"]]);h.calls.length=0;assert.match(h.ctx.getBoostView('sp_double_points',h.missions[1]).detail,/remaining/);
  h.ctx.state.energy=0;h.missions[0].status='cooldown';h.missions[0].cooldown_remaining_seconds=1;h.missions[0].countdown_as_of_ms=Date.now()-5000;
  await h.ctx.performBoostAction('sp_emergency_energy');assert.equal(h.calls.length,0);
});
test('failed status refresh disables stale available actions; successful retry restores them',async()=>{
  const h=setup();h.ctx.loadSponsorMissions=async()=>{throw Error('offline');};
  await assert.rejects(h.ctx.refreshBoostMissions());await h.ctx.performBoostAction('sp_emergency_energy');assert.equal(h.calls.length,0);
  h.ctx.loadSponsorMissions=async()=>h.missions;await h.ctx.refreshBoostMissions();
  assert.equal(h.ctx.getBoostView('sp_emergency_energy',h.missions[0]).disabled,false);
});
test('SDK failure never calls complete, releases the action lock and recovers claimable rewards',async()=>{
  const h=setup();h.ctx.runMonetagQuest=async()=>{h.missions[0].status='claimable';h.missions[0].attempt_id='confirmed-after-error';throw Error('SDK timeout');};
  await h.ctx.performBoostAction('sp_emergency_energy');assert.equal(h.calls.length,0);assert.equal(h.ctx.window.__rewardActionBusy,false);
  assert.equal(h.ctx.getBoostView('sp_emergency_energy',h.missions[0]).action,'claim');
});
test('failed completion never announces activation or changes account state',async()=>{
  const h=setup({status:'claimable'});h.ctx.apiPost=async()=>({ok:false,error:'AD_CONFIRMATION_PENDING'});
  await h.ctx.performBoostAction('sp_double_points');assert.equal(h.refreshes(),0);assert.ok(h.toasts.every(t=>!t.includes('activated')));
});
test('closed boost panel does not poll or reopen after a delayed status response',async()=>{
  const h=setup({status:'pending'});let loads=0;h.ctx.loadSponsorMissions=async()=>{loads++;return h.missions;};
  h.setVisible(false);h.ctx.pollBoostStatus();assert.equal(loads,0);
  await h.ctx.refreshBoostMissions();assert.equal(h.ctx.boostSheet.classList.contains('show'),false);
});

test('each card reads its own server timer, including an older server during deployment',()=>{
  const h=setup({status:'cooldown'}),m=h.missions[0];m.cooldown_remaining_seconds=3500;
  assert.match(h.ctx.getBoostView(m.code,m).detail,/Cooldown · 5 minutes/);
  assert.equal(h.ctx.rewardCooldownLabel(h.missions[2]),'5 minutes');
  assert.equal(h.ctx.rewardCooldownLabel(h.missions[1]),'30 minutes');
  m.cooldown_seconds=3600;assert.match(h.ctx.getBoostView(m.code,m).detail,/Cooldown · 1 hour/);
  delete m.cooldown_seconds;m.cooldown_hours=24;
  assert.match(h.ctx.getBoostView(m.code,m).detail,/Cooldown · 24 hours/);
  for(const cooldown_seconds of [0,-1,Infinity,'invalid'])assert.equal(h.ctx.rewardCooldownLabel({cooldown_seconds}),null);
});
test('confirmed legacy coin reward uses its original claim code without another advert',async()=>{
  const h=setup({status:'claimable'}),m=h.missions[2];m.claim_code='sp_bonus_mission';m.cooldown_remaining_seconds=280;
  h.ctx.apiPost=async(path,body)=>{h.calls.push([path,body]);return {ok:true,reward_label:'+200 coins'};};
  await h.ctx.performBoostAction(m.code);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].code,'sp_bonus_mission');
  assert.equal(h.refreshes(),1);assert.equal(h.toasts[0],'+200 coins received!');
});
test('claim alias cannot redirect to a different reward type',async()=>{
  const h=setup({status:'claimable'}),m=h.missions[2];m.claim_code='sp_emergency_energy';
  await h.ctx.performBoostAction(m.code);assert.equal(h.calls.length,0);assert.equal(h.refreshes(),0);
});
test('one reward panel contains three actions with no duplicate task screen or category tabs',()=>{
  assert.equal((html.match(/<article[^>]+data-boost-code=/g)||[]).length,3);
  assert.doesNotMatch(html,/id="sponsorSheet"|data-earn-target/);
  const nav=html.match(/<nav class="bottom-nav"[^>]*>[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(nav,/<span>Earn<\/span>/);
  assert.match(html,/<span>Rewards<span id="dailyRewardBadge"/);
});

 test('refill displays actual missing energy at the current streak cap and after regeneration',()=>{
  const h=setup({energy:43});h.ctx.maxEnergy=60;
  assert.match(h.ctx.getBoostView('sp_emergency_energy',h.missions[0]).detail,/\+17 energy now · Fill to 60/);
  h.missions[0].status='claimable';h.missions[0].attempt_id='confirmed';h.ctx.state.energy=55;
  assert.match(h.ctx.getBoostView('sp_emergency_energy',h.missions[0]).detail,/\+5 energy now \(up to 60\)/);
});
