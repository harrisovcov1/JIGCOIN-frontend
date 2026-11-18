from playwright.sync_api import sync_playwright, expect
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit
import os, uuid

root=Path(__file__).resolve().parents[1]
now=lambda: datetime.now(timezone.utc)
def iso(d): return d.isoformat()
tg=101
refill='sp_emergency_energy'
coin='sp_visit_partner'
boost='sp_double_points'

def check(browser,width,height):
    context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True, reduced_motion='reduce',service_workers='block')
    page=context.new_page()
    page.set_default_timeout(4800)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    base='https://pilot.jigcoin.test'
    a={'balance':17800,'energy':50,'skin':False,'vip':False,'run':None,'left':3,'reward':'available','legacy':False,'claims':0}
    calls=[]
    fixturejs="""(() => {const user={id:101,first_name:'Pilot'};window.Telegram={WebApp:{initDataUnsafe:{user},initData:new URLSearchParams({user:JSON.stringify(user)}).toString(),ready(){},expand(){},onEvent(){},offEvent(){},HapticFeedback:{impactOccurred(){},selectionChanged(){}},openTelegramLink(url){window.shared=url}}};window.adMode='hang';window.show_123=async function(opt){(window.adCalls||=[]).push(opt); if(opt.type==='preload'){if(window.adMode==='nofill')throw Error('Empty Feed');if(window.adMode==='hang')await new Promise(r=>window.resumePreload=r);}};})();"""
    page.add_init_script(fixturejs)
    def route(r):
        req=r.request
        u=urlsplit(req.url)
        if u.netloc=='pilot.jigcoin.test':
            f=root/(u.path.lstrip('/') or 'index.html')
            if f.is_file():return r.fulfill(body=f.read_bytes(),content_type={'.css':'text/css','.js':'application/javascript','.html':'text/html','.webp':'image/webp'}.get(f.suffix,'text/plain'))
        headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}
        if u.netloc!='jigcoin.onrender.com':return r.fulfill(body='',content_type='application/javascript')
        if req.method=='OPTIONS':return r.fulfill(status=204,headers=headers)
        p=u.path
        d=req.post_data_json or {} if req.method=='POST' else {}
        calls.append(p)
        out={'ok':False}
        if p=='/api/state':out=dict(ok=True,balance=a['balance'],energy=a['energy'],max_energy=50,telegram_id=tg,vip_until=iso(now()+timedelta(days=30)) if a['vip'] else None,onboarding_required=False,global_rank=2,global_total=142)
        if p=='/api/config':out=dict(ok=True,config={})
        if p=='/api/pilot/coin':a['skin']=d['equip']
        if p in ('/api/pilot/profile','/api/pilot/coin'):out=dict(ok=True,telegram_id=str(tg),vip_coin=a['skin'],refill=True,medals=[])
        if p=='/api/weekly/start':
            if not a['run']:
                a['run']=dict(id=str(uuid.uuid4()),slot=1,turn=0,score=0,ends_at=iso(now()+timedelta(seconds=45)),live=True,board={'tiles':[1,2,3,4,5,6],'target':3})
                a['left']-=1
            out=dict(ok=True,telegram_id=str(tg),server_now=iso(now()),run=a['run'])
        if p=='/api/weekly/answer':
            assert d['turn']==a['run']['turn'] and set(d['picks'])=={0,1}
            a['run'].update(score=1,turn=1)
            out=dict(ok=True,telegram_id=str(tg),server_now=iso(now()),run=a['run'],correct=True)
        if p=='/api/weekly/standings':
            run=a['run']; score=run['score'] if run else 0
            out=dict(ok=True,telegram_id=str(tg),server_now=iso(now()),week='2026-11-16',closes_at=iso(now()+timedelta(days=3)),runs_left=a['left'],seconds=45,run=run,best=score,place=1 if score else None,share_code='1'*20 if score else None,leaders=[],rival=None)
        if p.startswith('/api/stars/catalog'):
            packs=[(1000,100),(3000,250),(7000,500),(37500,2500),(700000,35000)]
            out=dict(ok=True,telegram_id=tg,server_now=iso(now()),enabled=True,products=[dict(sku='JC_P'+str(i),coins=c,stars=s,title='Coin pack') for i,(c,s) in enumerate(packs)],recent_orders=[])
        if p=='/api/vip/overview':
            out=dict(ok=True,telegram_id=tg,server_now=iso(now()),vip_active=a['vip'],vip_until=iso(now()+timedelta(days=30)) if a['vip'] else None,vip_bonus_coins=0,benefits={'standard_tap':1,'vip_tap':2,'standard_energy':50,'vip_energy':100},product={'sku':'VIP_30D_V11','stars':500,'days':30,'currency':'XTR','auto_renew':False,'terms':'vip-v11-20261117','enabled':True},recent_orders=[])
        if p=='/api/mission/list':
            base_m={'provider':'monetag','zone_id':'123','kind':'sponsor','cooldown_seconds':300}
            out=dict(ok=True,missions=[dict(base_m,code=refill,status=a['reward']),dict(base_m,code=coin,status='claimable' if a['legacy'] else 'unavailable',attempt_id='11111111-1111-4111-a111-111111111112' if a['legacy'] else None,claim_code=coin,payout_amount=200),dict(base_m,code=boost,status='unavailable')])
        if p=='/api/mission/start':
            assert d['code']==refill
            out=dict(ok=True,provider='monetag',zone_id='123',ymid='11111111-1111-4111-a111-111111111111',request_var=refill)
        if p=='/api/mission/complete':
            assert d['code']==coin and a['legacy']
            a.update(legacy=False,claims=a['claims']+1)
            out=dict(ok=True,payout_amount=200,payout_type='coins')
        return r.fulfill(json=out,headers=headers)
    page.route('**/*',route)
    try:
        page.goto(base, wait_until='domcontentloaded')
        page.wait_for_function("window.JigPilot && window.__accountPhase==='ready' && JigPilot.canRefill()")
        coin_size=page.locator('#tapBtn').bounding_box()
        page.locator('#homeBoostAction').click()
        start=page.locator('[data-race-action=start]')
        expect(start).to_have_text('Start run 1')
        start.click()
        page.locator('[data-tile="0"]').click()
        page.locator('[data-tile="1"]').click()
        expect(page.locator('#weeklyStatus')).to_have_text('Pair scored.')
        page.locator('#weeklyClose').click()
        page.locator('#homeBoostAction').click()
        expect(page.locator('.pilot-target')).to_contain_text('1 pair scored')
        a['run']['live']=False
        page.locator('#weeklyClose').click()
        page.locator('#homeBoostAction').click()
        page.locator('[data-race-action=share]').click()
        assert 'ref_101__src_race_' in page.evaluate('window.shared')
        page.locator('#weeklyClose').click()
        page.locator('#tabShop').click()
        goal=page.locator('.hub-goal')
        expect(goal).to_contain_text('20,800');expect(goal).to_contain_text('250')
        assert not page.locator('.pilot-all-packs').evaluate('(x)=>x.open')
        a['balance']=49000
        page.evaluate('async()=>{await refreshState();renderStarsCatalog()}')
        expect(goal).to_contain_text('Unlock Operator');expect(goal).to_contain_text('50,000')
        page.locator('#shopVipPass').click()
        expect(page.locator('#pilotCoinPreview img')).to_be_visible()
        page.wait_for_function("document.querySelector('#pilotCoinPreview img').naturalWidth > 0")
        expect(page.locator('#pilotCoinEquip')).to_be_hidden()
        page.locator('#pilotPreviewOpen').click()
        expect(page.get_by_role('dialog',name='Midnight Crown')).to_be_visible()
        page.locator('#crownPreview [type=submit]').click()
        a['vip']=True
        page.evaluate('async()=>{await refreshState();await refreshVipStatus();await JigPilot.sync(true);JigPilot.renderCoin()}')
        expect(page.locator('#pilotCoinEquip')).to_be_visible()
        page.locator('#pilotCoinEquip').click()
        expect(page.locator('#pilotCoinEquip')).to_have_text('Use rank coin')
        page.locator('#tabFarm').click()
        expect(page.locator('#homeCoinArtwork img.midnight-coin')).to_be_visible()
        size=page.locator('#tapBtn').bounding_box()
        assert (size['width'],size['height'])==(coin_size['width'],coin_size['height'])
        page.locator('#tabTasks').click()
        expect(page.locator('#energyBoostAction')).to_be_hidden()
        expect(page.locator('#doubleBoostAction')).to_be_hidden()
        expect(page.locator('#coinRewardAction')).to_be_hidden()
        a['energy']=2
        page.evaluate('async()=>{await refreshState();await refreshBoostMissions();renderBoostCards()}')
        page.locator('#energyBoostAction').click()
        page.wait_for_function('window.adCalls?.length===1')
        page.locator('#rewardsReturn').click()
        page.evaluate('window.resumePreload()')
        page.wait_for_function('window.__rewardActionBusy===false')
        assert page.evaluate('window.adCalls.length')==1
        page.locator('#tabTasks').click()
        page.evaluate("window.adMode='nofill'")
        page.locator('#energyBoostAction').click()
        expect(page.locator('#boostCooldownNote')).to_contain_text('No advert is available')
        expect(page.locator('#rewardsReturn')).to_be_enabled()
        # Wait for the no-fill refresh before simulating a later provider receipt.
        page.wait_for_function('!window.__rewardActionBusy && !boostRefreshInFlight')
        a['legacy']=True
        page.evaluate('async()=>{await refreshBoostMissions();renderBoostCards()}')
        page.locator('#coinRewardAction').click()
        page.wait_for_function('window.__rewardActionBusy===false')
        assert a['claims']==1
        assert not [c for c in calls if c.endswith('/invoice') or c.endswith('/create-checkout')]
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'{width}x{height}: race resume/share, shop goals, VIP artwork, low energy/return/no fill, legacy claim passed',flush=True)
    except Exception:
        print('Client errors:',errors,'recent paths:',calls[-16:],'account:',page.evaluate('window.__accountPhase'),'view:',page.locator('.sheet.show').all_text_contents().__str__()[:350],flush=True)
        raise
    finally:context.close()
with sync_playwright() as p:
    for width,height in [(402,874),(390,844),(320,568)]:
        b=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--no-zygote','--single-process'])
        check(b,width,height)
        b.close()
