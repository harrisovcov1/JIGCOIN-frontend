'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const rewardedSDKs ='),html.indexOf('// Unified Rewards.'));
const code='sp_emergency_energy',ymid='12345678-1234-4123-8123-123456789abc';
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function setup({failure,loadFailure=false,result={reward_event_type:'valued'},sdkLoaded=true}={}){
  let at=0,sequence=0,owner=101,visible=true;const timers=new Map(),calls=[],scripts=[];
  class ClockDate extends Date {static now(){return 1000000+at;}}
  const mission={code,provider:'monetag',status:'available',zone_id:'123'};
  const handler=async options=>{calls.push({options});if(failure&&options.type==='preload')throw Error(failure);return options.type==='preload'?undefined:result;};
  const ctx={Map,Error,Promise,Date:ClockDate,queueMicrotask,performance:{now:()=>at},navigator:{onLine:true},
    setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:at+delay});return id;},clearTimeout:id=>timers.delete(id),
    homeUserId:()=>owner,accountIsReady:()=>true,missionsOwner:101,hubMissions:[mission],state:{energy:3},maxEnergy:55,
    __tapFlushing:false,getPendingTaps:()=>0,getTapQueue:()=>[],readRecoveryQueue:()=>({pending:0,packet:null}),homeEnergyLow:(energy,max)=>energy<=max*.2,
    window:{JigPilot:{canRefill:()=>true}},boostSheet:{classList:{contains:()=>visible}},
    document:{hidden:false,getElementById:()=>({inert:!visible}),querySelector:()=>visible?null:{},createElement:()=>({dataset:{},remove(){this.removed=true;}}),head:{appendChild(script){scripts.push(script);queueMicrotask(()=>{if(loadFailure)script.onerror();else{ctx.window.show_123=handler;script.onload();}});}}},
    useMissionOwner(){},syncStateIfIdle:async()=>{calls.push({sync:true});},refreshBoostMissions:async()=>{calls.push({missions:true});return [mission];},
    renderBoostCards(){},renderHomeSession(){},
    apiPost:async(path,body)=>{calls.push({path,body});return {ok:true,provider:'monetag',zone_id:'123',ymid,request_var:code};}
  };
  if(sdkLoaded)ctx.window.show_123=handler;
  vm.createContext(ctx);vm.runInContext('let adNotice=null;'+source,ctx);vm.runInContext('refillPreparation={status:"idle",owner:101};',ctx);
  return {ctx,calls,scripts,mission,prepare:manual=>ctx.prepareMonetagRefill(manual),watch:()=>ctx.runMonetagQuest(code,()=>visible),
    prepared:()=>vm.runInContext('refillPreparation',ctx),outcomes:()=>calls.filter(x=>x.path==='/api/mission/outcome').map(x=>x.body),
    setVisible:v=>visible=v,setOwner:v=>owner=v,
    advance(ms){at+=ms;for(const [id,item] of [...timers])if(item.at<=at){timers.delete(id);item.fn();}}
  };
}
test('preparation loads the SDK and makes one server attempt/preload but never displays or grants',async()=>{
  const h=setup({sdkLoaded:false});await h.prepare();
  assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].dataset.zone,'123');
  assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,1);
  assert.deepEqual(h.calls.filter(x=>x.options).map(x=>x.options.type),['preload']);
  assert.equal(h.calls.find(x=>x.options).options.timeout,15);assert.equal(h.prepared().status,'ready');
  assert.equal(h.mission.status,'pending');assert.equal(h.calls.some(x=>x.path==='/api/mission/complete'),false);
});
test('SDK bootstrap handoff during mission start uses the current handler for preload',async()=>{
  const h=setup({sdkLoaded:false}),bootstrapCalls=[],liveCalls=[];let finishStart;
  // The real SDK exposes a queue stub before onload, then replaces that global
  // after initialization. Calls added to the old, already-drained queue stall.
  function bootstrap(options){bootstrapCalls.push(options);return new Promise(()=>{});}
  function live(options){liveCalls.push({options,receiver:this});return Promise.resolve();}
  h.ctx.document.head.appendChild=script=>{
    h.scripts.push(script);queueMicrotask(()=>{h.ctx.window.show_123=bootstrap;script.onload();});
  };
  const api=h.ctx.apiPost;
  h.ctx.apiPost=(path,body)=>{
    const response=api(path,body);
    return path==='/api/mission/start'?new Promise(resolve=>{finishStart=()=>resolve(response);}):response;
  };
  const preparing=h.prepare();await settle();assert.equal(typeof finishStart,'function');
  h.ctx.window.show_123=live;finishStart();await settle();
  h.advance(18000);await preparing;
  assert.equal(bootstrapCalls.length,0);
  assert.deepEqual(liveCalls.map(x=>x.options.type),['preload']);
  assert.equal(liveCalls[0].receiver,h.ctx.window);assert.equal(h.prepared().status,'ready');
});
test('SDK bootstrap queued preload drains once and Watch synchronously uses the replacement handler',async()=>{
  const h=setup(),queued=[],bootstrapCalls=[],liveCalls=[];
  function bootstrap(options){bootstrapCalls.push(options);return new Promise((resolve,reject)=>queued.push({options,resolve,reject}));}
  function live(options){liveCalls.push({options,receiver:this});return Promise.resolve(options.type==='preload'?undefined:{reward_event_type:'valued'});}
  h.ctx.window.show_123=bootstrap;
  const preparing=h.prepare();await settle();assert.equal(queued.length,1);assert.equal(queued[0].options.type,'preload');
  h.ctx.window.show_123=live;
  for(const item of queued.splice(0))Promise.resolve(live.call(h.ctx.window,item.options)).then(item.resolve,item.reject);
  await preparing;h.calls.length=0;
  const watching=h.watch(),immediateCalls=liveCalls.map(x=>x.options.type);
  // Settle an incorrectly queued end as cleanup so the pre-fix regression
  // reports an assertion failure instead of leaving an unfinished test.
  for(const item of queued.splice(0))item.resolve({reward_event_type:'valued'});
  await watching;
  assert.deepEqual(bootstrapCalls.map(x=>x.type),['preload']);
  assert.deepEqual(immediateCalls,['preload','end']);
  assert.ok(liveCalls.every(x=>x.receiver===h.ctx.window));
  assert.deepEqual(JSON.parse(JSON.stringify(liveCalls[1].options)),{ymid,requestVar:code,type:'end',timeout:2});
  assert.equal(h.calls.some(x=>x.path==='/api/mission/start'),false);
});
test('SDK live handler lookup fails clearly if the global disappears after either loader path',async()=>{
  for(const sdkLoaded of [true,false]){
    const h=setup({sdkLoaded}),show=await h.ctx.ensureMonetagSDK('123');
    delete h.ctx.window.show_123;
    assert.throws(()=>show({ymid,requestVar:code,type:'preload'}),/AD_SDK_FUNCTION_MISSING/);
    assert.equal(h.calls.some(x=>x.options),false);
  }
});
test('Watch invokes end synchronously with the same identity and no preceding API/preload/SDK load',async()=>{
  const h=setup();await h.prepare();h.calls.length=0;
  const watching=h.watch();
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.type,'end');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].options)),{ymid,requestVar:code,type:'end',timeout:2});
  assert.equal(h.prepared().status,'consumed');await watching;
  await assert.rejects(h.watch(),/AD_NOT_READY/);
  assert.equal(h.calls.filter(x=>x.options?.type==='end').length,1);
});
test('no-fill and provider timeout leave no enabled or late display; automatic preparation never retries',async()=>{
  for(const [failure,expected] of [['Empty feed','NO_FILL'],['Timeout','SDK_TIMEOUT'],['Network error','NETWORK_ERROR']]){
    const h=setup({failure});await h.prepare();assert.equal(h.prepared().status,'failed');
    assert.equal(h.outcomes()[0].error_code,expected);assert.equal(h.outcomes()[0].attempt_id,ymid);
    h.mission.status='available';await h.prepare();h.ctx.requestRefillPreparation();await settle();
    assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,1);await assert.rejects(h.watch(),/AD_NOT_READY/);
  }
});
test('manual retry waits for server availability and never turns pending into a second start',async()=>{
  const h=setup({failure:'Timeout'});await h.prepare();await h.prepare(true);
  assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,1);
  h.advance(60000);h.mission.status='available';await h.prepare(true);
  assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,2);
});
test('a fresh prepared refill survives expected pending and natural regeneration above20%',async()=>{
  const h=setup();await h.prepare();h.ctx.state.energy=14;h.ctx.reconcileRefillPreparation();
  assert.equal(h.ctx.preparedRefillFor(),h.prepared());assert.equal(h.prepared().status,'ready');
  await h.watch();assert.equal(h.calls.filter(x=>x.options?.type==='end').length,1);
});
test('ready state expires locally after30s with no auto-refresh or late display',async()=>{
  const h=setup();await h.prepare();h.advance(29999);assert.ok(h.ctx.preparedRefillFor());
  h.advance(1);assert.equal(h.ctx.preparedRefillFor(),null);assert.equal(h.prepared().status,'expired');
  await assert.rejects(h.watch(),/AD_NOT_READY/);assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,1);
});
test('claimable receipts, cooldown, unavailable, changed zone and full energy supersede a prepared advert',async()=>{
  for(const condition of ['claimable','cooldown','unavailable','zone','full']){
    const h=setup();await h.prepare();
    if(condition==='zone')h.mission.zone_id='456';else if(condition==='full')h.ctx.state.energy=55;else h.mission.status=condition;
    h.ctx.reconcileRefillPreparation();assert.equal(h.ctx.preparedRefillFor(),null);await assert.rejects(h.watch(),/AD_NOT_READY/);
  }
});
test('preparation waits for ordinary and recovery tap commits without consuming its automatic opportunity',async()=>{
  for(const kind of ['ordinary','recovery']){
    const h=setup();if(kind==='ordinary')h.ctx.getPendingTaps=()=>2;else{h.ctx.window.__lastState={recovery_gameplay:true};h.ctx.readRecoveryQueue=()=>({pending:2});}
    await h.prepare();assert.equal(h.calls.length,0);
    h.ctx.getPendingTaps=()=>0;h.ctx.readRecoveryQueue=()=>({pending:0});await h.prepare();assert.equal(h.prepared().status,'ready');
  }
});
test('server energy threshold race is ordinary unavailability with manual recovery and no provider call',async()=>{
  const h=setup(),api=h.ctx.apiPost;h.ctx.apiPost=(path,body)=>path==='/api/mission/start'?Promise.resolve({ok:false,error:'ENERGY_ABOVE_REFILL_THRESHOLD'}):api(path,body);
  await h.prepare();assert.equal(h.prepared().status,'failed');assert.equal(h.outcomes().length,0);assert.equal(h.calls.some(x=>x.options),false);
});
test('parallel requests create one preload and abandoned context cannot enable a late advert or remain loading',async()=>{
  const h=setup();let finish;h.ctx.window.show_123=options=>{h.calls.push({options});return new Promise(r=>finish=r);};
  const preparing=h.prepare();await settle();const second=h.prepare(true);h.setVisible(false);finish();await Promise.all([preparing,second]);
  assert.equal(h.prepared().status,'cancelled');assert.equal(h.calls.filter(x=>x.options).length,1);h.setVisible(true);await assert.rejects(h.watch(),/AD_NOT_READY/);
});
test('account change invalidates a ready token and late preparation cannot cross owners',async()=>{
  const h=setup();await h.prepare();h.setOwner(202);h.ctx.reconcileRefillPreparation();await assert.rejects(h.watch(),/AD_NOT_READY/);
  assert.equal(h.calls.filter(x=>x.options?.type==='end').length,0);
});
test('stalled preload reaches18s watchdog, stays fenced until SDK settles, and never auto-displays',async()=>{
  const h=setup();let finish;h.ctx.window.show_123=options=>{h.calls.push({options});return new Promise(r=>finish=r);};
  const preparing=h.prepare();await settle();h.advance(17999);await settle();assert.equal(h.outcomes().length,0);
  h.advance(1);await preparing;assert.equal(h.outcomes()[0].error_code,'PRELOAD_DEADLINE');assert.equal(h.outcomes()[0].elapsed_ms,18000);
  h.mission.status='available';await h.prepare(true);assert.equal(h.calls.filter(x=>x.options).length,1);
  finish();await settle();assert.equal(h.prepared().status,'failed');await assert.rejects(h.watch(),/AD_NOT_READY/);
});
test('a14s preload becomes ready without displaying;75s viewing has no application deadline',async()=>{
  const h=setup();let finishPreload,finishDisplay;
  h.ctx.window.show_123=options=>{h.calls.push({options});return new Promise(r=>{if(options.type==='preload')finishPreload=r;else finishDisplay=r;});};
  const preparing=h.prepare();await settle();h.advance(14000);finishPreload();await preparing;
  assert.equal(h.calls.filter(x=>x.options?.type==='end').length,0);const watching=h.watch();
  h.advance(75000);await settle();assert.equal(h.outcomes().length,0);
  finishDisplay({reward_event_type:'valued'});await watching;assert.equal(h.outcomes()[0].elapsed_ms,75000);
});
test('cache-loading timeout after Watch is reported at display and never starts another preload',async()=>{
  const h=setup();await h.prepare();h.prepared().show=options=>{h.calls.push({options});return Promise.reject(Error('Timeout'));};
  await assert.rejects(h.watch(),e=>e.adStage==='display'&&e.adCode==='SDK_TIMEOUT');
  assert.equal(h.calls.filter(x=>x.options?.type==='preload').length,1);assert.equal(h.outcomes()[0].stage,'display');
});
test('unpaid or absent SDK results never grant a reward',async()=>{
  for(const result of [{reward_event_type:'non_valued'},undefined]){
    const h=setup({result});await h.prepare();
    if(result)await assert.rejects(h.watch(),/AD_NOT_REWARDED/);else await h.watch();
    assert.equal(h.calls.some(x=>x.path==='/api/mission/complete'),false);
  }
});
test('failed SDK load creates no attempt and needs an explicit new preparation',async()=>{
  const h=setup({sdkLoaded:false,loadFailure:true});await h.prepare();
  assert.equal(h.outcomes()[0].error_code,'SDK_LOAD_FAILED');assert.equal(h.calls.some(x=>x.path==='/api/mission/start'),false);
  await h.prepare();assert.equal(h.scripts.length,1);
});
test('wrong placement returned by start never reaches provider',async()=>{
  const h=setup();h.ctx.apiPost=async(path,body)=>{h.calls.push({path,body});return {ok:true,provider:'monetag',zone_id:'123',ymid,request_var:'wrong'};};
  await h.prepare();assert.equal(h.calls.some(x=>x.options),false);assert.equal(h.outcomes()[0].error_code,'INVALID_ATTEMPT');
});
test('diagnostic duration remains bounded and optional',async()=>{
  for(const [duration,expected] of [[15000.8,15000],[-1,0],[400000,300000],[undefined,undefined],[NaN,undefined],['15000',undefined]]){
    const h=setup();h.ctx.reportAdOutcome(code,101,ymid,'preload','SDK_TIMEOUT',duration);await settle();assert.equal(h.outcomes()[0].elapsed_ms,expected);
  }
});
test('observed claim cooldown rearms one automatic preparation but a failed retry window does not',async()=>{
  const h=setup();await h.prepare();await h.watch();
  h.mission.status='cooldown';h.ctx.reconcileRefillPreparation();h.ctx.requestRefillPreparation();await settle();
  assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,1);
  h.advance(300000);h.mission.status='available';h.ctx.reconcileRefillPreparation();h.ctx.requestRefillPreparation();await settle();
  assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,2);
  h.ctx.requestRefillPreparation();await settle();assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,2);
});
test('being in cooldown does not spend the next automatic preparation opportunity',async()=>{
  const h=setup();h.mission.status='cooldown';h.ctx.requestRefillPreparation();await settle();assert.equal(h.calls.length,0);
  h.mission.status='available';h.ctx.requestRefillPreparation();await settle();assert.equal(h.prepared().status,'ready');
});
test('a late SDK return after the player cancels viewing produces no trailing outcome',async()=>{
  const h=setup();await h.prepare();let finish;
  h.prepared().show=options=>{h.calls.push({options});return new Promise(r=>finish=r);};
  const watching=h.watch();h.setVisible(false);h.ctx.invalidateRefillPreparation();finish({reward_event_type:'valued'});await watching;
  assert.equal(h.outcomes().length,0);assert.equal(h.calls.filter(x=>x.options?.type==='end').length,1);
});
test('eligibility reason fields are handled without classifying them as provider failure',async()=>{
  const h=setup(),api=h.ctx.apiPost;
  h.ctx.apiPost=(path,body)=>path==='/api/mission/start'?Promise.resolve({ok:false,reason:'ENERGY_ABOVE_REFILL_THRESHOLD'}):api(path,body);
  await h.prepare();assert.equal(h.outcomes().length,0);assert.equal(h.prepared().status,'failed');
});
