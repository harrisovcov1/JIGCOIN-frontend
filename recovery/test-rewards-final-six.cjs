'use strict';
// Read-only Rewards regression checks. Run locally: node recovery/test-rewards-final-six.cjs
// No provider calls, purchases, database connections or saved player mutations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/rewards-final-six.css'),'utf8');
let passed=0;
function check(name,fn){fn();passed++;process.stdout.write('PASS '+name+'\n');}
function segment(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
check('Every inline script parses',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
 assert.ok(scripts.length>=4);for(const script of scripts)new vm.Script(script);
});
check('Single primary action hierarchy',()=>{
 const primary=vm.runInNewContext('(function(){'+segment('function chooseRewardsPrimaryAction(','function updateRewardsVisualPriority(')+';return chooseRewardsPrimaryAction;})()');
 assert.equal(primary({refillClaimable:true,dailyReady:true}),'refill');
 assert.equal(primary({dailyReady:true,challengeReady:true,refillReady:true}),'daily');
 assert.equal(primary({challengeReady:true,refillReady:true}),'challenge');
 assert.equal(primary({refillReady:true}),'refill');
 assert.equal(primary({}),'return');
});
check('Challenge uses real state rather than fictitious coins',()=>{
 assert.ok(html.includes('remaining=Number(daily.target)-Number(daily.progress)'));
 assert.ok(html.includes("if (daily.claimed) return {state:'collected', label:'Collected ✓'}"));
 assert.ok(html.includes("if (daily.eligible) return {state:'ready', action:'claim'"));
});
check('Energy and VIP are verified live outputs',()=>{
 assert.ok(html.includes('id="energyBoostMeter"'));
 assert.ok(html.includes("meter.textContent=safe?"));
 assert.ok(html.includes("vipAvailable && vaultPending()"));
 assert.ok(html.includes('2× tap coins + 2× energy'));
 assert.ok(html.includes("openVipOffer('shop')"));
});
check('Race shows only identity-verified attempts',()=>{
 assert.ok(html.includes("apiPost('/api/weekly/standings',{scope:'global'}"));
 assert.ok(html.includes('String(response.telegram_id)===String(owner)'));
 assert.ok(html.includes("Number.isSafeInteger(left)"));
 assert.ok(html.includes('id="rewardsWeeklyStatus"'));
});
check('All Rewards states are styled without touching Home',()=>{
 assert.ok(css.includes('#rewardsDailyCard[data-claimed="true"]'));
 for(const p of ['daily','challenge','refill','return'])assert.ok(css.includes('data-priority="'+p+'"'));
 assert.ok(css.includes('#pilotDailyChallenge[data-state="collected"]'));
 assert.ok(css.includes('#rewardsTelegramReminder:not([hidden])'));
 assert.ok(!css.includes('#mainScroll'));
});
process.stdout.write('PASS '+passed+' Rewards contract groups\n');
