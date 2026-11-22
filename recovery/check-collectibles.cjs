'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),code=html.slice(html.indexOf('const HOME_TIERS ='),html.indexOf('const state ='))+html.slice(html.indexOf('let coinArtworkSerial='),html.indexOf("document.getElementById('homeNextPreview').addEventListener"));
function setup(){const els=new Map(),store=new Map(),calls=[];let time=1000;
 const node=id=>{if(!els.has(id))els.set(id,{dataset:{},classList:{contains:()=>true,remove(){}},inert:false,style:{},setAttribute(){},replaceChildren(){},append(){}});return els.get(id);};
 const ctx={boostSheet:{classList:{contains:()=>false}},Date,Math,Number,String,performance:{now:()=>time},window:{},navigator:{onLine:true},document:{hidden:false,getElementById:node,querySelectorAll:()=>[],createElement:()=>({dataset:{},append(){}})},accountIsReady:()=>true,homeUserId:()=>10001,homeIdentity:10001,syncMintWorld(){},homeConfirmedBalance:12000,homeGoalModel:()=>({tier:1}),homeRaceModel:()=>null,formatNumber:String,msToCountdown:String,appStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},updateBoostHub(){},refreshBalance:async()=>calls.push('balance'),showToast:t=>calls.push(t),apiPost:async(p,b)=>{calls.push([p,b]);return ctx.response;}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,calls,els,store,setTime:t=>time=t};
}
const fixture=()=>({ok:true,telegram_id:10001,server_now:'2026-11-16T12:00:00Z',daily:{day:'2026-11-16',progress:100,target:100,reward:50,eligible:true,claimed:false,resets_at:'2026-11-17T00:00:00Z'},event:{key:'launch-edition-1',owned:false,eligible:false,status:'upcoming',target:250,progress:0}});
test('all inline scripts parse and each saved rank uses a distinct bundled WebP',()=>{
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
 const {ctx}=setup();
 const artwork=new Set();
 for(let tier=0;tier<8;tier++){
  const markup=ctx.coinArtwork(tier);
  const path=markup.match(/src="(\.\/assets\/[a-z-]+\.webp)"/)?.[1];
  assert.ok(path,'Missing rank image for tier '+tier);
  const asset=fs.readFileSync(path);
  assert.equal(asset.toString('ascii',0,4),'RIFF');
  assert.equal(asset.toString('ascii',8,12),'WEBP');
  artwork.add(require('node:crypto').createHash('sha256').update(asset).digest('hex'));
  assert.doesNotMatch(markup,/<script|https?:|onload/i);
 }
 assert.equal(artwork.size,8);
 assert.match(ctx.coinArtwork(1,true),/LAUNCH EDITION/);
 assert.match(ctx.coinArtwork(1,'vip'),/midnight-crown\.webp/);
});
test('a saved local skin preference cannot equip an unowned collectible or another account skin',()=>{const {ctx,store}=setup();store.set('jigcoin_launch_skin:10001','on');assert.equal(ctx.launchEquipped(),false);ctx.response=fixture();vm.runInContext('progressionState=response;',ctx);assert.equal(ctx.launchEquipped(),false);ctx.response.event.owned=true;assert.equal(ctx.launchEquipped(),true);ctx.homeUserId=()=>10002;assert.equal(ctx.launchEquipped(),false);assert.equal(ctx.progressionCurrent(),null);});
test('initial status loads immediately without needing a fifteen-second wait',async()=>{const {ctx,calls}=setup();ctx.response=fixture();await ctx.refreshProgression();assert.equal(calls[0][0],'/api/progression');assert.equal(ctx.progressionCurrent().daily.progress,100);});
test('failed refresh never shifts the authoritative countdown backwards',async()=>{const {ctx,setTime}=setup();ctx.response=fixture();await ctx.refreshProgression(true);const initial=ctx.progressionNow();setTime(11000);ctx.apiPost=async()=>{throw Error('offline');};await ctx.refreshProgression(true);assert.equal(ctx.progressionNow(),initial+10000);});
test('pending refresh for a previous identity cannot replace current progress',async()=>{const {ctx}=setup();let finish;ctx.apiPost=()=>new Promise(r=>finish=r);const p=ctx.refreshProgression(true);ctx.homeUserId=()=>10002;finish(fixture());await p;assert.equal(ctx.progressionCurrent(),null);});
test('failed claim does not equip a collectible or change any balance locally',async()=>{const {ctx,store,calls}=setup();ctx.response=fixture();ctx.response.event.eligible=true;vm.runInContext('progressionState=response;',ctx);ctx.apiPost=async()=>({ok:false,error:'CHALLENGE_NOT_READY'});await ctx.claimProgression('launch');assert.equal(store.size,0);assert.ok(!calls.includes('balance'));});
test('daily claim sends only server day and kind; duplicate presses do not duplicate the request',async()=>{const {ctx,calls}=setup();ctx.response=fixture();vm.runInContext('progressionState=response;progressionClock=Date.parse(response.server_now);progressionSnapshotAt=performance.now();',ctx);let finish;ctx.apiPost=async(p,b)=>{calls.push([p,b]);if(p.endsWith('/claim'))return new Promise(r=>finish=r);return ctx.response;};const action=ctx.claimProgression('daily');await ctx.claimProgression('daily');assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),['/api/progression/claim',{kind:'daily',period:'2026-11-16'}]);finish({...fixture(),reward:50,daily:{...fixture().daily,claimed:true,eligible:false}});await action;assert.ok(calls.includes('balance'));});
test('event preview has no invented closing time before activation',()=>{const {ctx,els}=setup();ctx.response=fixture();vm.runInContext('progressionState=response;',ctx);ctx.renderProgression();assert.equal(els.get('launchQuestStatus').textContent,'Event not started');assert.equal(els.get('launchQuestAction').disabled,true);});
test('an expired earning window disables new collecting even before the next status poll',()=>{const {ctx,els}=setup();ctx.response=fixture();ctx.response.event={...ctx.response.event,status:'live',starts_at:'2000-01-01T00:00:00Z',ends_at:'2000-01-08T00:00:00Z',progress:249};vm.runInContext('progressionState=response;',ctx);ctx.renderProgression();assert.equal(els.get('launchQuestStatus').textContent,'Earning window closed');assert.equal(els.get('launchQuestAction').disabled,true);});

