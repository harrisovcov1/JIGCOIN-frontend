#!/usr/bin/env python3
"""Build a local synthetic review page using the real integrated UI controllers.

This page contains synthetic users and read-only mock API responses. It strips all
production bootstrap and external scripts. It is never part of the app entrypoint.
Serve the generated output directory locally; ?panel=shop|vip|vault|invite|
invite-details|leaderboard|weekly|welcome and
?case=active|expired|pending|solo|two|long|used|legacy|referred
select views. Node checks the complete injected script before the page is written.
"""
from pathlib import Path
import argparse
import re
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=Path('/tmp/jigcoin-integrated-preview'))
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
raw=(root/'index.html').read_text()
def segment(start,end):
 a=raw.index(start);b=raw.index(end,a);return raw[a:b]
html=re.sub(r'<script\b[^>]*>.*?</script\s*>','',raw,flags=re.S|re.I)
html=html.replace('<head>','<head><base href="/">')
bootstrap=r'''
const fixtureParams=new URLSearchParams(location.search),fixturePanel=fixtureParams.get('panel')||'shop';
const fixtureCase=fixtureParams.get('case')||'default';
const fixtureOwner=123;
const fixtureName=name=>fixtureCase==='long'?(name+'SilverFalconRiverstone'.repeat(3)).slice(0,48):name;
const fixturePendingOrder='vp_'+'a'.repeat(48);
const E=id=>document.getElementById(id);
const apiCalls=[];
let homeIdentity=fixtureOwner,homeConfirmedBalance=20635,maxEnergy=55;
let state={bal:20635,energy:17,vipUntil:fixtureCase==='active'?new Date(Date.now()+86400000*25).toISOString():fixtureCase==='expired'?new Date(Date.now()-86400000).toISOString():null,streakDays:4};
const accountIsReady=()=>true,homeUserId=()=>fixtureOwner,formatNumber=n=>Number(n).toLocaleString('en-GB'),launchEquipped=()=>false;
const syncMintWorld=()=>{},renderCollectibleCoin=()=>{},renderHomeSession=()=>{},renderBoostCards=()=>{},render=()=>{},renderDailyRewards=()=>{},renderShareCardCanvas=()=>{},refreshState=async()=>{},syncStateIfIdle=async()=>{},hideDailyNotice=()=>{},stopRewardWait=()=>{},invalidateRefillPreparation=()=>{},showToast=console.log,reviewGamePurchase=async()=>false,progressionCurrent=()=>null;
const appStorage={_data:new Map(),getItem(k){return this._data.get(k)},setItem(k,v){this._data.set(k,v);return true},removeItem(k){this._data.delete(k)}};
if(fixtureCase==='pending')appStorage.setItem('jigcoin_vip_pending_v11:'+fixtureOwner,fixturePendingOrder);
const coinShopSheet=E('coinShopSheet'),coinPackList=E('coinPackList'),withdrawSheet=E('withdrawSheet'),vipSheet=E('vaultDetailsSheet'),friendsSheet=E('friendsSheet'),sheetBackdrop=E('sheetBackdrop'),boostSheet=E('boostSheet');
const tabShop=E('tabShop'),tabWithdraw=E('tabWithdraw'),tabFarm=E('tabFarm'),tabFriends=E('tabFriends'),tabTasks=E('tabTasks');
const withdrawBalanceText=E('withdrawBalanceText'),vipBuyBtn=E('vipBuyBtn'),vipStatusText=E('vipStatusText'),friendsJoinedText=E('friendsJoinedText'),referralPointsText=E('referralPointsText'),inviteLinkText=E('inviteLinkText'),shareTelegramBtn=E('shareTelegramBtn'),copyInviteBtn=E('copyInviteBtn'),copyShareTextBtn=E('copyShareTextBtn'),downloadShareCardBtn=E('downloadShareCardBtn');
function dailyCosmeticMarkup(keys,name){return escapeHtml(name)}
function setActiveTab(tab){for(const el of [tabShop,tabWithdraw,tabFarm,tabFriends,tabTasks])el.classList.toggle('active',el===tab);E('mainScroll').inert=tab!==tabFarm;}
function backToHome(){document.querySelectorAll('.sheet.show').forEach(x=>x.classList.remove('show'));sheetBackdrop.classList.remove('show');const lb=E('leaderboardScreen');if(lb)lb.style.display='none';setActiveTab(tabFarm);}
function openHomeJourney(){showAppSheet(E('homeJourneySheet'),tabWithdraw)}
function openBoostSheet(){showAppSheet(E('boostSheet'),tabTasks)}
function openFriendsSheet(){showAppSheet(friendsSheet,tabFriends);renderInviteOverview();void loadInviteSummary();}
const fixtureTiers=[{at:1,through:4,name:'Bronze',reward_coins:500},{at:5,through:19,name:'Silver',reward_coins:1000},{at:20,through:49,name:'Gold',reward_coins:1250},{at:50,through:199,name:'Platinum',reward_coins:1500},{at:200,through:null,name:'Diamond',reward_coins:2000}];
const fixturePacks=[{sku:'JC_SMALL',title:'Small coin pack',coins:1000,stars:100},{sku:'JC_MEDIUM',title:'Medium coin pack',coins:3000,stars:250},{sku:'JC_LARGE',title:'Large coin pack',coins:7000,stars:500},{sku:'JC_GROWTH',title:'Growth coin pack',coins:37500,stars:2500},{sku:'JC_MAX',title:'Maximum coin pack',coins:700000,stars:35000}];
// In-memory gameplay only: use the API's id/turn/picks contract and one clock
// for standings, start, answer and expiry. No request reaches a real server.
const fixtureWeeklyClockBase=Date.parse(fixtureCase==='legacy'?'2026-11-19T17:00:00.000Z':'2026-11-24T12:00:00.000Z'),fixtureWeeklyClockRead=performance.now();
const fixtureWeeklyNow=()=>fixtureWeeklyClockBase+performance.now()-fixtureWeeklyClockRead;
const fixtureWeeklyRuns={ranked:null,practice:null};
let fixtureRankedUsed=fixtureCase==='used'?3:1,fixtureWeeklyBest=8,fixturePracticeSerial=0;
function fixturePuzzle(turn){const boards=[{tiles:[2,7,5,3,4,6],target:9},{tiles:[1,8,4,6,2,5],target:9},{tiles:[3,6,9,2,4,7],target:11}];return boards[turn%boards.length];}
function fixtureRunView(run){if(!run)return null;const live=Date.parse(run.ends_at)>fixtureWeeklyNow();return {id:run.id,mode:run.mode,slot:run.slot,turn:run.turn,score:run.score,starts_at:run.starts_at,ends_at:run.ends_at,live,board:live?fixturePuzzle(run.turn+run.puzzle_offset):null,allowance_day:run.mode==='practice'?null:run.starts_at.slice(0,10),policy_version:run.mode==='practice'?'practice-v16':fixtureCase==='legacy'?'weekly-v14':'daily-v16'};}
function fixtureRunResponse(run,extra={}){return {ok:true,telegram_id:String(fixtureOwner),server_now:new Date(fixtureWeeklyNow()).toISOString(),run:fixtureRunView(run),...extra};}
function fixtureWeeklyAction(path,body){
 const match=path.match(/^\/api\/weekly\/(practice\/)?(start|answer|end)$/);if(!match)return null;
 const mode=match[1]?'practice':'ranked',action=match[2];let run=fixtureWeeklyRuns[mode];
 if(action==='start'){
  if(!body.request_key)return {ok:false,reason:'INVALID_RUN'};
  if(run&&(run.request_keys.includes(body.request_key)||Date.parse(run.ends_at)>fixtureWeeklyNow())){if(!run.request_keys.includes(body.request_key))run.request_keys.push(body.request_key);return fixtureRunResponse(run);}
  if(mode==='ranked'&&fixtureRankedUsed>=3)return {ok:false,reason:'RUN_LIMIT'};
  const start=fixtureWeeklyNow();run={id:crypto.randomUUID(),mode,slot:mode==='practice'?null:++fixtureRankedUsed,turn:0,score:0,starts_at:new Date(start).toISOString(),ends_at:new Date(start+45000).toISOString(),request_keys:[body.request_key],puzzle_offset:mode==='practice'?fixturePracticeSerial++:0};fixtureWeeklyRuns[mode]=run;
  return fixtureRunResponse(run);
 }
 if(!run||body.id!==run.id)return {ok:false,reason:'RUN_UNAVAILABLE'};
 if(action==='end')return fixtureRunResponse(run);
 if(!Number.isSafeInteger(body.turn)||body.turn<0||!Array.isArray(body.picks)||body.picks.length!==2||body.picks[0]===body.picks[1]||!body.picks.every(i=>Number.isInteger(i)&&i>=0&&i<6))return {ok:false,reason:'INVALID_MOVE'};
 if(body.turn>run.turn)return {ok:false,reason:'REFRESH_RUN'};
 let correct=null;
 if(body.turn===run.turn&&Date.parse(run.ends_at)>fixtureWeeklyNow()){const puzzle=fixturePuzzle(run.turn+run.puzzle_offset);correct=puzzle.tiles[body.picks[0]]+puzzle.tiles[body.picks[1]]===puzzle.target;run.turn++;if(correct)run.score++;if(mode==='ranked')fixtureWeeklyBest=Math.max(fixtureWeeklyBest,run.score);}
 return fixtureRunResponse(run,{correct});
}
function fixtureBoard(mode,page=0){
 const solo=fixtureCase==='solo',count=solo?1:fixtureCase==='two'?2:3,me={telegram_id:fixtureOwner,display_name:'You',score:mode==='daily'?2022:20635,rank:solo?1:2,finish:'rank-1',rank_finish:'rank-1',vip_active:fixtureCase==='active'};
 const first={telegram_id:321,display_name:fixtureName('JadeFox'),score:mode==='daily'?2400:31879,rank:1,finish:'rank-2',rank_finish:'rank-2',vip_active:true};
 const third={telegram_id:456,display_name:fixtureName('CopperCraft'),score:mode==='daily'?1750:16450,rank:3,finish:'rank-0',rank_finish:'rank-0',vip_active:false};
 const rows=solo?[me]:count===2?[first,me]:[first,me,third],day=new Date().toISOString().slice(0,10);
 return {ok:true,version:12,telegram_id:String(fixtureOwner),mode,page,total:count,server_now:new Date().toISOString(),day,ends_at:new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString(),award_start_day:'2026-11-17',awards_enabled:true,me,podium:rows,nearby:rows,entries:rows,has_more:false,overtake:solo?null:{target_telegram_id:first.telegram_id,need_points:first.score-me.score+1}};
}
function fixtureWeekly(body={}){
 const daily=fixtureCase!=='legacy',date=new Date(fixtureWeeklyNow()).toISOString(),week=daily?'2026-11-23':'2026-11-16',closes=daily?'2026-11-30T00:00:00.000Z':'2026-11-23T00:00:00.000Z';
 const total=fixtureCase==='two'?2:fixtureCase==='long'?3:1,place=total>1?2:1;
 const leaders=[{name:'You',place,score:fixtureWeeklyBest,me:true,finish:'rank-1',rank_finish:'rank-1',vip_active:fixtureCase==='active'}];
 if(total>1)leaders.unshift({name:fixtureName('JadeFox'),place:1,score:9,me:false,finish:'rank-2',rank_finish:'rank-2',vip_active:true});
 if(total>2)leaders.push({name:fixtureName('CopperCraft'),place:3,score:7,me:false,finish:'rank-0',rank_finish:'rank-0',vip_active:false});
 return {ok:true,telegram_id:String(fixtureOwner),server_now:date,week,closes_at:closes,scope:body.scope||'global',total,best:fixtureWeeklyBest,place,global_place:place,runs_left:3-fixtureRankedUsed,seconds:45,share_code:'a'.repeat(20),run:fixtureRunView(fixtureWeeklyRuns.ranked),practice_run:fixtureRunView(fixtureWeeklyRuns.practice),can_start:fixtureRankedUsed<3,allowance_day:daily?'2026-11-24':'2026-11-19',resets_at:daily?'2026-11-25T00:00:00.000Z':closes,policy:{version:daily?'daily-v16':'weekly-v14',period:daily?'day':'week',limit:3,activates_at:'2026-11-23T00:00:00.000Z'},leaders,last_award:null,finalized_through_week:null,result:null,rival:null};
}
async function apiPost(path,body={}){
 apiCalls.push({path,body});
 if(path.includes('/vip/overview'))return {ok:true,telegram_id:String(fixtureOwner),server_now:new Date().toISOString(),vip_active:Date.parse(state.vipUntil)>Date.now(),vip_until:state.vipUntil,benefits:{standard_tap:1.05,vip_tap:2.1,standard_energy:55,vip_energy:110},vip_bonus_coins:state.vipUntil?1265:0,streak_day:4,product:{sku:'VIP_30D_V11',stars:500,days:30,currency:'XTR',auto_renew:false,terms:'vip-v11-20261117',enabled:true},recent_orders:fixtureCase==='pending'?[{payload:fixturePendingOrder,status:'approved',stars:500,created_at:new Date().toISOString()}]:[]};
 if(path==='/api/vip/order-status'&&fixtureCase==='pending')return {ok:true,order:{payload:fixturePendingOrder,status:'approved'}};
 if(path.includes('/stars/catalog'))return {ok:true,telegram_id:fixtureOwner,server_now:new Date().toISOString(),products:fixturePacks,enabled:true,recent_orders:[],support_contact:'support@example.invalid'};
 if(path==='/api/invite/summary')return {ok:true,telegram_id:String(fixtureOwner),server_now:new Date().toISOString(),invite_link:'https://t.me/JIGCOINBOT?startapp=ref_'+fixtureOwner,policy_version:'referrals_cumulative_v16',welcome_coins:1000,reward_coins:500,friends_rewarded:0,coins_earned:0,tier_name:'Get started',next_at:1,previous_at:0,next_reward_coins:500,next_tier_name:'Bronze',qualification:{mode:'cumulative_taps',min_taps:100,period:'lifetime',ad_qualifies:false,purchase_required:false},incoming_referral:fixtureCase==='referred'||fixturePanel==='welcome'?{display_name:fixtureName('River'),policy_version:'referrals_cumulative_v16',qualification_mode:'cumulative_taps',verified_taps:12,min_taps:100,status:'playing',joined_at:'2026-11-19T17:00:00Z',rewarded_at:null,reward_coins:null}:null,tiers:fixtureTiers,friends_joined:2,friends_pending:2,friends_qualified:0,friends_on_hold:0,friend_progress:[{id:'ref_fixture_a',display_name:fixtureName('River'),status:'playing',verified_taps:42,min_taps:100,qualification_mode:'cumulative_taps',policy_version:'referrals_cumulative_v16',joined_at:new Date().toISOString(),rewarded_at:null,reward_coins:null},{id:'ref_fixture_b',display_name:fixtureName('Morgan'),status:'joined',verified_taps:0,min_taps:100,qualification_mode:'cumulative_taps',policy_version:'referrals_cumulative_v16',joined_at:new Date().toISOString(),rewarded_at:null,reward_coins:null}]};
 if(path==='/api/invite/history')return {ok:true,telegram_id:String(fixtureOwner),credits:[]};
 if(path==='/api/leaderboard/history')return {ok:true,version:12,telegram_id:String(fixtureOwner),page:body.page,my_awards:fixtureCase==='active'?[{day:'2026-11-18',place:1,score:2022}]:[],podiums:[],has_more:false};
 if(path==='/api/leaderboard/event')return {ok:true};
 if(path.startsWith('/api/leaderboard/'))return fixtureBoard(path.split('/').pop(),body.page);
 if(path==='/api/pilot/profile')return {ok:true,telegram_id:String(fixtureOwner),vip_coin:false,refill:true,medals:[],weekly_awards:[]};
 if(path==='/api/weekly/standings')return fixtureWeekly(body);
 const weeklyAction=fixtureWeeklyAction(path,body);if(weeklyAction)return weeklyAction;
 return {ok:false,reason:'FIXTURE_READ_ONLY'};
}
document.documentElement.dataset.mintRank='1';E('accountContent').removeAttribute('inert');
'''
parts=[bootstrap,segment('const HOME_TIERS =','const state ='),segment('function homeTierIndex(','function advanceHomeMilestone('),'let coinArtworkSerial=0;\n'+segment('function mintFinishArtwork(','function progressionCurrent('),segment('function showAppSheet(','// Coin Shop:'),segment('function openCoinShopSheet()','// ------------ Momentum Shield UI'),segment('// Invite v10: account-scoped','// End Invite v10 data and actions.'),segment('// Vault v11:','// End Vault v11 controller.'),segment('// ---------------- LEADERBOARD OVERLAY v12','// ---------------- END LEADERBOARD v12')]
weekly=re.findall(r'<script>\s*(\(\(\) => \{[\s\S]*?window\.JigPilot[\s\S]*?\}\)\(\);)\s*</script>',raw)[-1]
parts.append(weekly)
parts.append(r'''
for(const [id,action] of [['tabShop',openCoinShopSheet],['tabFriends',openFriendsSheet],['tabWithdraw',openVault],['tabFarm',()=>openLeaderboard('daily')],['tabTasks',()=>window.JigPilot.openRace()],['inviteDetailsOpen',openInviteDetails],['inviteDetailsClose',openFriendsSheet],['inviteFriendsBoard',()=>openLeaderboard('friends')]])E(id).addEventListener('click',action);
window.fixtureReady=false;
(async()=>{await refreshVipStatus();if(fixturePanel==='vault')openVault();else if(fixturePanel==='vip')openVipOffer('shop');else if(fixturePanel==='invite')openFriendsSheet();else if(fixturePanel==='invite-details'){await loadInviteSummary();openInviteDetails();}else if(fixturePanel==='leaderboard')openLeaderboard(fixtureParams.get('mode')||'daily');else if(fixturePanel==='weekly')await window.JigPilot.openRace();else if(fixturePanel==='welcome')await loadInviteSummary();else openCoinShopSheet();await new Promise(r=>setTimeout(r,100));window.fixtureReady=true;})();
''')
script='\n'.join(parts)
subprocess.run(['node','--check'],input=script,text=True,check=True)
html=html.replace('</body>','<script>'+script+'</script></body>')
out=args.output.resolve();out.mkdir(exist_ok=True,parents=True)
a=out/'assets'
if not a.exists():a.symlink_to(root/'assets',target_is_directory=True)
(out/'index.html').write_text(html)
print(out/'index.html')
