'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('// Invite v10: account-scoped'),html.indexOf('// End Invite v10 data and actions.'));
const tiers=[{at:1,through:4,name:'Bronze',reward_coins:500},{at:5,through:19,name:'Silver',reward_coins:1000},{at:20,through:49,name:'Gold',reward_coins:1250},{at:50,through:199,name:'Platinum',reward_coins:1500},{at:200,through:null,name:'Diamond',reward_coins:2000}];
const fixture=(id=10001,count=0)=>{
 const row=tiers.find(r=>count>=r.at&&(r.through===null||count<=r.through));
 const next=tiers.find(r=>r.at>count),rate=tiers.find(r=>count+1>=r.at&&(r.through===null||count+1<=r.through));
 return{ok:true,telegram_id:String(id),server_now:new Date().toISOString(),invite_link:`https://t.me/JIGCOINBOT?startapp=ref_${id}`,policy_version:'referrals_welcome_v10',welcome_coins:1000,reward_coins:rate.reward_coins,friends_rewarded:count,coins_earned:0,tier_name:row?.name??'Get started',next_at:next?.at??null,previous_at:row?.at??0,next_reward_coins:next?.reward_coins??null,next_tier_name:next?.name??null,qualification:{mode:'join',min_taps:null},tiers};
};
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
function setup(){
  const nodes=new Map(),calls=[],shared=[],copied=[],toasts=[],storage=new Map();let owner=10001,ready=true,now=Date.now(),response=async()=>fixture(owner);
  const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,disabled:false,attrs:{},style:{},listeners:{},focus(){this.focused=true;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.listeners[k]=f;}});return nodes.get(id);};
  class Clock extends Date{static now(){return now;}}
  const c={setCoinArtwork(){},Date:Clock,URL,console,homeUserId:()=>owner,accountIsReady:()=>ready,document:{getElementById:el},formatNumber:n=>n.toLocaleString('en-GB'),escapeHtml:s=>String(s).replaceAll('<','&lt;'),appStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},backToHome(){},openLeaderboard:mode=>calls.push({action:'leaderboard',mode}),
    friendsJoinedText:el('friendsJoinedText'),referralPointsText:el('referralPointsText'),inviteLinkText:el('inviteLinkText'),shareTelegramBtn:el('shareTelegramBtn'),copyInviteBtn:el('copyInviteBtn'),copyShareTextBtn:el('copyShareTextBtn'),downloadShareCardBtn:el('downloadShareCardBtn'),
    window:{Telegram:{WebApp:{openTelegramLink:url=>shared.push(url)}},open:url=>{shared.push(url);return {}; }},navigator:{clipboard:{writeText:async value=>copied.push(value)}},showToast:text=>toasts.push(text),
    showAppSheet:(sheet,tab)=>{c.opened={sheet,tab};},tabFriends:'Invite',apiPost:async(...args)=>{if(args[0]==='/api/invite/interaction')return {ok:true};calls.push(args);return response(...args);}};
  vm.createContext(c);vm.runInContext(code,c);
  return{c,el,calls,shared,copied,toasts,storage,respond:fn=>response=fn,owner:value=>owner=value,ready:value=>ready=value,advance:ms=>now+=ms};
}
test('all inline scripts parse; HTML has no duplicate IDs',()=>{
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});
test('one first-open request is shared; confirmed data and link are reused within cache window',async()=>{
  const x=setup(),d=deferred();x.respond(()=>d.promise);const a=x.c.loadInviteSummary(),b=x.c.loadInviteSummary();
  assert.equal(x.calls.length,1);assert.equal(x.el('shareTelegramBtn').disabled,true);assert.equal(x.el('friendsJoinedText').textContent,'—');
  d.resolve(fixture());await Promise.all([a,b]);assert.equal(x.el('inviteRewardAmount').textContent,'500');assert.equal(x.el('shareTelegramBtn').disabled,false);await x.c.loadInviteSummary();assert.equal(x.calls.length,1);
  assert.equal(x.calls[0][2].timeoutMs,8000);assert.equal(x.calls[0][2].fastAuth,true);
});
test('failed first load shows a usable retry and never presents a fabricated zero/reward/link',async()=>{
  const x=setup();x.respond(async()=>({ok:false,reason:'TIMEOUT'}));await x.c.loadInviteSummary();assert.equal(x.el('inviteLoadStatus').hidden,false);assert.equal(x.el('inviteRetry').disabled,false);assert.equal(x.el('inviteRewardAmount').textContent,'Invite rewards');
  x.c.shareInviteOnTelegram();await x.c.copyInviteLink();assert.equal(x.shared.length,0);assert.equal(x.copied.length,0);
  x.respond(async()=>fixture());await x.c.loadInviteSummary({force:true});assert.equal(x.el('inviteLoadStatus').hidden,true);assert.equal(x.el('shareTelegramBtn').disabled,false);
});
test('a failed refresh keeps same-account confirmed figures with an honest stale notice',async()=>{
  const x=setup();await x.c.loadInviteSummary();x.advance(31000);x.respond(async()=>{throw Error('offline');});await x.c.loadInviteSummary();assert.equal(x.el('inviteRewardAmount').textContent,'500');assert.equal(x.el('inviteLoadStatus').hidden,false);assert.match(x.el('inviteStatusText').textContent,/last checked/);
});
test('late responses from the previous account cannot replace current-account data or links',async()=>{
  const x=setup(),d=deferred();x.respond(()=>d.promise);const pending=x.c.loadInviteSummary();x.owner(10002);x.respond(async()=>fixture(10002,19));await x.c.loadInviteSummary();d.resolve(fixture());await pending;
  assert.equal(x.el('inviteRewardAmount').textContent,'1,250');await x.c.copyInviteLink();assert.match(x.copied[0],/ref_10002$/);
});
test('sign-out masks cached balances and disables all sharing, including late clicks',async()=>{
  const x=setup();await x.c.loadInviteSummary();x.ready(false);x.c.renderInviteOverview();x.c.shareInviteOnTelegram();await x.c.copyInviteLink();assert.equal(x.shared.length,0);assert.equal(x.copied.length,0);assert.equal(x.el('friendsJoinedText').textContent,'—');assert.equal(x.el('downloadShareCardBtn').disabled,true);
});
test('foreign account, unsafe links and malformed amounts never enable sharing',async()=>{
  for(const data of [fixture(10002),{...fixture(),invite_link:'javascript:alert(1)'},{...fixture(),invite_link:'https://evil.test/?startapp=ref_10001'},{...fixture(),invite_link:'https://t.me/JIGCOINBOT?startapp=ref_10002'},{...fixture(),reward_coins:NaN},{...fixture(),next_at:0},{...fixture(),tiers:null}]){
    const x=setup();x.respond(async()=>data);await x.c.loadInviteSummary();assert.equal(x.el('shareTelegramBtn').disabled,true);assert.equal(x.el('inviteLoadStatus').hidden,false);
  }
});
test('qualification displays the real activity threshold and both valid earning paths',async()=>{
  const x=setup();x.respond(async()=>({...fixture(),qualification:{mode:'activity',min_taps:250}}));await x.c.loadInviteSummary();assert.match(x.el('inviteQualification').textContent,/250 taps in one UTC day/);assert.match(x.el('inviteQualification').textContent,/or claims one confirmed ad reward/);assert.doesNotMatch(x.el('inviteQualification').textContent,/purchase|pay/);
});
test('next milestone is explicit and max tier has no impossible extra target',async()=>{
  const x=setup();await x.c.loadInviteSummary();assert.equal(x.el('inviteNextBadge').textContent,'Your next successful invite');assert.equal(x.el('inviteNextTitle').textContent,'1 more to Bronze inviter');assert.equal(x.el('inviteRewardAmount').textContent,'500');assert.equal(x.el('inviteProgress').max,1);
  x.respond(async()=>fixture(10001,200));await x.c.loadInviteSummary({force:true});assert.equal(x.el('inviteProgress').value,1);assert.match(x.el('inviteNextTitle').textContent,/Top inviter level/);assert.doesNotMatch(x.el('inviteNextText').textContent,/more/);
});
test('Telegram sharing opens an editable share chooser with a correctly encoded account link',async()=>{
  const x=setup();await x.c.loadInviteSummary();x.c.shareInviteOnTelegram();const url=new URL(x.shared[0]);assert.equal(url.pathname,'/share/url');assert.equal(url.searchParams.get('url'),fixture().invite_link);assert.match(url.searchParams.get('text'),/daily rewards/);assert.doesNotMatch(url.searchParams.get('text'),/airdrop|guarantee|cash/i);await x.c.copyInviteLink();assert.equal(x.copied[0],fixture().invite_link);
});
test('browser fallback and failed sharing/copying leave a clear recovery action',async()=>{
  const x=setup();await x.c.loadInviteSummary();delete x.c.window.Telegram;x.c.shareInviteOnTelegram();assert.equal(x.shared.length,1);x.c.window.open=()=>{throw Error('blocked');};x.c.shareInviteOnTelegram();assert.match(x.toasts.at(-1),/Copy link/);x.c.navigator.clipboard.writeText=async()=>{throw Error('denied');};await x.c.copyInviteLink();assert.match(x.toasts.at(-1),/Invite on Telegram/);
});
test('history is fetched on demand, deduplicated and cached separately from the overview',async()=>{
  const x=setup();await x.c.loadInviteSummary();assert.equal(x.calls.length,1);const d=deferred();x.respond(()=>d.promise);const a=x.c.loadInviteHistory(),b=x.c.loadInviteHistory();await new Promise(r=>setImmediate(r));assert.equal(x.calls.length,2);assert.equal(x.calls[1][0],'/api/invite/history');
  d.resolve({ok:true,telegram_id:'10001',credits:[{id:'12',coins:800,credited_at:null}]});await Promise.all([a,b]);assert.match(x.el('inviteHistoryList').innerHTML,/\+800/);await x.c.loadInviteHistory();assert.equal(x.calls.length,2);
});
test('failed history offers retry and never invents a successful credit',async()=>{
  const x=setup();await x.c.loadInviteSummary();x.respond(async()=>({ok:false}));await x.c.loadInviteHistory();assert.match(x.el('inviteHistoryStatus').textContent,/Refresh to retry/);assert.equal(x.el('inviteHistoryList').innerHTML,'');x.respond(async()=>({ok:true,telegram_id:'10001',credits:[]}));await x.c.loadInviteHistory({force:true});assert.match(x.el('inviteHistoryStatus').textContent,/No recorded referral credits/);
});
test('late old-account history is discarded and no longer rendered',async()=>{
  const x=setup();await x.c.loadInviteSummary();const d=deferred();x.respond(()=>d.promise);const history=x.c.loadInviteHistory();await new Promise(r=>setImmediate(r));x.owner(10002);x.respond(async()=>fixture(10002));await x.c.loadInviteSummary();d.resolve({ok:true,telegram_id:'10001',credits:[{coins:98765,credited_at:null}]});await history;x.c.renderInviteHistory();assert.doesNotMatch(x.el('inviteHistoryList').innerHTML,/98,765/);
});
test('details opens in the Invite tab and focuses its Back control',async()=>{
  const x=setup();await x.c.loadInviteSummary();x.respond(async()=>({ok:true,telegram_id:'10001',credits:[]}));x.c.openInviteDetails();assert.equal(x.c.opened.sheet,x.el('inviteDetailsSheet'));assert.equal(x.c.opened.tab,'Invite');assert.equal(x.el('inviteDetailsClose').focused,true);
});

