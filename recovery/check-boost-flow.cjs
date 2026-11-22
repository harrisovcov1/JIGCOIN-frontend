'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const challenge=html.slice(html.indexOf('function rewardsChallengeView('),html.indexOf('function ',html.indexOf('function rewardsChallengeView(')+10));
const code=challenge+html.slice(html.indexOf('const COIN_REWARD_CODES ='),html.indexOf('async function loadSponsorMissions'));
const diagnosticCode=html.slice(html.indexOf('function monetagOutcomeCode('),html.indexOf('async function ensureMonetagSDK('));
const goalCode=html.slice(html.indexOf('const HOME_TIERS ='),html.indexOf('const state ='))+
  html.slice(html.indexOf('const HOME_SEASON_KEY'),html.indexOf('// End of pure Home models.'));
const attemptId='12345678-1234-4123-8123-123456789abc';
function setup({status='available',confirm=false,energy=3}={}) {
  const elements={},events={},calls=[],toasts=[],outcomes=[];let refreshes=0,visible=true,now=Date.now();
  class ClockDate extends Date {static now(){return now;}}
  const element=id=>elements[id]||(elements[id]={dataset:{},classList:{remove(){},add(){},toggle(){}},setAttribute(){},replaceChildren(){},addEventListener(n,fn){events[id+':'+n]=fn;},scrollIntoView(){}});
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
  const ctx={Date:ClockDate,performance:{now:()=>now},Promise,console,navigator:{onLine:true},openHomeQuests(){},homeUserId:()=>101,setTimeout,clearTimeout,window:{JigPilot:{canRefill:()=>true},addEventListener(){}},document:{hidden:false,getElementById:element,addEventListener(){}},hubMissions:missions,hubMissionLoadedAt:now,
    refillPreparation:{status:'idle',owner:101},refillPreparationFlight:null,monetagProviderFlight:null,refillRearmAfterCooldown:false,preparationUsed:false,
    preparedRefillFor:(mission=missions[0])=>!ctx.preparationUsed&&ctx.window.JigPilot.canRefill()&&mission.provider==='monetag'&&mission.status==='available'&&ctx.state.energy<ctx.maxEnergy?{attemptId}:null,
    reconcileRefillPreparation(){if(ctx.window.__rewardActionBusy)ctx.preparationUsed=true;},refillTapsSettled:()=>true,
    invalidateRefillPreparation(){ctx.preparationUsed=true;},requestRefillPreparation(){},recordRefillPrompt(){},prepareMonetagRefill:async()=>calls.push(['prepare']),
    homeIdentity:101,homeConfirmedBalance:49000,formatNumber:n=>n.toLocaleString('en-GB'),setCoinArtwork:(el,tier)=>{el.dataset.artwork=String(tier);},
    progressionClaimBusy:false,progressionBusy:false,progressionCurrent:()=>null,dailyCheckinModel:()=>null,progressionError:false,progressionNow:()=>Date.now(),accountIsReady:()=>true,dailyRewardsBusy:false,restorePurchaseBusy:false,state:{energy,doubleBoostActive:false},maxEnergy:50,msToCountdown:ms=>`${Math.ceil(ms/1000)}s`,
    boostSheet:{dataset:{},classList:{contains:()=>visible,remove(){visible=false;}},querySelector:element},
    sheetBackdrop:{classList:{remove(){}}},tabTasks:{},tabFarm:{},setActiveTab(){},showAppSheet(){visible=true;},updateBoostHub(){},syncStateIfIdle:async()=>{},
    openCoinShopSheet(){},handleSponsorQuests(){throw Error('Boost must not open sponsored tasks');},handleEnergyBoostTask(){},handleDoubleBoostTask(){},
    backToHome:()=>calls.push(["home"]),showToast:s=>toasts.push(s),
    loadSponsorMissions:async()=>missions,
    refreshBalance:async()=>{refreshes++;},
    runMonetagQuest:async(code,_here,onStage)=>{onStage('display',attemptId);calls.push(['ad',code]);if(confirm){const m=missions.find(m=>m.code===code);m.status='claimable';m.attempt_id='verified-attempt';}},
    apiPost:async(path,body)=>{if(path==='/api/mission/outcome'){outcomes.push(body);return {ok:true};}calls.push([path,body]);missions.find(m=>m.code===body.code).status='cooldown';return {ok:true,reward_label:'Test boost'};},
  };
  vm.createContext(ctx);vm.runInContext(goalCode+diagnosticCode+html.slice(html.indexOf('function homeEnergyLow('),html.indexOf('function homeCoinUnlock('))+code,ctx);
  vm.runInContext('missionsOwner=101;',ctx);
  return {ctx,calls,toasts,events,elements,missions,outcomes,refreshes:()=>refreshes,setVisible:v=>visible=v,advance:ms=>{now+=ms;}};
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
  const h=setup();h.ctx.runMonetagQuest=async(_code,_here,onStage)=>{onStage('display',attemptId);throw Error('AD_NOT_REWARDED');};
  await h.ctx.performBoostAction('sp_emergency_energy');
  assert.equal(h.ctx.window.__rewardActionBusy,false);assert.equal(h.calls.length,0);
  assert.equal(h.ctx.state.energy,3);assert.match(vm.runInContext('adNotice.text',h.ctx),/did not qualify/);
});
test('pending adverts show the server retry timer but never authorize a retry locally',()=>{
  const h=setup({status:'pending'}),mission=h.missions[0];
  const now=Date.now();mission.countdown_as_of_ms=now;mission.retry_after_seconds=60;
  assert.equal(h.ctx.getBoostView(mission.code,mission,now+10000).label,'Try again in 50s');
  const expired=h.ctx.getBoostView(mission.code,mission,now+61000);
  assert.equal(expired.label,'Awaiting advert confirmation…');assert.equal(expired.disabled,true);
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

 test('refill describes the current capacity consistently before and after regeneration',()=>{
  const h=setup({energy:43});h.ctx.maxEnergy=60;
  assert.match(h.ctx.getBoostView('sp_emergency_energy',h.missions[0]).detail,/Refill to 60 energy/);
  h.missions[0].status='claimable';h.missions[0].attempt_id='confirmed';h.ctx.state.energy=55;
  assert.match(h.ctx.getBoostView('sp_emergency_energy',h.missions[0]).detail,/Advert confirmed · Refill to 60 energy/);
});
test('healthy energy hides an expired failed-ad notice without losing late receipt polling',async()=>{
  const h=setup({status:'pending',energy:23});h.ctx.maxEnergy=55;
  vm.runInContext(`adNotice={owner:101,code:'sp_emergency_energy',kind:'error',at:Date.now()-60001,attempt_id:'${attemptId}',stage:'preload',error_code:'SDK_TIMEOUT',text:'Old error'};boostNextPoll=0;`,h.ctx);
  h.ctx.renderBoostCards();
  assert.equal(h.elements['[data-boost-code="sp_emergency_energy"]'].hidden,false);
  assert.equal(h.elements.rewardsCollectionCard.hidden,true);assert.equal(h.elements.boostHelp.hidden,true);
  assert.doesNotMatch(h.elements.boostCooldownNote.textContent,/Old error/);assert.equal(vm.runInContext('adNotice',h.ctx),null);
  let polls=0;h.ctx.loadSponsorMissions=async()=>{polls++;return h.missions;};h.ctx.pollBoostStatus();
  for(let i=0;i<10;i++)await Promise.resolve();assert.equal(polls,1);
  h.missions[0].status='claimable';h.missions[0].attempt_id=attemptId;await h.ctx.refreshBoostMissions();
  assert.equal(h.elements['[data-boost-code="sp_emergency_energy"]'].hidden,false);
  assert.equal(h.elements.rewardsCollectionCard.hidden,true);assert.equal(h.elements.energyBoostAction.dataset.action,'claim');
});
test('an available state clears expired attempted-ad errors and their support reference',()=>{
  const h=setup();
  vm.runInContext(`adNotice={owner:101,code:'sp_emergency_energy',kind:'error',at:Date.now()-60001,attempt_id:'${attemptId}',stage:'preload',error_code:'NO_FILL',text:'Old error'};`,h.ctx);
  h.ctx.renderBoostCards();assert.equal(vm.runInContext('adNotice',h.ctx),null);assert.equal(h.elements.boostHelp.hidden,true);
});
test('a fresh preload timeout survives natural regeneration and a status refresh while the refill panel stays available',async()=>{
  const h=setup({energy:11});h.ctx.maxEnergy=55;
  h.ctx.runMonetagQuest=async(_code,_here,onStage)=>{
    onStage('preload',attemptId);h.missions[0].status='pending';
    h.advance(10000);h.ctx.state.energy=23;throw Error('Timeout');
  };
  await h.ctx.performBoostAction('sp_emergency_energy');
  assert.match(h.elements.boostCooldownNote.textContent,/No advert loaded in time/);
  assert.equal(h.elements.boostHelp.hidden,false);assert.match(h.elements.boostHelpText.textContent,/PRELOAD \/ SDK_TIMEOUT/);
  assert.equal(h.outcomes.length,1);assert.equal(h.outcomes[0].attempt_id,attemptId);
  assert.equal(h.outcomes[0].elapsed_ms,10000);
  assert.equal(h.elements['[data-boost-code="sp_emergency_energy"]'].hidden,false);
  assert.equal(h.elements.rewardsCollectionCard.hidden,true);assert.equal(h.calls.length,0);
  h.advance(1000);h.missions[0].status='available';await h.ctx.refreshBoostMissions();
  assert.equal(h.elements.boostHelp.hidden,false);assert.match(h.elements.boostCooldownNote.textContent,/No advert loaded in time/);
  h.advance(59000);h.ctx.renderBoostCards();
  assert.equal(h.elements.boostHelp.hidden,true);assert.doesNotMatch(h.elements.boostCooldownNote.textContent,/No advert loaded in time/);
});
test('a later confirmed receipt supersedes a fresh error and remains claimable at healthy energy',async()=>{
  const h=setup({status:'pending',energy:23});h.ctx.maxEnergy=55;
  vm.runInContext(`adNotice={owner:101,code:'sp_emergency_energy',kind:'error',at:Date.now(),attempt_id:'${attemptId}',stage:'preload',error_code:'SDK_TIMEOUT',text:'No advert loaded in time'};`,h.ctx);
  h.ctx.renderBoostCards();assert.equal(h.elements.boostHelp.hidden,false);
  h.missions[0].status='claimable';h.missions[0].attempt_id=attemptId;await h.ctx.refreshBoostMissions();
  assert.equal(h.elements.boostHelp.hidden,true);assert.match(h.elements.boostCooldownNote.textContent,/advert is confirmed/);
  assert.equal(h.elements.energyBoostAction.dataset.action,'claim');assert.equal(h.elements.rewardsCollectionCard.hidden,true);
  assert.equal(h.calls.length,0,'rendering a receipt does not grant energy');assert.equal(h.ctx.state.energy,23);
});
test('a long displayed advert stays active beyond 45 seconds and claims only the later verified receipt',async()=>{
  const h=setup();let finish;const timers=[];
  h.ctx.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};h.ctx.clearTimeout=()=>{};
  h.ctx.runMonetagQuest=async(_code,_here,onStage)=>{onStage('display',attemptId);await new Promise(resolve=>{finish=resolve;});};
  const running=h.ctx.performBoostAction('sp_emergency_energy');
  for(const timer of timers)if(timer.delay<=75000)timer.fn();
  await Promise.resolve();assert.equal(h.ctx.window.__rewardActionBusy,true);assert.equal(h.calls.length,0);
  assert.equal(h.elements.energyBoostAction.textContent,'Opening advert…');
  h.missions[0].status='claimable';h.missions[0].attempt_id=attemptId;finish();await running;
  assert.equal(h.ctx.window.__rewardActionBusy,false);assert.equal(h.calls.filter(x=>x[0]==='/api/mission/complete').length,1);
});

test('refill copy follows the assigned two- or five-minute policy and current capacity',()=>{
 for(const seconds of [120,300]){
  const h=setup();h.ctx.maxEnergy=55;delete h.missions[0].cooldown_seconds;delete h.missions[0].cooldown_hours;
  h.missions[0].refill_policy={cooldown_seconds:seconds,offer_threshold_pct:30,prepare_threshold_pct:40};
  const view=h.ctx.getBoostView('sp_emergency_energy',h.missions[0]);
  assert.equal(view.detail,`Refill to 55 energy · Every ${seconds/60} minutes`);assert.doesNotMatch(view.detail,/\+50/);
 }
});
test('Rewards keeps a single refill panel through preparation, ready and expiry',()=>{
 const h=setup({energy:22});h.ctx.maxEnergy=55;h.ctx.preparedRefillFor=()=>null;
 h.ctx.refillPreparation={status:'loading',owner:101,offerVisible:false};
 const card=()=>h.elements['[data-boost-code="sp_emergency_energy"]'];
 h.ctx.renderBoostCards();assert.equal(card().hidden,false);assert.equal(h.elements.rewardsCollectionCard.hidden,true);
 h.ctx.state.energy=16;h.ctx.renderBoostCards();assert.equal(card().hidden,false);assert.equal(h.ctx.refillPreparation.offerVisible,true);
 h.ctx.state.energy=17;h.ctx.renderBoostCards();assert.equal(card().hidden,false);
 h.ctx.state.energy=23;h.ctx.refillPreparation.status='ready';h.ctx.preparedRefillFor=()=>({attemptId});h.ctx.renderBoostCards();assert.equal(card().hidden,false);
 h.ctx.refillPreparation.status='expired';h.ctx.preparedRefillFor=()=>null;h.ctx.renderBoostCards();assert.equal(card().hidden,false);
});
