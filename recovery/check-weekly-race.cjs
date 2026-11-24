'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.JigPilot={'));
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const pending=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function setup({daily=true,used=false}={}){
 let identity=111,ready=true,now=Date.parse(daily?'2026-11-24T12:00:00Z':'2026-11-19T12:00:00Z'),serial=0;
 const els={},calls=[],routes={},timers=[],storage=new Map();
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const element=()=>{const classes=new Set();return{style:{},dataset:{},attributes:{},listeners:{},innerHTML:'',textContent:'',disabled:false,hidden:false,scrollTop:0,
  classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)},
  setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},hasAttribute(k){return k in this.attributes;},removeAttribute(k){delete this.attributes[k];},
  addEventListener(k,f){this.listeners[k]=f;},replaceChildren(){this.innerHTML='';},focus(){},querySelector(){return element();}};};
 const el=id=>els[id]||(els[id]=element());
 function run(mode='ranked',patch={}){return{id:'race-'+(++serial),mode,slot:mode==='practice'?null:2,turn:0,score:0,ends_at:new Clock(now+45000).toISOString(),live:true,board:{target:9,tiles:[2,7,5,3,4,6]},allowance_day:new Clock().toISOString().slice(0,10),...patch};}
 function data(scope='global'){
  const day=new Clock().toISOString().slice(0,10),week=daily?'2026-11-23':'2026-11-16',closes_at=daily?'2026-11-30T00:00:00Z':'2026-11-23T00:00:00Z';
  return{ok:true,telegram_id:String(identity),server_now:new Clock().toISOString(),scope,week,closes_at,allowance_day:day,
   policy:{version:daily?'daily-v16':'weekly-v14',period:daily?'day':'week',limit:3,activates_at:'2026-11-23T00:00:00.000Z'},
   resets_at:daily?new Clock(Date.parse(day+'T00:00:00Z')+86400000).toISOString():closes_at,
   runs_left:used?0:2,can_start:!used,seconds:45,best:8,place:1,total:1,global_place:1,
   leaders:[{name:'You',score:8,place:1,me:true,finish:'rank-1',vip_active:false}],run:null,practice_run:null,result:null,rival:null,last_award:null,share_code:'a'.repeat(20)};
 }
 const response=r=>({ok:true,telegram_id:String(identity),server_now:new Clock().toISOString(),run:r});
 const ctx={console,Date:Clock,performance:{now:()=>now},Number,String,Math,Promise,Map,Set,URLSearchParams,location:{search:'',hash:''},navigator:{},
  crypto:{randomUUID:()=>`ticket-${++serial}`},setInterval:f=>timers.push(f),state:{vipUntil:null},HOME_TIERS:Array(8).fill({}),homeConfirmedBalance:20635,
  document:{hidden:false,getElementById:el,createElement:element,body:{append:n=>els[n.id]=n},addEventListener(){},querySelector:()=>({dataset:{finish:'rank-1'}}),
   querySelectorAll:selector=>selector==='[data-vip-origin]'?[...html.matchAll(/data-vip-origin="([^"]+)"/g)].map(match=>el('crown-'+match[1])):[]},
  window:{JigChampionship:{open:async()=>false}},accountIsReady:()=>ready,homeUserId:()=>identity,setCoinArtwork(){},renderCollectibleCoin(){},homeGoalModel:()=>({tier:1}),renderHomeSession(){},renderBoostCards(){},renderVault(){},
  showToast(){},launchEquipped:()=>false,previewMint(){},openVipOffer(){},tabFarm:{},openFriendsSheet:()=>calls.push({action:'invite'}),
  backToHome:()=>Object.values(els).forEach(n=>n.classList.remove('show')),showAppSheet:sheet=>sheet.classList.add('show'),
  mintFinishArtwork:key=>'<img data-finish="'+key+'">',mintFinishName:key=>key,lbVipBadge:()=>'',
  escapeHtml:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  appStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  apiPost:async(path,body,options)=>{
   calls.push({path,body,options});if(routes[path])return typeof routes[path]==='function'?routes[path](body):routes[path];
   if(path==='/api/pilot/profile')return{ok:true,telegram_id:String(identity),vip_coin:false,refill:true,medals:[]};
   if(path==='/api/weekly/standings')return data(body.scope);
   if(path.endsWith('/start'))return response(run(path.includes('/practice/')?'practice':'ranked'));
   if(path.endsWith('/answer'))return response(run(path.includes('/practice/')?'practice':'ranked',{id:body.id,turn:body.turn+1,score:1}));
   return{ok:false};
  }
 };
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const click=dataset=>{const b={dataset,disabled:false};els.weeklySheet.listeners.click({target:{closest:()=>b}});};
 return{ctx,calls,el,routes,timers,storage,data,run,response,click,open:()=>ctx.window.JigPilot.openRace(),owner:value=>identity=value,ready:value=>ready=value,time:value=>now=value};
}
test('the current week keeps its original allowance and the next policy clearly uses UTC days',async()=>{
 const old=setup({daily:false});await old.open();assert.match(old.el('weeklyBoard').innerHTML,/2 of 3 ranked runs left this week/);assert.match(old.el('weeklyBoard').innerHTML,/This week keeps its original 3-run limit/);assert.match(old.el('weeklyResetClock').textContent,/Next weekly allowance/);
 const next=setup();await next.open();assert.match(next.el('weeklyBoard').innerHTML,/2 of 3 ranked runs left today/);assert.match(next.el('weeklyBoard').innerHTML,/Three ranked runs per UTC day/);assert.match(next.el('weeklyResetClock').textContent,/Ranked runs reset in 12h 0m/);
});
test('a lost ranked-start response retains the request key for retry and a later UTC day uses its own key',async()=>{
 const h=setup();await h.open();h.routes['/api/weekly/start']={ok:false,reason:'NETWORK'};h.click({raceAction:'start'});await flush();
 const first=h.calls.find(c=>c.path==='/api/weekly/start').body.request_key;assert.equal(h.storage.get('jc_weekly_start:111:2026-11-24'),first);
 h.click({raceAction:'start'});await flush();assert.equal(h.calls.filter(c=>c.path==='/api/weekly/start')[1].body.request_key,first);
 h.time(Date.parse('2026-11-25T00:00:00Z'));h.timers[0]();await flush();delete h.routes['/api/weekly/start'];h.click({raceAction:'start'});await flush();
 const last=h.calls.filter(c=>c.path==='/api/weekly/start').at(-1);assert.notEqual(last.body.request_key,first);assert.equal(h.storage.has('jc_weekly_start:111:2026-11-25'),false);assert.match(h.el('weeklyBoard').innerHTML,/Ranked run 2 of 3/);
});
test('exhausted ranked attempts still permit practice and practice answers never call ranked endpoints',async()=>{
 const h=setup({used:true});await h.open();assert.match(h.el('weeklyBoard').innerHTML,/Ranked runs used today/);h.click({raceAction:'practice'});await flush();assert.match(h.el('weeklyBoard').innerHTML,/Practice · unranked/);
 h.click({tile:'0'});h.click({tile:'1'});await flush();assert.equal(h.calls.filter(c=>c.path==='/api/weekly/practice/start').length,1);assert.equal(h.calls.filter(c=>c.path==='/api/weekly/practice/answer').length,1);assert.equal(h.calls.filter(c=>/^\/api\/weekly\/(start|answer)$/.test(c.path)).length,0);assert.match(h.el('weeklyBoard').innerHTML,/1 pair scored/);
 h.click({raceAction:'lobby'});await flush();assert.match(h.el('weeklyBoard').innerHTML,/0 of 3 ranked runs left today/);
});
test('entering a run resets lobby scroll while tile selections and confirmed answers preserve game scroll',async()=>{
 for(const mode of ['ranked','practice']){
  const h=setup(),path=mode==='practice'?'/api/weekly/practice':'/api/weekly';await h.open();
  const run=h.run(mode);h.routes[path+'/start']=h.response(run);h.routes[path+'/answer']=h.response({...run,turn:1,score:1});
  h.el('weeklyScroll').scrollTop=420;h.click({raceAction:mode==='practice'?'practice':'start'});await flush();
  assert.equal(h.el('weeklyScroll').scrollTop,0,mode+' opens at the run clock');
  h.el('weeklyScroll').scrollTop=96;h.click({tile:'0'});assert.equal(h.el('weeklyScroll').scrollTop,96);
  h.click({tile:'0'});assert.equal(h.el('weeklyScroll').scrollTop,96);
  h.click({tile:'0'});h.click({tile:'1'});await flush();assert.equal(h.el('weeklyScroll').scrollTop,96);
  assert.match(h.el('weeklyBoard').innerHTML,/1 pair scored/);
 }
});
test('returning to the same active ranked or practice run resets scroll once on resume',async()=>{
 for(const mode of ['ranked','practice']){
  const h=setup(),path=mode==='practice'?'/api/weekly/practice':'/api/weekly';await h.open();
  const run=h.run(mode);h.routes[path+'/start']=h.response(run);h.click({raceAction:mode==='practice'?'practice':'start'});await flush();
  h.click({raceAction:'close'});const standings=h.data();standings[mode==='practice'?'practice_run':'run']=run;h.routes['/api/weekly/standings']=standings;
  h.el('weeklyScroll').scrollTop=300;await h.open();
  if(mode==='practice'){h.el('weeklyScroll').scrollTop=300;h.click({raceAction:'practice'});await flush();}
  assert.equal(h.el('weeklyScroll').scrollTop,0,mode+' resumes at the run clock');
  h.el('weeklyScroll').scrollTop=70;h.click({tile:'0'});assert.equal(h.el('weeklyScroll').scrollTop,70);
 }
});
test('practice retains one start key during the active run and creates a fresh key only after a confirmed end',async()=>{
 const h=setup({used:true});await h.open();const practice=h.run('practice');h.routes['/api/weekly/practice/start']=h.response(practice);h.click({raceAction:'practice'});await flush();
 const key=h.storage.get('jc_weekly_practice:111');assert.ok(key);assert.equal(h.storage.get('jc_weekly_practice:111:run'),practice.id);
 h.click({raceAction:'practice'});await flush();assert.equal(h.calls.filter(c=>c.path==='/api/weekly/practice/start').at(-1).body.request_key,key);
 h.routes['/api/weekly/practice/answer']=h.response({...practice,live:false,turn:1,score:1,board:null});h.click({tile:'0'});h.click({tile:'1'});await flush();assert.equal(h.storage.has('jc_weekly_practice:111'),false);assert.equal(h.storage.has('jc_weekly_practice:111:run'),false);assert.match(h.el('weeklyBoard').innerHTML,/Practice complete · unranked/);
 h.routes['/api/weekly/practice/start']=h.response(h.run('practice'));h.click({raceAction:'practice'});await flush();assert.notEqual(h.calls.filter(c=>c.path==='/api/weekly/practice/start').at(-1).body.request_key,key);
});
test('an active run from the previous UTC day resumes without consuming a new start',async()=>{
 const h=setup();h.time(Date.parse('2026-11-24T00:00:05Z'));const d=h.data();d.runs_left=3;d.run=h.run('ranked',{allowance_day:'2026-11-23',slot:3});h.routes['/api/weekly/standings']=d;await h.open();
 assert.match(h.el('weeklyBoard').innerHTML,/Ranked run 3 of 3 · 23 Nov 2026/);assert.equal(h.calls.filter(c=>c.path==='/api/weekly/start').length,0);
 h.time(Date.parse(d.run.ends_at)+1000);delete h.routes['/api/weekly/standings'];h.timers[0]();await flush();assert.match(h.el('weeklyBoard').innerHTML,/ranked runs left today/);
});
test('a previously available lobby closes ranked entry when less than one full run remains in the week',async()=>{
 const h=setup();h.time(Date.parse('2026-11-29T23:59:00Z'));await h.open();assert.match(h.el('weeklyBoard').innerHTML,/Start ranked run 2/);
 h.time(Date.parse('2026-11-29T23:59:16Z'));h.timers[0]();assert.match(h.el('weeklyBoard').innerHTML,/Weekly race closing/);h.click({raceAction:'start'});await flush();assert.equal(h.calls.filter(c=>c.path==='/api/weekly/start').length,0);assert.match(h.el('weeklyBoard').innerHTML,/Play practice/);
});
test('practice rejects a ranked response or an invalid clock without losing its retry key',async()=>{
 for(const corrupt of [h=>h.response(h.run('ranked')),h=>({...h.response(h.run('practice')),server_now:'invalid'}),h=>h.response(null)]){
  const h=setup();await h.open();h.routes['/api/weekly/practice/start']=corrupt(h);h.click({raceAction:'practice'});await flush();assert.match(h.el('weeklyStatus').textContent,/Practice could not be opened/);assert.equal(h.storage.has('jc_weekly_practice:111'),true);assert.doesNotMatch(h.el('weeklyBoard').innerHTML,/pilot-tiles/);
 }
});
test('scope changes request the selected group and refuse mismatched or malformed standings',async()=>{
 const h=setup();await h.open();h.routes['/api/weekly/standings']=h.data('global');h.click({weeklyScope:'friends'});await flush();assert.equal(h.calls.at(-1).body.scope,'friends');assert.match(h.el('weeklyStatus').textContent,/could not be loaded/);assert.doesNotMatch(h.el('weeklyBoard').innerHTML,/8 <em>/);
 delete h.routes['/api/weekly/standings'];h.click({raceAction:'reload'});await flush();assert.match(h.el('weeklyBoard').innerHTML,/Your weekly best · Friends/);
 const malformed=h.data('friends');malformed.allowance_day=undefined;h.routes['/api/weekly/standings']=malformed;h.click({raceAction:'reload'});await flush();assert.match(h.el('weeklyStatus').textContent,/could not be loaded/);
});
test('a delayed start for a previous account cannot display its board under the new account',async()=>{
 const h=setup();await h.open();const p=pending(),old=h.response(h.run());h.routes['/api/weekly/start']=p.promise;h.click({raceAction:'start'});h.owner(222);await h.ctx.window.JigPilot.sync(true);await h.open();p.resolve(old);await flush();
 assert.doesNotMatch(h.el('weeklyBoard').innerHTML,/pilot-tiles/);assert.match(h.el('weeklyBoard').innerHTML,/Your weekly best/);assert.equal(h.storage.has('jc_weekly_start:111:2026-11-24'),true);
});
test('result and award validation reject incomplete records and escape real player names',async()=>{
 const h=setup(),d=h.data();d.leaders[0].name='<img onerror=bad()>';d.leaders[0].me=false;d.last_award={week:'2026-11-16',score:8,place:1,awarded_at:'2026-11-23T00:00:00Z'};h.routes['/api/weekly/standings']=d;await h.open();assert.match(h.el('weeklyBoard').innerHTML,/&lt;img onerror=bad\(\)&gt;/);assert.match(h.el('weeklyBoard').innerHTML,/Your confirmed gold medal/);
 d.result={code:'a'.repeat(32),week:d.week,margin:2,players:[]};h.click({raceAction:'reload'});await flush();assert.match(h.el('weeklyStatus').textContent,/could not be loaded/);assert.doesNotMatch(h.el('weeklyBoard').innerHTML,/Your confirmed gold medal/);
});