test('zero invites shows no earned tier or misleading zero-reward milestone',async()=>{
 const x=setup();await x.c.loadInviteSummary();assert.equal(x.el('inviteTierName').textContent,'No level yet');
 assert.match(x.el('inviteTierList').innerHTML,/Bronze · 1–4 invites/);assert.match(x.el('inviteTierList').innerHTML,/200\+ invites/);
 assert.doesNotMatch(x.el('inviteTierList').innerHTML,/Starter|0 rewarded/);
 assert.match(x.el('inviteWelcome').textContent,/Your friend starts with 1,000 free in-game coins/);
 x.c.shareInviteOnTelegram();assert.match(new URL(x.shared[0]).searchParams.get('text'),/New players start with 1,000 free coins/);
});
test('the milestone invite itself shows the higher rate before it joins',async()=>{
 for(const [count,amount] of [[3,500],[4,1000],[18,1000],[19,1250],[48,1250],[49,1500],[198,1500],[199,2000],[200,2000]]){
  const x=setup();x.respond(async()=>fixture(10001,count));await x.c.loadInviteSummary();
  assert.equal(x.el('inviteRewardAmount').textContent,amount.toLocaleString('en-GB'));
  if(count<200){
   const next=tiers.find(row=>row.at>count);
   assert.equal(x.el('inviteNextTitle').textContent,(next.at-count)+' more to '+next.name+' inviter');
   if(next.reward_coins!==amount)assert.match(x.el('inviteNextText').textContent,new RegExp('earns '+next.reward_coins.toLocaleString('en-GB')+' coins'));
  }
 }
});
test('stale policy versions, broken ranges and mismatched next reward are rejected',async()=>{
 for(const data of [{...fixture(),policy_version:'v8'},{...fixture(),welcome_coins:800},{...fixture(),reward_coins:840},{...fixture(),tiers:[...tiers.slice(1)]},{...fixture(),next_tier_name:'Diamond'}]){
  const x=setup();x.respond(async()=>data);await x.c.loadInviteSummary();assert.equal(x.el('shareTelegramBtn').disabled,true);
 }
});

