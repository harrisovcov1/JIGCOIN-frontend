from playwright.sync_api import sync_playwright
import json,pathlib,sys,os
boards=json.load(open(sys.argv[1]))
out=pathlib.Path(sys.argv[2]);out.mkdir(exist_ok=True)
rows=[]
with sync_playwright() as w:
 b=w.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
 for i,board in enumerate(boards):
  width,height=[(320,568),(390,746),(430,832)][i%3]
  page=b.new_page(viewport={'width':width,'height':height},has_touch=True)
  page.route('http://localhost/**',lambda r:r.fulfill(body='<html><meta charset=utf-8><title>Championship QA</title></html>',content_type='text/html'))
  page.goto('http://localhost/');page.add_style_tag(path='assets/championship.css');page.add_script_tag(path='assets/championship.js')
  page.clock.install()
  page.evaluate("""async board=>{window.submitted=null;let lastTile,frameIndex=0;await JigChampionship.open(async(route,body)=>{
   if(route.endsWith('status'))return {active:true,name:board.name,close:'2026-11-30',remaining:{practice:1,ranked:3},daily:Array(7).fill(0),podium:0,rows:[],history:[]};
   if(route.endsWith('start'))return {...board,id:'fixture',round:0};
   if(route.endsWith('observe')){
    const p=board.private,frames=p.crossings||(p.hidden?[p.faces]:p.flash?[p.reveal]:p.reveal)||[];
    return frameIndex<frames.length?{frame:frames[frameIndex++],wait:250}:{done:true};
   }
   if(route.endsWith('flip')){
    const faces=board.private.faces,matched=body.step%2===1&&faces[lastTile]===faces[body.tile];
    lastTile=body.tile;return {face:faces[body.tile],matched};
   }
   window.submitted=body.actions;return {name:board.name,id:'fixture',round:5,finished:true,score:1000};});}""",{k:board[k] for k in ['name','board','variant','private']})
  if i<3:page.screenshot(path=str(out/f'lobby-{width}.png'))
  page.get_by_role('button',name='Practice',exact=False).click()
  page.clock.run_for(12000)
  submit=page.get_by_role('button',name='Submit answer')
  submit.wait_for()
  assert page.locator('dialog').evaluate('d=>d.scrollWidth<=d.clientWidth+1')
  page.screenshot(path=str(out/f'{i+1:02}-{width}.png'))
  tray=submit.locator('..').locator('button')
  for a in board['actions']:tray.nth(a).click()
  submit.click()
  observed=page.evaluate('window.submitted')
  assert observed==board['actions'],board['name']
  rows.append({'name':board['name'],'actions':observed,'viewport':[width,height]})
  page.close()
 b.close()
json.dump(rows,open(out/'submitted.json','w'))
