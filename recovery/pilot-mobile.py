from playwright.sync_api import sync_playwright, expect
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlsplit
import os, uuid
import re

root=Path(__file__).resolve().parents[1]
now=lambda: datetime.now(timezone.utc)
def iso(d): return d.isoformat()
tg=101
refill='sp_emergency_energy'
coin='sp_visit_partner'
boost='sp_double_points'

RANKS = [
    (0, 'Copper Strike', 'recruit-copper.webp'),
    (10_000, 'Foundry Gold', 'foundry-gold.webp'),
    (50_000, 'Aurora Glass', 'aurora-glass.webp'),
    (150_000, 'Jade Sentinel', 'commander-jade.webp'),
    (500_000, 'Amethyst Prism', 'general-amethyst.webp'),
    (1_500_000, 'Onyx Crest', 'elite-onyx.webp'),
    (5_000_000, 'Garnet Laurel', 'champion-garnet.webp'),
    (10_000_000, 'Platinum Sovereign', 'legend-platinum.webp'),
]

def expect_art(image, rank):
    expect(image).to_have_attribute('src', './assets/' + RANKS[rank][2])
    assert image.evaluate('async img => { await img.decode(); return img.naturalWidth > 0 }')

def expect_chamber(scene, rank):
    expected = '/assets/mint-press.webp' if rank == 1 else f'/assets/chambers/rank-{rank}.webp'
    background = scene.evaluate("el => getComputedStyle(el,'::before').backgroundImage")
    sources = re.findall(r'url\(["\']?([^"\')]+)', background)
    chamber = next((url for url in sources if urlsplit(url).path.endswith(expected)), None)
    assert chamber, (rank, expected, background)
    size = scene.evaluate("async (el,src) => {const image = new Image(); image.src = src; await image.decode(); return [image.naturalWidth,image.naturalHeight]}", chamber)
    assert min(size) > 0, (rank, size)

def check_home_rank_and_saving(page):
    save = page.locator('#homeSaveStatus')
    rank = page.locator('#homeJourneyOpen')
    journey = page.locator('#homeJourneySheet')
    preview = page.locator('#crownPreview')
    sync = page.locator('#tapSaveDialog')

    # Model a returning player with taps written before account-bound storage.
    page.evaluate("localStorage.setItem('ae_pending_taps', '3')")
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function("window.__accountPhase==='ready'")
    expect(save).to_be_hidden()
    # Hiding the status must leave the rank badge centered on the cabinet.
    assert rank.evaluate('el => Math.abs(el.getBoundingClientRect().x + el.offsetWidth/2 - innerWidth/2) < 2')
    page.locator('#homeNextPreview').click()
    expect(preview).to_be_visible()
    expect(page.locator('#crownPreviewTitle')).to_have_text('Aurora Glass')
    expect(journey).to_be_hidden()
    preview.locator('[type=submit]').click()
    expect(page.locator('#mintFinishName')).to_have_text('Foundry Gold')

    rank.click()
    expect(journey).to_be_visible()
    expect(page.locator('#journeyTarget')).to_have_text('Unlock Operator')
    expect_art(page.locator('#journeyCoin img'), 2)
    dims = journey.evaluate('''sheet => {
        const body = sheet.querySelector('.sheet-body');
        const {left, right} = body.getBoundingClientRect();
        const children = [sheet.querySelector('#journeyCoin img'), sheet.querySelector('#journeyTarget'),
            sheet.querySelector('#homeJourneyNext'), ...sheet.querySelectorAll('#homeTierGrid button')];
        return {hero: children[0].getBoundingClientRect().width,
            overflow: children.some(el => {const r=el.getBoundingClientRect(); return r.left < left || r.right > right;}),
            horizontal: body.scrollWidth - body.clientWidth, vertical: body.scrollHeight - body.clientHeight};
    }''')
    assert 30 <= dims['hero'] <= 80 and not dims['overflow'] and dims['horizontal'] <= 1, dims
    if page.viewport_size['height'] >= 680:
        assert dims['vertical'] <= 2, dims
    expect(page.locator('#homeTierGrid button')).to_have_count(8)
    page.locator('#journeySettings summary').click()
    page.locator('#journeySaveOpen').click()
    expect(sync).to_be_visible()
    expect(page.locator('#historicalTapStatus')).to_contain_text('older unconfirmed taps')
    sync.locator('[type=submit]').click()
    assert page.evaluate("localStorage.getItem('ae_pending_taps')") == '3'
    page.locator('#homeJourneyClose').click()

    # Simulate a queued save that exhausted its normal automatic retries.
    page.evaluate("ordinarySaveNotice = 'Your taps are on this device. Reopen online to finish saving.'; renderHomeSession()")
    save.click()
    expect(sync).to_be_visible()
    expect(journey).to_be_hidden()
    expect(page.locator('#homeNormalSyncStatus')).to_contain_text('Reopen online')
    sync.locator('[type=submit]').click()
    page.evaluate("ordinarySaveNotice = ''; renderHomeSession()")
    expect(save).to_be_hidden()