const cumulativeFixture=()=>({...fixture(),policy_version:'referrals_cumulative_v16',qualification:{mode:'cumulative_taps',min_taps:100,period:'lifetime',ad_qualifies:false,purchase_required:false},friends_joined:1,friends_pending:1,friends_qualified:0,friends_on_hold:0,friend_progress:[{id:'r1',display_name:'Player',status:'playing',verified_taps:32,min_taps:100,qualification_mode:'cumulative_taps',policy_version:'referrals_cumulative_v16',joined_at:null,rewarded_at:null,reward_coins:null}]});
test('new invite contract describes cumulative verified activity, general welcome and actual progress',async()=>{
 const x=setup();x.respond(async()=>cumulativeFixture());await x.c.loadInviteSummary();
 assert.match(x.el('inviteQualification').textContent,/100 verified taps in total/);assert.doesNotMatch(x.el('inviteQualification').textContent,/one UTC day|ad reward/);
 assert.match(x.el('inviteWelcome').textContent,/Your friend starts with/);assert.match(x.el('inviteFriendProgress').innerHTML,/32 \/ 100 verified taps in total/);assert.match(x.el('invitePendingSummary').textContent,/1 joined/);assert.equal(x.el('shareTelegramBtn').disabled,false);
});
test('Invite explains historical joined records requiring review without promising credits',async()=>{
 const x=setup(),d=cumulativeFixture();
 d.friends_joined=5;d.friends_pending=0;d.friends_qualified=0;d.friends_on_hold=5;
 d.friend_progress=Array.from({length:5},(_,i)=>({...d.friend_progress[0],
  id:'legacy'+i,status:'on_hold',qualification_mode:'legacy_unknown',
  policy_version:'legacy_unknown',verified_taps:null,min_taps:null,
  rewarded_at:null,reward_coins:null}));
 x.respond(async()=>d);await x.c.loadInviteSummary();
 assert.equal(x.el('inviteJoinedCount').textContent,'5');
 assert.equal(x.el('friendsJoinedText').textContent,'0');
 assert.match(x.el('invitePendingSummary').textContent,/5 joined/);
 assert.match(x.el('invitePendingSummary').textContent,/5 records being checked/);
 assert.doesNotMatch(x.el('invitePendingSummary').textContent,/working towards a reward/);
 assert.match(x.el('inviteFriendProgress').innerHTML,/Historical referral/);
 assert.doesNotMatch(x.el('inviteFriendProgress').innerHTML,/coins credited/);
 assert.equal(x.el('inviteShareCardOpen').disabled,false);
});
test('friend rows retain original qualification and only confirmed rewards show credited coins',async()=>{
 const x=setup(),d=cumulativeFixture();d.friend_progress=[{...d.friend_progress[0],qualification_mode:'daily_taps_or_ad',min_taps:250,display_name:'<img src=x onerror=bad()>'},{...d.friend_progress[0],status:'rewarded',reward_coins:1000}];x.respond(async()=>d);await x.c.loadInviteSummary();
 const rendered=x.el('inviteFriendProgress').innerHTML;assert.match(rendered,/250 taps in one UTC day or a confirmed ad reward/);assert.match(rendered,/1,000 coins credited/);assert.match(rendered,/&lt;img/);assert.doesNotMatch(rendered,/<img src=x/);
});
test('unknown cumulative rules or fabricated friend status fail validation',async()=>{
 for(const mutate of [d=>d.qualification.ad_qualifies=true,d=>d.qualification.min_taps=1,d=>d.friend_progress[0].status='paid_cash',d=>d.friend_progress[0].verified_taps=-1]){
  const x=setup(),d=cumulativeFixture();mutate(d);x.respond(async()=>d);await x.c.loadInviteSummary();assert.equal(x.el('shareTelegramBtn').disabled,true);assert.equal(x.el('inviteLoadStatus').hidden,false);
 }
});

