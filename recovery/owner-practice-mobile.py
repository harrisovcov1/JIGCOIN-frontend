"""Exercise owner practice from the real frontend with a loopback fixture API. Arguments: backend checkout and screenshot directory."""
from pathlib import Path
import os,sys,subprocess,json,urllib.request,importlib.util,urllib.parse
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("pilot",root/'recovery/pilot-mobile.py')
pilot=importlib.util.module_from_spec(spec);spec.loader.exec_module(pilot)
backend=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]);out.mkdir(exist_ok=True,parents=True)
class Scenario:
 def __init__(self,server,w):
  self.player=10001;self.balance=17800;self.init_data=server['init'];self.url=server['url'];self.w=w
 def routes(self,path):return path.startswith('/api/championship/')
 def forward(self,r,headers):
  u=urllib.parse.urlsplit(r.request.url)
  request=urllib.request.Request(self.url+u.path,data=r.request.post_data.encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(request) as response:r.fulfill(status=response.status,body=response.read(),headers=headers)
 def exercise(self,p):
  trigger=p.locator('#homeBoostAction')
  if trigger.get_attribute('data-focus')!='weekly':
   p.locator('#tabTasks').tap();trigger=p.locator('#boostSheet [data-open-weekly]')
  trigger.tap()
  dlg=p.get_by_role('dialog',name='Weekly Championship')
  expect(dlg.get_by_role('heading',name='Owner practice')).to_be_visible()
  select=dlg.get_by_label('Challenge',exact=True)
  assert select.locator('option').count()==30
  select.select_option('6')
  dlg.get_by_text('Official championship prizes and rules').click()
  p.screenshot(path=str(out/f'owner-{self.w}.png'))
  dlg.get_by_role('button',name='Start practice').tap()
  expect(dlg.get_by_text('Round 1 of 5')).to_be_visible()
  p.screenshot(path=str(out/f'board-{self.w}.png'))
  assert dlg.evaluate('d=>d.scrollWidth<=d.clientWidth+1')
  dlg.get_by_role('button',name='Back to challenges').tap()
  dlg.get_by_role('button',name='Resume Ascending').tap()
  for i in range(5):
   expect(dlg.get_by_text(f'Round {i+1} of 5')).to_be_visible()
   submit=dlg.get_by_role('button',name='Submit answer')
   tiles=submit.locator('..').locator('button').all()
   for _,button in sorted([(int(b.inner_text()),b) for b in tiles if b.inner_text().isdigit()]):
    button.tap()
   submit.tap()
  expect(dlg.get_by_text('Result · 1000 / 1,000')).to_be_visible()
  dlg.get_by_role('button',name='Choose another challenge').tap()
  expect(select).to_be_visible()
  dlg.get_by_role('button',name='Close',exact=True).tap()
  expect(dlg).to_have_count(0)
  print('PASS',self.w,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH'),args=['--no-sandbox'])
 for w,h in [(320,568),(390,746),(430,832)]:
  proc=subprocess.Popen(['node',str(backend/'recovery/owner-practice-browser-server.cjs')],stdout=subprocess.PIPE,text=True)
  try: pilot.check(b,w,h,Scenario(json.loads(proc.stdout.readline()),w))
  finally:proc.terminate();proc.wait()
 b.close()
