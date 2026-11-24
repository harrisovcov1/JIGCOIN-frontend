"""Issue 41 focused visual checks. Uses the existing isolated pilot harness.
All player data are synthetic. No production requests, invoices or prize actions.
Run from frontend root: python recovery/final-owner-mobile.py OUTPUT_DIRECTORY
"""
import importlib.util,json,os,sys
from pathlib import Path
from urllib.parse import urlencode,urlsplit
from playwright.sync_api import sync_playwright,expect

spec=importlib.util.spec_from_file_location("pilot",Path(__file__).with_name("pilot-mobile.py"))
pilot=importlib.util.module_from_spec(spec);spec.loader.exec_module(pilot)
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
SIZES=[(320,568),(390,746),(430,832)]
TIERS=[dict(at=1,through=4,name='Bronze',reward_coins=500),dict(at=5,through=19,name='Silver',reward_coins=1000),dict(at=20,through=49,name='Gold',reward_coins=1250),dict(at=50,through=199,name='Platinum',reward_coins=1500),dict(at=200,through=None,name='Diamond',reward_coins=2000)]

class Scenario:
 def __init__(self,w,h):
  self.player=101;self.balance=17800;self.w=w;self.h=h;self.awarded=False;self.forbidden=[];self.live=False;self.unknown=False;self.empty_history=False
  self.init_data=urlencode({'user':json.dumps({'id':101,'first_name':'Pilot'})})
 def routes(self,p):
  return p in ('/api/vault/trophies','/api/leaderboard/history','/api/pilot/profile','/api/invite/summary','/api/invite/history','/api/invite/interaction','/api/championship/status','/api/weekly/standings','/api/leaderboard/daily','/api/leaderboard/event') or any(x in p for x in ('create-checkout','create-invoice','/refund','/settle'))
 def forward(self,r,headers):
  p=urlsplit(r.request.url).path
  if p=='/api/vault/trophies':
   data=dict(ok=True,telegram_id='101',trophies=[dict(week='2026-11-30',place=3,score=4567,coins=25000)] if self.awarded else [])
  elif p=='/api/leaderboard/history':
   data=dict(ok=True,version=12,telegram_id='101',page=0,podiums=[],my_awards=[] if self.empty_history else [dict(day='2026-11-19',place=1,score=42)],has_more=False)
  elif p=='/api/leaderboard/daily':
   me=dict(telegram_id=101,display_name='Pilot',rank=2,score=42)
   rival=dict(telegram_id=88,display_name='Northstar',rank=1,score=100)
   data=dict(ok=True,version=12,telegram_id='101',mode='daily',page=0,total=2,server_now='2026-11-30T12:00:00Z',day='2026-11-30',ends_at='2026-12-01T00:00:00Z',award_start_day='2026-11-18',awards_enabled=True,me=me,podium=[rival,me],nearby=[rival,me],entries=[rival,me],has_more=False,overtake=dict(target_telegram_id=88,need_points=59))
  elif p=='/api/leaderboard/event':data=dict(ok=True)
  elif p=='/api/pilot/profile':
   data=dict(ok=True,telegram_id='101',vip_coin=False,refill=True,medals=[dict(week='2026-11-16',score=9)])
  elif p=='/api/invite/summary':
   row=dict(id='r1',display_name='Player A',status='playing',verified_taps=32,min_taps=100,qualification_mode='cumulative_taps',policy_version='referrals_cumulative_v16',joined_at=None,rewarded_at=None,reward_coins=None)
   data=dict(ok=True,telegram_id='101',server_now=pilot.iso(pilot.now()),invite_link='https://t.me/JIGCOINBOT?startapp=ref_101',policy_version='referrals_cumulative_v16',welcome_coins=1000,reward_coins=500,friends_rewarded=0,coins_earned=0,tier_name='Get started',next_at=1,previous_at=0,next_reward_coins=500,next_tier_name='Bronze',qualification=dict(mode='cumulative_taps',min_taps=100,period='lifetime',ad_qualifies=False,purchase_required=False),tiers=TIERS,friends_joined=3,friends_pending=1,friends_qualified=0,friends_on_hold=2,friends_legacy_unverified=1,friends_invalid=1,friends_credit_unconfirmed=0,friends_ledger_confirmed=0,coins_ledger_confirmed=0,friend_progress=[row,dict(row,id='old',display_name='Player B',status='on_hold',hold_reason='legacy',qualification_mode='legacy_unknown',verified_taps=None,min_taps=None),dict(row,id='bad',display_name='Player C',status='on_hold',hold_reason='invalid',qualification_mode='legacy_unknown',verified_taps=None,min_taps=None)],friend_progress_has_more=False,incoming_referral=None)
  elif p=='/api/invite/history':data=dict(ok=True,telegram_id='101',credits=[])
  elif p=='/api/invite/interaction':data=dict(ok=True)
  elif p=='/api/championship/status':
   data=dict(ok=False,reason='NETWORK') if self.unknown else dict(active=False) if not self.live else dict(active=True,name='Coin Patterns',instructions='Complete the pattern',day='2026-11-30',week='2026-11-30',close='2026-12-07',remaining=dict(practice=1,ranked=3),daily=[0]*7,rows=[],history=[],podium=0,me=None,rival=None,reminder=None,trophies=[])
  elif p=='/api/weekly/standings':
   data=dict(ok=True,telegram_id='101',runs_left=3,policy=dict(period='day',limit=3))
  else:
   self.forbidden.append(p);data=dict(ok=False,error='FORBIDDEN_IN_QA')
  return r.fulfill(json=data,headers=headers)
 def exercise(self,page):
  def shot(label):
   page.screenshot(path=str(out/f'{self.w}-{label}.png'),animations='disabled')
  def geometry(sheet):
   header=page.locator(f'#{sheet} .sheet-header')
   result=header.evaluate("""h=>{
    const rect=e=>e.getBoundingClientRect(), s=rect(h.closest('.sheet')),
      t=rect(h.querySelector('.sheet-title')), c=rect(h.querySelector('.vip-crown-link')), x=rect(h.querySelector('.sheet-close'));
    return {center:Math.abs((t.left+t.right-s.left-s.right)/2),crown:[c.width,c.height],close:[x.width,x.height],leftGap:t.left-c.right,rightGap:x.left-t.right,
      hitC:h.querySelector('.vip-crown-link').contains(document.elementFromPoint(c.x+c.width/2,c.y+c.height/2)),hitX:h.querySelector('.sheet-close').contains(document.elementFromPoint(x.x+x.width/2,x.y+x.height/2))};
   }""")
   assert result['center']<=2,result
   assert min(result['crown'])>=44 and min(result['close'])>=44,result
   assert result['leftGap']>=5.5 and result['rightGap']>=5.5 and result['hitC'] and result['hitX'],result
   return result
  measurements={}
  page.evaluate("""() => {
   const original=window.fetch;
   window.__cutoverTrace=[];window.__cutoverHeld=[];window.__holdLegacy=false;
   window.fetch=function(...args){
    const input=args[0],url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname!=='/api/weekly/standings')return original.apply(this,args);
    const row={path:url.pathname,mode:window.JigChampionship?.entryMode?.()||'unknown',dispatchedAt:performance.now(),completedAt:null,held:window.__holdLegacy};
    window.__cutoverTrace.push(row);
    return original.apply(this,args).then(response=>{
     const finish=()=>{row.completedAt=performance.now();return response};
     if(!row.held)return finish();
     return new Promise(resolve=>window.__cutoverHeld.push(()=>resolve(finish())));
    });
   };
  }""")
  shot('home')
  for tab,sheet,label in [('tabTasks','boostSheet','rewards'),('tabShop','coinShopSheet','shop'),('tabFriends','friendsSheet','invite'),('tabWithdraw','withdrawSheet','vault')]:
   page.locator('#'+tab).click()
   expect(page.locator('#'+sheet)).to_be_visible()
   measurements[label]=geometry(sheet)
   if label=='invite':
    expect(page.locator('#invitePendingSummary')).to_contain_text('1 historical')
   if label=='vault':
    expect(page.locator('#vaultMedalCount')).to_have_text('0 earned')
    expect(page.locator('#vaultCollectionNext')).to_contain_text('2/8 unlocked')
    expect(page.locator('#vaultLegendProgressLabel')).to_contain_text('17,800 / 10,000,000')
    assert not page.locator('#vaultLegacyHonours').evaluate('e=>e.open')
    assert page.locator('#vaultVipOpen').count()==0
    expect(page.locator('#vaultAccountDrawer')).to_be_visible()
    body=page.locator('#withdrawSheet .sheet-body')
    measurements['vaultScroll']=body.evaluate('e=>({scrollHeight:e.scrollHeight,clientHeight:e.clientHeight})')
    if self.w>=390:assert body.evaluate('e=>e.scrollHeight<=e.clientHeight+2'),measurements
   shot(label)
   page.locator(f'#{sheet} .vip-crown-link').click()
   expect(page.locator('#vipOfferSheet')).to_be_visible()
   expect(page.locator('#vipReview')).to_contain_text('500 Stars')
   page.locator('#vipOfferClose').click()
   expect(page.locator('#'+sheet)).to_be_visible()
   if label=='invite':
    page.locator('#inviteDetailsOpen').click()
    expect(page.locator('#inviteFriendProgress')).to_contain_text('32 / 100 verified taps in total')
    expect(page.locator('#inviteFriendProgress')).to_contain_text('Legacy reconciliation')
    expect(page.locator('#inviteFriendProgress')).to_contain_text('Invalid')
    shot('invite-friends')
    page.locator('#inviteDetailsClose').click()
  page.locator('#vaultCollectionOpen').click()
  expect(page.locator('#vaultCoinGallery')).to_be_visible()
  expect(page.locator('#vaultCoinGalleryGrid button')).to_have_count(8)
  shot('coin-cabinet')
  page.locator('#vaultCoinGallery [type=submit]').click()
  page.locator('#vaultMedalCollection>summary').click()
  expect(page.locator('#vaultTrophyList')).to_contain_text('No Weekly Championship trophies yet')
  page.locator('#vaultLegacyHonours>summary').click()
  page.get_by_text('Legacy Daily Honours',exact=True).click()
  expect(page.locator('#vaultDailyMedalList')).to_contain_text('42')
  page.get_by_text('Earlier Weekly Race gold',exact=True).click()
  expect(page.locator('#pilotMedalList')).to_contain_text('9 pairs')
  shot('legacy-honours')
  self.awarded=True
  page.locator('#vaultMedalRetry').click()
  expect(page.locator('#vaultTrophyList')).to_contain_text('25,000 awarded coins')
  expect(page.locator('#vaultMedalCount')).to_have_text('1 earned')
  shot('synthetic-weekly-trophy')
  page.locator('#tabTasks').click()
  expect(page.locator('#rewardsWeeklyTitle')).to_have_text('Weekly Race')
  page.evaluate("async()=>{await refreshRewardsWeeklyStatus();}")
  expect(page.locator('#rewardsWeeklyStatus')).to_contain_text('3 of 3 ranked runs left')
  baseline=page.evaluate("window.__cutoverTrace.length")
  assert baseline>0
  page.evaluate("()=>{window.__holdLegacy=true;void refreshRewardsWeeklyStatus();}")
  page.wait_for_function("window.__cutoverHeld.length>0")
  self.live=True
  page.evaluate("""async()=>{const mode=await window.JigChampionship.refreshEntry(apiPost,true);
   if(mode!=='active')throw Error('Active fixture not confirmed');
   window.__cutoverActiveAt=performance.now();window.__holdLegacy=false;
   window.__cutoverHeld.splice(0).forEach(release=>release());
   await refreshRewardsWeeklyStatus();
  }""")
  expect(page.locator('#rewardsWeeklyTitle')).to_have_text('Weekly Championship')
  expect(page.locator('#rewardsWeeklyStatus')).to_contain_text('Coin Patterns')
  page.locator('#tabFriends').click()
  expect(page.locator('#inviteWeeklyRace')).to_contain_text('Weekly Championship')
  page.locator('#tabTasks').click()
  expect(page.locator('#rewardsWeeklyTitle')).to_have_text('Weekly Championship')
  page.locator('#rewardsWeeklyAction').click()
  expect(page.locator('.championship-dialog')).to_be_visible()
  expect(page.locator('.championship-dialog')).to_contain_text('Coin Patterns')
  expect(page.locator('.championship-dialog')).to_contain_text('Gold 100,000')
  assert page.locator('#ownerPracticeChallenge').count()==0
  shot('active-championship')
  page.locator('.championship-dialog').get_by_role('button',name='Close',exact=True).click()
  def daily_board(label,check_history=False):
   page.evaluate("openLeaderboard('daily')")
   expect(page.locator('#lbContent')).to_contain_text('Tap coins set today’s standings.')
   expect(page.locator('#lbClock')).to_contain_text('Daily reset in')
   assert 'earn a dated medal' not in page.locator('#lbContent').inner_text()
   page.locator('#lbRules').click()
   expect(page.locator('#lbContent')).to_contain_text('Today’s standings do not confirm eligibility for a new medal.')
   rules=page.locator('#lbContent').inner_text()
   assert 'receive dated cosmetic badges' not in rules and 'Medal races start on' not in rules
   shot(label+'-daily-rules')
   if check_history:
    page.locator('#lbHistory').click()
    expect(page.locator('#lbContent')).to_contain_text('Daily Champion')
    expect(page.locator('#lbContent')).to_contain_text('42')
    self.empty_history=True
    page.evaluate("lbLoad(true)")
    expect(page.locator('#lbContent')).to_contain_text('No verified daily medals recorded')
    expect(page.locator('#lbContent')).to_contain_text('No verified historical podium results recorded')
    self.empty_history=False
   page.locator('#lbCloseBtn').click()
  daily_board('active',True)
  trace=page.evaluate("({activeAt:window.__cutoverActiveAt,requests:window.__cutoverTrace})")
  assert trace['activeAt']>0 and any(r['held'] and r['mode']=='legacy' and r['dispatchedAt']<trace['activeAt']<=r['completedAt'] for r in trace['requests']),trace
  assert all(r['mode']=='legacy' and r['dispatchedAt']<trace['activeAt'] for r in trace['requests']),trace
  measurements['cutoverDispatchTrace']=trace
  self.live=False
  page.evaluate("window.JigChampionship.refreshEntry(apiPost,true)")
  expect(page.locator('#rewardsWeeklyTitle')).to_have_text('Weekly Race')
  daily_board('rollback')
  self.unknown=True
  page.evaluate("window.JigChampionship.refreshEntry(apiPost,true)")
  expect(page.locator('#rewardsWeeklyTitle')).to_have_text('Weekly competition')
  daily_board('unknown')
  assert not self.forbidden,self.forbidden
  return measurements

results={}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--disable-gpu'])
 for w,h in SIZES:
  results[f'{w}x{h}']=pilot.check(b,w,h,Scenario(w,h))
  (out/'results.json').write_text(json.dumps(results,indent=2))
  print('PASS',w,h,flush=True)
 b.close()