const incoming=()=>({display_name:'River',policy_version:'referrals_cumulative_v16',qualification_mode:'cumulative_taps',verified_taps:12,min_taps:100,status:'playing',joined_at:'2026-11-19T17:00:00Z',rewarded_at:null});
function welcomeDialog(x){const dialog=x.el('inviteWelcomeDialog');dialog.opens=0;dialog.showModal=function(){this.open=true;this.opens++;};dialog.close=function(){this.open=false;this.listeners.close?.();};return dialog;}
test('an invited player sees the actual inviter and cumulative goal, with a separate general welcome',async()=>{
 const x=setup(),dialog=welcomeDialog(x),d={...cumulativeFixture(),incoming_referral:incoming()};x.respond(async()=>d);await x.c.loadInviteSummary();
 assert.equal(x.el('incomingInviteTitle').textContent,'Invited by River');assert.equal(dialog.open,true);assert.match(x.el('incomingInviteWelcome').textContent,/All new players start with 1,000/);assert.match(x.el('incomingInviteRule').textContent,/100 verified taps in total/);assert.match(x.el('incomingInviteRule').textContent,/inviter’s reward/);assert.equal(x.el('incomingInviteTaps').value,12);
 x.el('inviteWelcomePlay').listeners.click();assert.equal(dialog.open,false);await x.c.loadInviteSummary({force:true});assert.equal(dialog.opens,1);
 x.el('incomingInviteCard').listeners.click();assert.equal(dialog.opens,2);x.el('inviteWelcomeFriends').listeners.click();assert.deepEqual(x.calls.at(-1),{action:'leaderboard',mode:'friends'});
});
test('welcome waits behind an open panel and legacy invitations retain their original goal',async()=>{
 const x=setup(),dialog=welcomeDialog(x),d={...cumulativeFixture(),incoming_referral:incoming()};x.c.document.querySelector=()=>({});x.respond(async()=>d);await x.c.loadInviteSummary();assert.equal(dialog.opens,0);assert.equal(x.el('incomingInviteCard').hidden,false);
 d.incoming_referral={...incoming(),qualification_mode:'daily_taps_or_ad',policy_version:'referrals_activity_v9',min_taps:250};await x.c.loadInviteSummary({force:true});assert.equal(dialog.opens,0);assert.match(x.el('incomingInviteRule').textContent,/250 verified taps in one UTC day/);assert.doesNotMatch(x.el('incomingInviteRule').textContent,/100 verified taps/);
 x.el('incomingInviteCard').listeners.click();assert.equal(dialog.open,true);assert.equal(x.el('incomingInviteMeter').hidden,true);
});
test('rewarded incoming invitations never replay onboarding or imply a second welcome payment',async()=>{
 const x=setup(),dialog=welcomeDialog(x);x.respond(async()=>({...cumulativeFixture(),incoming_referral:{...incoming(),status:'rewarded',verified_taps:100}}));await x.c.loadInviteSummary();assert.equal(dialog.opens,0);assert.match(x.el('incomingInviteProgress').textContent,/Invitation complete/);assert.match(x.el('incomingInviteRule').textContent,/inviter’s reward has been credited/);assert.equal(x.el('incomingInviteMeter').hidden,true);
});
test('legacy incoming records may lack a date but never receive the new cumulative promise',async()=>{
 const x=setup(),dialog=welcomeDialog(x);x.respond(async()=>({...cumulativeFixture(),incoming_referral:{...incoming(),policy_version:'legacy_unknown',qualification_mode:'legacy_unknown',joined_at:null,min_taps:null,verified_taps:null,status:'on_hold'}}));await x.c.loadInviteSummary();assert.equal(x.el('shareTelegramBtn').disabled,false);assert.equal(dialog.opens,0);assert.match(x.el('incomingInviteRule').textContent,/No action is needed/);assert.doesNotMatch(x.el('incomingInviteRule').textContent,/100/);
});
test('incoming attribution is account scoped and its display name is assigned as text',async()=>{
 const x=setup(),dialog=welcomeDialog(x),d={...cumulativeFixture(),incoming_referral:{...incoming(),display_name:'<svg onload=bad()>'}};x.respond(async()=>d);await x.c.loadInviteSummary();assert.equal(x.el('inviteWelcomeTitle').textContent,'<svg onload=bad()> invited you');assert.equal(x.el('inviteWelcomeTitle').innerHTML,'');
 x.owner(10002);x.respond(async()=>fixture(10002));await x.c.loadInviteSummary();assert.equal(dialog.open,false);assert.equal(x.el('incomingInviteCard').hidden,true);assert.equal(x.storage.size,0);
});

