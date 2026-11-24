"""Run from frontend checkout: python recovery/championship-integrated.py BACKEND_CHECKOUT OUTPUT"""
import importlib.util,json,os,sys,subprocess,urllib.request,urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from urllib.parse import urlsplit
spec=importlib.util.spec_from_file_location("pilot",Path(__file__).with_name("pilot-mobile.py"))
pilot=importlib.util.module_from_spec(spec);spec.loader.exec_module(pilot)
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','recovery/championship-browser-server.cjs'],cwd=sys.argv[1],text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
def read():
 while True:
  line=server.stdout.readline()
  if not line:raise RuntimeError('QA controller exited')
  if line.startswith(('{','[')):return json.loads(line)
def request(**data):
 server.stdin.write(json.dumps(data)+'\n');server.stdin.flush();return read()
url=read()['url']
class Scenario:
 def __init__(self,i,w):
  self.i=i;self.w=w;self.id=None;self.fail_once=(i==0)
  self.player=10001+i+[320,390,430].index(w)*30
  account=request(cmd='case',player=self.player,variant=i);self.init_data=account['initData'];self.balance=account['balance']
 def routes(self,p):
  return p.startswith('/api/championship/') or p in ('/api/pilot/profile','/api/leaderboard/history','/api/vault/trophies')
 def forward(self,r,headers):
  path=urlsplit(r.request.url).path
  if path.endswith('/answer') and self.fail_once:
   self.fail_once=False
   return r.fulfill(status=503,json={'ok':False},headers=headers)
  req=urllib.request.Request(url+path,data=r.request.post_data.encode(),headers={'Content-Type':'application/json'})
  try:
   with urllib.request.urlopen(req) as reply: data=json.load(reply)
  except urllib.error.HTTPError as e:return r.fulfill(status=e.code,body=e.read(),headers=headers)
  if path.endswith('/start'):self.id=data['id'];assert data['variant']==self.i
  return r.fulfill(json=data,headers=headers)
 def exercise(self,page):
  # Enter through the actual Home surface. Reward availability can switch the
  # primary shortcut; the app also offers Weekly Race from the Rewards panel.
  trigger=page.locator('#homeBoostAction')
  if trigger.get_attribute('data-focus')!='weekly':
   page.locator('#tabTasks').click();trigger=page.locator('#boostSheet [data-open-weekly]')
  trigger.click()
  dlg=page.get_by_role('dialog',name='Weekly Championship')
  expect(dlg).to_be_visible()
  if self.i==0:
   dlg.screenshot(path=str(out/f'lobby-{self.w}.png'))
   dlg.get_by_text('Daily Telegram reminder',exact=True).click()
   expect(dlg.get_by_text('Daily reminder off.',exact=True)).to_be_visible()
   dlg.get_by_role('button',name='Enable daily reminder').tap()
   expect(dlg.get_by_role('status')).to_have_text('Daily reminder enabled.')
   dlg.get_by_role('button',name='Disable daily reminder').tap()
   expect(dlg.get_by_role('status')).to_have_text('Daily reminder disabled.')
   dlg.get_by_text('Daily Telegram reminder',exact=True).click()
  dlg.get_by_role('button',name='Practice',exact=False).click()
  submit=dlg.get_by_role('button',name='Submit answer')
  submit.wait_for(timeout=25000)
  assert dlg.evaluate('d=>d.scrollWidth<=d.clientWidth+1')
  actions=request(cmd='answer',id=self.id)
  tiles=submit.locator('..').locator('button')
  shot=out/f'{self.i:02}-{self.w}.png'
  page.screenshot(path=str(shot))
  for a in actions:
   tile=tiles.nth(a);box=tile.bounding_box();assert box['width']>=44 and box['height']>=44
   tile.tap()
  submit.tap()
  if self.i==0:dlg.get_by_role('button',name='Try again').click()
  expect(dlg.get_by_text('Correct',exact=True)).to_be_visible()
  close=dlg.get_by_role('button',name='Close',exact=True);close.tap()
  expect(dlg).to_have_count(0)
  assert trigger.evaluate('e=>document.activeElement===e')
  if self.i==0:
   for tab,sheet,back in [('tabTasks','boostSheet','boostClose'),('tabShop','coinShopSheet','coinShopClose'),('tabFriends','friendsSheet','friendsClose')]:
    page.locator('#'+tab).tap();expect(page.locator('#'+sheet)).to_be_visible();page.locator('#'+back).tap()
   page.locator('#tabWithdraw').click()
   page.locator('#vaultMedalCollection>summary').click()
   page.locator('#vaultLegacyHonours>summary').click()
   page.get_by_text('Legacy Daily Honours',exact=True).click()
   expect(page.locator('#vaultDailyMedalList')).to_contain_text('42')
   page.get_by_text('Earlier Weekly Race gold',exact=True).click()
   expect(page.locator('#pilotMedalList')).to_contain_text('9 pairs')
   expect(page.locator('#vaultTrophyList')).to_contain_text('25,000 awarded coins')
   page.screenshot(path=str(out/f'vault-{self.w}.png'))
  return {'variant':self.i,'width':self.w,'screenshot':shot.name,'correct':True}
try:
 results=[]
 with sync_playwright() as w:
  b=w.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--disable-gpu'])
  for i in range(30):
   for width,height in [(320,568),(390,746),(430,832)]:
    if os.getenv('CHAMP_QA_WIDTH') and width!=int(os.environ['CHAMP_QA_WIDTH']):continue
    result=pilot.check(b,width,height,Scenario(i,width))
    results.append(result);(out/'results.json').write_text(json.dumps(results,indent=2))
    print('PASS',i,width,flush=True)
  b.close()
finally:
 server.stdin.close();server.wait(timeout=20)