def check_rank_ladder(page, account, initial_bounds):
    home_coin = page.locator('#homeCoinArtwork img')
    home_name = page.locator('#mintFinishName')
    tap = page.locator('#tapBtn')

    def set_balance(balance, rank):
        account['balance'] = balance
        page.evaluate('refreshState()')
        expect(home_name).to_have_text(RANKS[rank][1])
        expect(page.locator('#mintPressCard')).to_have_attribute('data-finish', f'rank-{rank}')
        expect_art(home_coin, rank)
        expect_art(page.locator('#homeNextCoin img'), min(rank + 1, len(RANKS) - 1))
        dismiss = page.locator('.rank-celebration-close')
        if dismiss.is_visible():
            dismiss.click()
        bounds = tap.bounding_box()
        assert [bounds[key] for key in ('width', 'height')] == [initial_bounds[key] for key in ('width', 'height')]
        assert tap.evaluate('el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)) }')

    for rank, (threshold, name, _) in enumerate(RANKS):
        if rank:
            set_balance(threshold - 1, rank - 1)
        set_balance(threshold, rank)
        expect_chamber(page.locator('.mint-press-scene'), rank)
        page.locator('#tabWithdraw').click()
        expect_art(page.locator('#vaultRankArt img'), rank)
        page.locator('#tabFarm').click()

    set_balance(10_000, 1)
    page.locator('#homeJourneyOpen').click()
    expect(page.locator('#homeTierGrid button[data-try-finish]')).to_have_count(len(RANKS))
    for rank, (_, name, _) in enumerate(RANKS):
        tier = page.locator(f'#homeTierGrid [data-try-finish="rank-{rank}"]')
        expect_art(tier.locator('img'), rank)
        tier.click()
        expect(page.locator('#crownPreviewTitle')).to_have_text(name)
        expect_art(page.locator('#cabinetCoin img'), rank)
        expect_chamber(page.locator('#crownPreview .mint-cabinet-scene'), rank)
        page.locator('#crownPreview [type=submit]').click()
    page.locator('#homeJourneyClose').click()
    expect(home_name).to_have_text('Foundry Gold')
    page.locator('#mintCabinetOpen').click()
    page.locator('#crownPreview [data-browse-rank="previous"]').click()
    expect_art(page.locator('#cabinetCoin img'), 0)
    page.locator('#crownPreview [data-browse-rank="next"]').click()
    expect_art(page.locator('#cabinetCoin img'), 1)
    page.locator('#crownPreview [type=submit]').click()

def check_race_art(page, account):
    # Verify the actual exported PNG contains the same artwork as each frozen finish.
    for left in range(0, len(RANKS), 2):
        account['race_finishes'] = [f'rank-{left}', f'rank-{left + 1}']
        page.locator('[data-race-action=reload]').click()
        photos = page.locator('.race-finish img')
        for i, rank in enumerate([left, left + 1]):
            expect_art(photos.nth(i), rank)
            expect(page.locator('.race-specimen').nth(i)).to_contain_text(RANKS[rank][1])
        page.locator('[data-race-action=image]').click()
        expect(page.locator('#resultImage')).to_be_visible()
        errors = page.locator('#raceCardImage').evaluate("""async png => {
            await png.decode();
            const canvas = document.createElement('canvas');
            canvas.width = png.naturalWidth; canvas.height = png.naturalHeight;
            const ctx = canvas.getContext('2d', {willReadFrequently:true});
            ctx.drawImage(png, 0, 0);
            return [...document.querySelectorAll('.race-finish img')].map((coin,i) => {
                const x = i === 0 ? 228 : 652, y = 248;
                // Interior pixels avoid the medal's antialiased outer clipping path.
                const actual = ctx.getImageData(x-25,y-25,50,50).data;
                ctx.drawImage(coin,x-77,y-77,154,154);
                const expected = ctx.getImageData(x-25,y-25,50,50).data;
                return actual.reduce((sum,val,index) => sum + Math.abs(val-expected[index]),0) / actual.length;
            });
        }""")
        assert max(errors) < 1, (account['race_finishes'], errors)
        page.locator('#resultImage [type=submit]').click()