test('history message distinguishes five unverified historical invites from no invitations',async()=>{
 const x=setup(),d=cumulativeFixture();
 d.friends_joined=5;d.friends_pending=0;d.friends_qualified=0;d.friends_rewarded=0;d.friends_on_hold=5;
 d.friend_progress=Array.from({length:5},(_,i)=>({...d.friend_progress[0],id:'legacy'+i,status:'on_hold',qualification_mode:'legacy_unknown',policy_version:'legacy_unknown',verified_taps:null,min_taps:null}));
 x.respond(async()=>d);await x.c.loadInviteSummary();
 x.respond(async()=>({ok:true,telegram_id:'10001',credits:[]}));await x.c.loadInviteHistory({force:true});
 assert.match(x.el('inviteHistoryStatus').textContent,/team handles reconciliation automatically/);
 assert.doesNotMatch(x.el('inviteHistoryStatus').textContent,/invite your first friend/i);
 assert.match(x.el('inviteFriendProgress').innerHTML,/Legacy reconciliation/);
});
test('history distinguishes pending qualification from confirmed credits',async()=>{
 const x=setup();x.respond(async()=>cumulativeFixture());await x.c.loadInviteSummary();
 x.respond(async()=>({ok:true,telegram_id:'10001',credits:[]}));await x.c.loadInviteHistory({force:true});
 assert.match(x.el('inviteHistoryStatus').textContent,/1 friend is progressing/);
 assert.doesNotMatch(x.el('inviteHistoryStatus').textContent,/coins credited/);
});
