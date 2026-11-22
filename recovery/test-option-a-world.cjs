'use strict';
// Read-only UI contract checks. Run with: node recovery/test-option-a-world.cjs
// No credentials, browser traffic, purchases, ad requests or production writes.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/option-a-world.css'),'utf8');
const rank=fs.readFileSync(path.join(root,'assets/mint-world.css'),'utf8');
const home=fs.readFileSync(path.join(root,'assets/home-option5.css'),'utf8');
let passed=0;
function check(name,fn){fn();passed++;process.stdout.write('PASS '+name+'\n');}
check('All inline JavaScript parses',()=>{
  const scripts=[...index.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
  assert.ok(scripts.length>=4);
  for(const script of scripts)new vm.Script(script);
});
check('Eight complete rank themes and Option A atmosphere',()=>{
  for(let rankIndex=0;rankIndex<8;rankIndex++){
    const token='html[data-mint-rank="'+rankIndex+'"]';
    assert.ok(rank.includes(token));
    assert.ok(css.includes(token));
  }
  assert.ok(home.includes('Option 5 final fidelity V3'));
});
check('No fake ad ready label',()=>{
  assert.ok(!/ad ready now|ad available now/i.test(css.replace(/\/\*[\s\S]*?\*\//g,"")));
  assert.ok(index.includes("type:'preload'")&&index.includes("type:'end'"));
});
check('All major screens preserve real IDs',()=>{
  for(const id of ['boostSheet','coinShopSheet','friendsSheet','withdrawSheet',
   'vipOfferSheet','homeDailySheet','homeQuestSheet','inviteDetailsSheet',
   'homeJourneySheet','vaultDetailsSheet','energyBoostAction','rewardsDailyAction',
   'coinPackList','shopVipPass','tapBtn','homeBoostAction','homeGoal']){
    assert.ok(index.includes('id="'+id+'"'),id);
  }
});
check('Frontend threshold matches server and cooldown is respected',()=>{
  const begin=index.indexOf('function homeEnergyLow(');
  const end=index.indexOf('function homeCoinUnlock(',begin);
  assert.ok(begin>=0&&end>begin);
  const code=index.slice(begin,end);
  const policy=vm.runInNewContext('(function(){'+code+';return {homeRefillPolicy,homeRefillCanPrepare};})()');
  const mission={provider:'monetag',status:'available',prepare_available:true,
    refill_policy:{prepare_threshold_pct:100,offer_threshold_pct:30,ready_ttl_ms:300000,retry_seconds:0}};
  const p=policy.homeRefillPolicy(mission);
  assert.equal(p.prepare_threshold_pct,100);
  assert.equal(p.ready_ttl_ms,300000);
  assert.equal(p.retry_seconds,0);
  assert.equal(policy.homeRefillCanPrepare(mission,54,55),true);
  assert.equal(policy.homeRefillCanPrepare(mission,55,55),false);
});
check('Provider failure retry and authorization safeguards retained',()=>{
  assert.ok(index.includes('scheduleRefillAutoRetry(18000)'));
  assert.ok(index.includes('await refreshBoostMissions(manual);'));
  assert.ok(index.includes('invalidateRefillPreparation(true)'));
  assert.ok(index.includes("apiPost('/api/mission/complete'"));
});
check('Option A applied to main tabs and existing details',()=>{
  for(const id of ['boostSheet','coinShopSheet','friendsSheet','withdrawSheet',
     'weeklySheet','vipOfferSheet','homeJourneySheet','leaderboardScreen',
     'homeDailySheet','homeQuestSheet','vaultDetailsSheet','inviteDetailsSheet'])
    assert.ok(css.includes('#'+id),id);
  assert.ok(index.includes('option-a-world.css?v=20261120-1'));
});
process.stdout.write('PASS '+passed+' visual and refill contract groups\n');