test('the Rewards tile reflects eligibility, one pending claim, collection, day rollover and failed refresh',async()=>{
 const {ctx,els,setTime}=setup();
 ctx.response=fixture();
 await ctx.refreshProgression(true);
 const button=els.get('pilotDailyChallenge'), label=els.get('pilotChallengeAction');
 assert.equal(label.textContent,'Claim 50 coins');
 assert.equal(button.disabled,false);
 ctx.response.daily.eligible=false;
 ctx.renderProgression();
 assert.equal(ctx.rewardsChallengeView(ctx.response.daily).action,'play');
 ctx.response.daily.eligible=true;
 ctx.response.daily.claimed=true;
 ctx.renderProgression();
 assert.equal(label.textContent,'Collected ✓');
 assert.equal(button.disabled,true);
 vm.runInContext('progressionClaimBusy=true',ctx);
 ctx.renderProgression();
 assert.equal(button.disabled,true);
 assert.equal(label.textContent,'Saving…');
 vm.runInContext('progressionClaimBusy=false',ctx);
 setTime(86401000);ctx.renderProgression();
 assert.equal(label.textContent,'Check progress ›');
 assert.equal(els.get('pilotChallengeMeter').hidden,true);
 assert.equal(els.get('pilotDailyProgress').textContent,'Reach 100 taps today');
 ctx.apiPost=async()=>({ok:false});
 await ctx.refreshProgression(true);
 assert.equal(button.dataset.state,'retry');
 ctx.navigator.onLine=false;
 ctx.renderProgression();
 assert.equal(button.disabled,true);
 assert.equal(label.textContent,'Connect to check');
});

test('a read begun before the direct reward claim cannot restore an already collected offer',async()=>{
 const {ctx,els,calls}=setup();
 const ready=fixture(), collected={...ready,daily:{...ready.daily,eligible:false,claimed:true}};
 ctx.response=ready;await ctx.refreshProgression(true);
 let finishOldRead,reads=0;
 ctx.apiPost=async(path,body)=>{
   calls.push([path,body]);
   if(path==='/api/progression/claim')return {...collected,reward:50};
   if(++reads===1)return new Promise(resolve=>{finishOldRead=resolve;});
   return collected;
 };
 const oldRead=ctx.refreshProgression(true);
 await ctx.claimProgression('daily');
 finishOldRead(ready);await oldRead;
 assert.equal(els.get('pilotChallengeAction').textContent,'Collected ✓');
 assert.equal(els.get('pilotDailyChallenge').disabled,true);
});
