'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const models=section('const HOME_TIERS =','const state =')+section('const HOME_SEASON_KEY','// End of pure Home models.')+section('function dailyBenefitPreview(','function renderRestoreOption(')+section('function rewardRecommendation(','function updateRewardRecommendation(');
function modelContext(){const c={URL};vm.createContext(c);vm.runInContext(models,c);return c;}
const coin='sp_visit_partner',refill='sp_emergency_energy',double='sp_double_points';
const view=(code,action='start',disabled=false)=>({code,view:{action,disabled}});
const all=()=>[view(coin),view(refill),view(double)];
test('an already confirmed reward takes priority over new ads and the free daily claim',()=>{
 const c=modelContext();const rows=all();rows[1]=view(refill,'claim');assert.equal(c.rewardRecommendation(rows,{dailyReady:true,energy:2}),refill);
});
test('free daily claim takes priority over available adverts',()=>{
 assert.equal(modelContext().rewardRecommendation(all(),{dailyReady:true,energy:50}),'daily');
});
test('only low energy highlights a new refill and leaves the input order intact',()=>{
 const c=modelContext(),rows=all(),before=JSON.stringify(rows);
 assert.equal(c.rewardRecommendation(rows,{energy:10,cap:50}),refill);
 assert.equal(c.rewardRecommendation(rows,{energy:11,cap:50}),null);
 assert.equal(c.rewardRecommendation(rows,{energy:15,cap:100}),refill);
 assert.equal(JSON.stringify(rows),before);
});
test('an unavailable refill keeps free play open without recommending retired coin ads',()=>{
 const c=modelContext();assert.equal(c.rewardRecommendation([view(coin),view(refill,'none',true),view(double,'play')],{energy:0}),null);
 assert.equal(c.rewardRecommendation([view(coin),view(refill,'none',true),view(double,'play')],{energy:50}),null);
});
test('busy or unavailable choices never receive a recommendation',()=>{
 const c=modelContext();assert.equal(c.rewardRecommendation(all(),{dailyReady:true,busy:true}),null);
 assert.equal(c.rewardRecommendation(all().map(v=>view(v.code,'none',true))),null);
});
test('streak preview picks the nearest perk and prefers a permanent cosmetic on the same day',()=>{
 const c=modelContext(),daily={days:1,broken:false,cosmetics:[{days:7,name:'Momentum aura',owned:false}],next_tier:{day:3,tap_bonus_percent:5}};
 assert.equal(c.dailyBenefitPreview(daily),'Day 3: +5% tap coins');
 daily.days=6;daily.next_tier={day:7,tap_bonus_percent:10};assert.equal(c.dailyBenefitPreview(daily),'Day 7: Momentum aura');
});
test('owned, past and broken streak perks cannot be advertised as the next unlock',()=>{
 const c=modelContext();assert.equal(c.dailyBenefitPreview({days:300,cosmetics:[{days:7,name:'Aura',owned:true}],tier:{tap_bonus_percent:40}}),'+40% tap coins active');
 assert.equal(c.dailyBenefitPreview({days:30,broken:true,cosmetics:[{days:30,name:'Frame',owned:false}]}),'');
 assert.equal(c.dailyBenefitPreview(null),'');
});
test('rank share includes only a confirmed milestone, in-game wording and the real invitation URL',()=>{
 const p=modelContext().homeRankShareModel(50000,123,123,50000,'https://t.me/JIGCOINBOT?startapp=ref_123');
 assert.match(p.text,/Operator/);assert.match(p.text,/50,000 in-game coins/);assert.doesNotMatch(p.text,/cash|airdrop|guaranteed/i);assert.equal(p.url,'https://t.me/JIGCOINBOT?startapp=ref_123');
});
test('rank share rejects stale identity, refunded or invalid balance, unrecognised rank and foreign URL',()=>{
 const c=modelContext(),url='https://t.me/JIGCOINBOT';
 for(const args of [[50000,123,124,50000,url],[50000,123,123,49999,url],[50000,123,123,NaN,url],[13000,123,123,50000,url],[0,123,123,50000,url],[50000,0,0,50000,url],[50000,123,123,50000,'javascript:alert(1)'],[50000,123,123,50000,'https://t.me.evil.test/JIGCOINBOT'],[50000,123,123,50000,'https://t.me/anotherbot']])assert.equal(c.homeRankShareModel(...args),null);
});
function celebration(){
 const nodes=new Map(),calls=[],timers=[];
 const node=tag=>({tag,hidden:true,children:[],handlers:{},textContent:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(n,v){this[n]=v;},addEventListener(n,fn){this.handlers[n]=fn;},click(){this.handlers.click?.();},contains:()=>false,matches:()=>false,focus(){calls.push('focus');}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
 const c={URL,window:{Telegram:{WebApp:{openTelegramLink:u=>calls.push(u)}}},state:{inviteLink:'https://t.me/JIGCOINBOT?startapp=ref_123'},homeConfirmedBalance:50000,homeCelebrationTimer:null,homeUserId:()=>123,accountIsReady:()=>true,formatNumber:n=>n.toLocaleString('en-GB'),appStorage:{getItem:()=> 'off'},showToast:t=>calls.push(t),clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;},document:{activeElement:null,getElementById:get,createElement:node,createTextNode:text=>({textContent:text})}};
 vm.createContext(c);vm.runInContext(models+section('function scheduleRankCelebrationDismiss(','function observeHomeRace('),c);return {c,get,calls,timers};
}
test('celebration shares only after the player explicitly presses its share button',()=>{
 const {c,get,calls}=celebration();c.showHomeCelebration(50000);assert.equal(calls.length,0);
 const share=get('homeCelebration').children.find(n=>n.className==='rank-share-action');assert.equal(share.textContent,'Share your new rank');share.click();
 assert.equal(calls.length,1);const u=new URL(calls[0]);assert.equal(u.origin,'https://t.me');assert.equal(u.pathname,'/share/url');assert.match(u.searchParams.get('text'),/Operator/);
});
test('share button rechecks identity and confirmed balance when clicked',()=>{
 const {c,get,calls}=celebration();c.showHomeCelebration(50000);const share=get('homeCelebration').children.find(n=>n.className==='rank-share-action');
 c.homeConfirmedBalance=49999;share.click();assert.match(calls.pop(),/Refresh your saved rank/);
 c.homeConfirmedBalance=50000;c.homeUserId=()=>124;share.click();assert.match(calls.pop(),/Refresh your saved rank/);assert.equal(calls.length,0);
});
test('rank celebration stays available while keyboard focus is inside it and supports dismissal',()=>{
 const {c,get,calls,timers}=celebration();c.showHomeCelebration(50000);const el=get('homeCelebration');el.contains=()=>true;timers.at(-1)();assert.equal(el.hidden,false);
 el.contains=()=>false;el.onfocusout();timers.at(-1)();assert.equal(el.hidden,true);
 c.showHomeCelebration(50000);el.children.find(n=>n.className==='rank-celebration-close').click();assert.equal(el.hidden,true);assert.deepEqual(calls,['focus']);
});
test('next coin names match the ladder and public/test tap labels remain explicitly separated',()=>{
 const c=modelContext();assert.equal(c.homeCoinUnlock(2),'silver coin');assert.equal(c.homeCoinUnlock(7),'Legend coin');
 assert.match(html,/recovery_test\s*\?\s*"Test tap"\s*:\s*"Tap"/);
 assert.match(html,/label:'Back to tapping',detail:Number.isFinite\(until\)/);
});

test('long streaks preview the next repeating reward while retaining closer cosmetic milestones',()=>{
 const c=modelContext(),d={days:300,policy:{milestoneEvery:100},next_milestone:{day:400,reward:4000},cosmetics:[],tier:{tap_bonus_percent:40}};
 assert.equal(c.dailyBenefitPreview(d),'Day 400: 4,000 coins');
 d.days=99;d.next_milestone.day=100;d.cosmetics=[{days:100,name:'Century crest',owned:false}];
 assert.equal(c.dailyBenefitPreview(d),'Day 100: Century crest');d.broken=true;assert.equal(c.dailyBenefitPreview(d),'');
});