def check(browser,width,height):
    context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True, reduced_motion='reduce',service_workers='block')
    page=context.new_page()
    page.set_default_timeout(4800)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    base='https://pilot.jigcoin.test'
    a={'balance':17800,'energy':50,'skin':False,'vip':False,'run':None,'left':3,'reward':'available','legacy':False,'claims':0}
    calls=[]
    rival_code='2'*20
    card_code='a'*32
    a['race_finishes'] = ['rank-2','rank-1']
    def screenshot(label):
        destination=os.getenv('JIGCOIN_SCREENSHOT_DIR')
        if destination and width==390:
            Path(destination).mkdir(exist_ok=True,parents=True)
            page.screenshot(path=str(Path(destination)/(label+'.png')),animations='disabled')
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
        if p=='/api/leaderboard/global':
            me=dict(telegram_id=tg,display_name='You',rank=2,score=a['balance'])
            rival=dict(telegram_id=88,display_name='LongRivalNameLongRivalNameLongRivalName',rank=1,score=a['balance']+100)
            out=dict(ok=True,version=12,telegram_id=tg,mode='global',page=0,total=2,
                     day=now().date().isoformat(),server_now=iso(now()),ends_at=iso(now()+timedelta(hours=1)),
                     award_start_day=now().date().isoformat(),awards_enabled=True,podium=[rival,me],
                     nearby=[rival,me],entries=[rival,me],me=me,has_more=False,
                     overtake=dict(need_points=101,target_telegram_id=88))
        if p=='/api/config':out=dict(ok=True,config={})
        if p=='/api/pilot/coin':a['skin']=d['equip']
        if p in ('/api/pilot/profile','/api/pilot/coin'):out=dict(ok=True,telegram_id=str(tg),vip_coin=a['skin'],refill=True,medals=[])
        if p=='/api/weekly/start':
            if not a['run'] or not a['run']['live']:
                a['run']=dict(id=str(uuid.uuid4()),slot=4-a['left'],turn=0,score=0,ends_at=iso(now()+timedelta(seconds=45)),live=True,board={'tiles':[1,2,3,4,5,6],'target':3})
                a['left']-=1
            out=dict(ok=True,telegram_id=str(tg),server_now=iso(now()),run=a['run'])
        if p=='/api/weekly/answer':
            assert d['turn']==a['run']['turn'] and set(d['picks'])=={0,1}
            a['run'].update(score=1,turn=1)
            out=dict(ok=True,telegram_id=str(tg),server_now=iso(now()),run=a['run'],correct=True)
        if p=='/api/weekly/standings':
            run=a['run']; score=run['score'] if run else 0
            out=dict(ok=True,telegram_id=str(tg),server_now=iso(now()),week='2026-11-16',closes_at=iso(now()+timedelta(days=3)),runs_left=a['left'],seconds=45,run=run,best=score,place=1 if score else None,share_code='1'*20 if score else None,leaders=[{'place':1,'name':'Northstar','score':4,'me':False,'share_code':rival_code}],rival=None)
            if score and run and not run['live'] and (d.get('rival')==rival_code or d.get('card')==card_code):
                out['result']={'code':card_code,'week':out['week'],'margin':3,'players':[
                    {'name':'Northstar','me':False,'score':4,'slot':2,'finish':a['race_finishes'][0],'challenge':rival_code},
                    {'name':'Pilot','me':True,'score':1,'slot':1,'finish':a['race_finishes'][1],'challenge':'1'*20}]}
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
        expect(page.locator('#mintFinishName')).to_have_text('Foundry Gold')
        check_home_rank_and_saving(page)
        page.locator('#mintCabinetOpen').click()
        expect(page.locator('#crownPreview')).to_be_visible()
        expect(page.locator('#crownPreview [data-try-finish]')).to_have_count(0)
        page.locator('#crownPreview [data-browse-rank="next"]').click()
        expect(page.locator('#crownPreviewTitle')).to_have_text('Aurora Glass')
        page.locator('#crownPreview [type=submit]').click()
        expect(page.locator('#mintFinishName')).to_have_text('Foundry Gold')
        a['balance']=49999
        page.evaluate('async()=>{await refreshState()}')
        before=page.locator('#tapBtn').bounding_box()
        screenshot('foundry')
        a['balance']=50000
        page.evaluate('async()=>{await refreshState()}')
        expect(page.locator('.tap-card')).to_have_attribute('data-finish','rank-2')
        expect(page.locator('#mintFinishName')).to_have_text('Aurora Glass')
        assert before==page.locator('#tapBtn').bounding_box()
        expect_chamber(page.locator('.mint-press-scene'), 2)
        celebration=page.locator('.rank-celebration-close')
        if celebration.is_visible(): celebration.click()
        screenshot('aurora')
        check_rank_ladder(page, a, coin_size)
        a['balance']=17800
        page.evaluate('async()=>{await refreshState()}')
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
        page.locator('[data-rival]').click()
        expect(page.locator('.mint-result h2')).to_have_text('Northstar wins by 3 pairs')
        expect(page.locator('.race-specimen')).to_have_count(2)
        assert page.locator('.race-finish img').evaluate_all('(images)=>images.every(x=>x.complete&&x.naturalWidth>0)')
        screenshot('race-result')
        page.locator('[data-race-action=share-result]').click()
        assert 'ref_101__src_duel_'+card_code in page.evaluate('decodeURIComponent(window.shared)')
        page.locator('[data-race-action=image]').click()
        expect(page.locator('#resultImage')).to_be_visible()
        assert page.locator('#raceCardImage').evaluate('x=>x.decode().then(()=>[x.naturalWidth,x.naturalHeight])')==[880,540]
        page.locator('#resultImage [type=submit]').click()
        check_race_art(page, a)
        # A shared result can be opened from a fresh launch without spending a run.
        starts=calls.count('/api/weekly/start')
        page.goto(base+'/?tgWebAppStartParam=ref_101__src_duel_'+card_code,wait_until='domcontentloaded')
        expect(page.locator('.mint-result h2')).to_have_text('Northstar wins by 3 pairs')
        assert calls.count('/api/weekly/start')==starts
        page.locator('[data-race-action=rematch]').click()
        expect(page.locator('.pilot-clock')).to_contain_text('Run 2 of 3')
        assert calls.count('/api/weekly/start')==starts+1

        page.locator('#weeklyClose').click()
        page.locator('#tabShop').click()
        goal=page.locator('.hub-goal')
        expect(goal).to_contain_text('20,800');expect(goal).to_contain_text('250')
        assert not page.locator('.pilot-all-packs').evaluate('(x)=>x.open')
        a['balance']=49000
        page.evaluate('async()=>{await refreshState();renderStarsCatalog()}')
        expect(goal).to_contain_text('Unlock Operator');expect(goal).to_contain_text('50,000')
        page.locator('#shopVipPass').click()
        expect(page.locator('#vipReview')).to_be_visible()
        vault=page.locator('#withdrawSheet .sheet-body')
        assert vault.evaluate('el => el.scrollHeight <= el.clientHeight + 2'), 'Vault first screen exceeds the available height'
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
        page.locator('#tabFarm').click()
        page.locator('#homeLeaderboard').click()
        target=page.locator('.lb-race-card p')
        expect(target).to_contain_text('LongRivalName')
        assert target.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), 'Rival name extends outside the target panel'
        assert not [c for c in calls if c.endswith('/invoice') or c.endswith('/create-checkout')]
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'{width}x{height}: all eight saved-rank thresholds, fixed tap size, cabinet, rank journey, Vault, race images/PNGs, deep link/rematch, VIP, shop and ad recovery passed',flush=True)
    except Exception:
        print('Client errors:',errors,'recent paths:',calls[-16:],'account:',page.evaluate('window.__accountPhase'),'view:',page.locator('.sheet.show').all_text_contents().__str__()[:350],flush=True)
        raise
    finally:context.close()
with sync_playwright() as p:
    for width,height in [(402,874),(390,844),(320,568)]:
        b=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--no-zygote','--single-process'])
        check(b,width,height)
        b.close()
