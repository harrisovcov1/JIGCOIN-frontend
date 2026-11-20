'use strict';
// Read-only JIGCOIN Home QA. Run: node recovery/test-home-final-five.cjs
// No Telegram, database, advert, payment, account or network writes.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/home-final-five.css'),'utf8');
const mint=fs.readFileSync(path.join(root,'assets/mint-world.css'),'utf8');
const home=fs.readFileSync(path.join(root,'assets/home-option5.css'),'utf8');
let passed=0;
function test(name,fn){fn();passed++;process.stdout.write('PASS '+name+'\n');}
function segment(start,end){const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);}
test('Every inline JavaScript block parses',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
 assert.ok(scripts.length>=4);for(const script of scripts)new vm.Script(script);
});
const pure=vm.runInNewContext('(function(){'+segment('const HOME_TIERS = Object.freeze(','const rankConfig =')+
 segment('function homeTierIndex(','function advanceHomeMilestone(')+
 ';return {HOME_TIERS,homeTierIndex,homeGoalModel};})()');
test('All eight rank boundaries',()=>{
 const targets=[0,10000,50000,150000,500000,1500000,5000000,10000000];
 targets.forEach((n,i)=>{assert.equal(pure.homeTierIndex(n),i);
   if(i)assert.equal(pure.homeTierIndex(n-1),i-1);});
});
test('Displayed next rank uses accurate Grinder/Operator thresholds',()=>{
 const g=pure.homeGoalModel(21904);assert.equal(g.nextName,'Operator');
 assert.equal(g.remaining,28096);assert.ok(Math.abs(g.progress-.2976)<1e-10);
 assert.equal(pure.homeGoalModel(10000000).complete,true);
});
test('All rank artwork exists and each skin has a fascia and chamber',()=>{
 const art=['recruit-copper.webp','foundry-gold.webp','aurora-glass.webp',
 'commander-jade.webp','general-amethyst.webp','elite-onyx.webp',
 'champion-garnet.webp','legend-platinum.webp'];
 art.forEach((file,i)=>{
   assert.ok(fs.existsSync(path.join(root,'assets',file)));
   assert.ok(fs.existsSync(path.join(root,'assets/fascias','rank-'+i+'.webp')));
   const chamber=i===1?'assets/mint-press.webp':'assets/chambers/rank-'+i+'.webp';
   assert.ok(fs.existsSync(path.join(root,chamber)));
   assert.ok(mint.includes('data-mint-rank="'+i+'"'));
 });
});
test('Rank skin updates without carrying the previous account skin',()=>{
 const rootEl={dataset:{}},memory=new Map();
 const bridge={initDataUnsafe:{user:{id:42}},
   setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}};
 const doc={documentElement:rootEl},win={Telegram:{WebApp:bridge}};
 const appStorage={getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val)};
 const sync=vm.runInNewContext('(function(){let mintWorldOwner,mintWorldRank,mintWorldBridge;'+
   segment('function syncMintWorld(','function initializeTelegram(')+
   ';return syncMintWorld;})()',{document:doc,window:win,appStorage,
     getComputedStyle:()=>({getPropertyValue:()=> '#171b20'})});
 for(let i=0;i<8;i++){sync(i);assert.equal(rootEl.dataset.mintRank,String(i));}
 bridge.initDataUnsafe.user.id=43;sync(null);assert.equal(rootEl.dataset.mintRank,undefined);
 sync(2);assert.equal(rootEl.dataset.mintRank,'2');
});
test('Confirmed-only progress bar, correct Today units and VIP route',()=>{
 assert.ok(html.includes("const confirmedGoal=homeGoalModel(accountIsReady()?homeConfirmedBalance:null);"));
 assert.ok(html.includes('id="homeNextProgress"'));
 assert.ok(html.includes('Today coins'));
 assert.ok(html.includes('Tap coins earned today (UTC)'));
 assert.ok(html.includes("document.getElementById('homeRateVipShop').addEventListener('click',()=>openVipOffer('shop'));"));
 assert.ok(html.includes("document.getElementById('homeRace').addEventListener('click',openHomeRivals);"));
 assert.ok(html.includes("document.getElementById('homeBoostAction').addEventListener('click',"));
});
test('Home geometry, rank skins and advert settings untouched',()=>{
 assert.ok(home.includes('Option 5 final fidelity V3'));
 assert.ok(css.includes('#homeNextPreview>span:last-child .home-next-progress'));
 assert.ok(!css.includes('#boostSheet'));
 assert.ok(html.includes('v20-home-final-five-1'));
});
process.stdout.write('PASS '+passed+' Home contract groups\n');
