'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const rewardedSDKs ='),html.indexOf('// Unified Rewards.'));
const code='sp_emergency_energy',ymid='12345678-1234-4123-8123-123456789abc';
function setup({result={reward_event_type:'valued'},failure,loadFailure=false,failureStage='preload'}={}) {
  const calls=[],scripts=[],stages=[];
  let owner=101,visible=true;
  const ctx={Map,Error,Promise,setTimeout,clearTimeout,performance:{now:()=>0},
    homeUserId:()=>owner,accountIsReady:()=>true,missionsOwner:101,
    hubMissions:[{code,provider:'monetag',status:'available',zone_id:'123'}],window:{},
    apiPost:async(path,body)=>{calls.push({path,body});return {ok:true,provider:'monetag',zone_id:'123',ymid,request_var:code};},
    document:{createElement:()=>({dataset:{},remove(){this.removed=true;}}),head:{appendChild(script){
      scripts.push(script);
      queueMicrotask(()=>{
        if(loadFailure){script.onerror();return;}
        ctx.window.show_123=async options=>{
          calls.push({options});
          if(failure && options.type===failureStage)throw Error(failure);
          return options.type==='preload'?undefined:result;
        };
        script.onload();
      });
    }}}
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,calls,scripts,stages,run:()=>ctx.runMonetagQuest(code,()=>visible,(stage,attempt)=>stages.push({stage,attempt})),
    setVisible:value=>visible=value,setOwner:value=>owner=value,setLoadFailure:value=>loadFailure=value};
}
test('SDK loads before an attempt; preload and display share the server-issued reward identity',async()=>{
  const h=setup();const result=await h.run();
  assert.equal(result.reward_event_type,'valued');
  assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].dataset.zone,'123');
  assert.equal(h.calls[0].path,'/api/mission/start');
  assert.deepEqual(h.calls.filter(x=>x.options).map(x=>x.options.type),['preload','end']);
  for(const {options} of h.calls.filter(x=>x.options)){assert.equal(options.ymid,ymid);assert.equal(options.requestVar,code);assert.equal(options.timeout,15);}
  assert.ok(h.calls.every(x=>x.path!=='/api/mission/complete'),'SDK results never authorize a client-side grant');
});
test('an unavailable advert never proceeds from preload to display or reports a reward',async()=>{
  const h=setup({failure:'Empty feed'});
  await assert.rejects(h.run(),/AD_NO_FILL/);
  assert.equal(h.calls.filter(x=>x.options?.type==='end').length,0);
});
test('an explicitly unpaid or early-closed advert is distinct from a delayed receipt',async()=>{
  const h=setup({result:{reward_event_type:'non_valued'}});
  await assert.rejects(h.run(),/AD_NOT_REWARDED/);
  assert.ok(h.calls.every(x=>x.path!=='/api/mission/complete'));
  const legacy=setup({result:null});
  assert.equal(await legacy.run(),null,'missing frontend result still requires checking the server receipt');
});
test('a failed SDK load creates no backend attempt and can recover on retry',async()=>{
  const h=setup({loadFailure:true});
  await assert.rejects(h.run(),/AD_SDK_UNAVAILABLE/);
  assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,0);assert.equal(h.scripts[0].removed,true);
  assert.equal(h.calls[0].body.error_code,'SDK_LOAD_FAILED');assert.equal(h.calls[0].body.attempt_id,null);
  h.setLoadFailure(false);await h.run();
  assert.equal(h.scripts.length,2);assert.equal(h.calls.filter(x=>x.path==='/api/mission/start').length,1);
});
test('leaving the panel before display prevents opening a late advert',async()=>{
  const h=setup();
  h.ctx.apiPost=async()=>{h.setVisible(false);return {ok:true,provider:'monetag',zone_id:'123',ymid,request_var:code};};
  await assert.rejects(h.run(),/AD_EXIT/);
  assert.equal(h.calls.length,0);
});
test('wrong account or placement from an attempt cannot be passed to the ad provider',async()=>{
  for(const change of ['account','placement']){
    const h=setup();
    h.ctx.apiPost=async()=>{
      if(change==='account')h.setOwner(202);
      return {ok:true,provider:'monetag',zone_id:'123',ymid,request_var:change==='placement'?'sp_double_points':code};
    };
    await assert.rejects(h.run(),change==='account'?/ACCOUNT_CHANGED/:/AD_INVALID_ATTEMPT/);assert.equal(h.calls.length,0);
  }
});
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function useClock(ctx){
  let at=0,sequence=0;const timers=new Map();
  ctx.performance={now:()=>at};
  ctx.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:at+delay});return id;};
  ctx.clearTimeout=id=>timers.delete(id);
  return {advance(ms){at+=ms;for(const [id,item] of [...timers])if(item.at<=at){timers.delete(id);item.fn();}}};
}
test('preload failures retain the verified attempt and report only a bounded failure code',async()=>{
  for(const [failure,errorCode] of [['Network error','NETWORK_ERROR'],['Timeout','SDK_TIMEOUT'],['Ad is not ready','AD_NOT_READY'],['Rejected','DISPLAY_REJECTED'],['unexpected provider data https://private.test/?secret=x','UNKNOWN']]){
    const h=setup({failure});await assert.rejects(h.run(),e=>e.adStage==='preload'&&e.adAttempt===ymid&&e.adCode===errorCode);
    const report=h.calls.find(x=>x.path==='/api/mission/outcome').body;
    assert.deepEqual(JSON.parse(JSON.stringify(report)),{code,attempt_id:ymid,stage:'preload',error_code:errorCode,elapsed_ms:0});
    assert.equal(h.calls.some(x=>x.options?.type==='end'),false);
  }
});
test('a display failure is distinguishable from a load failure and does not authorize a claim',async()=>{
  const h=setup({failure:'Failed to render Telegram banner',failureStage:'end'});
  await assert.rejects(h.run(),e=>e.adStage==='display'&&e.adCode==='DISPLAY_FAILED');
  assert.equal(h.calls.find(x=>x.path==='/api/mission/outcome').body.stage,'display');
  assert.equal(h.calls.filter(x=>x.options?.type==='end').length,1);
  assert.equal(h.calls.some(x=>x.path==='/api/mission/complete'),false);
});
test('a stalled preload stops after its bounded preparation deadline and cannot later open an advert',async()=>{
  const h=setup(),clock=useClock(h.ctx);let finish;
  h.ctx.window.show_123=options=>{h.calls.push({options});return new Promise(resolve=>{finish=resolve;});};
  const running=h.run();await settle();clock.advance(17999);await settle();
  assert.equal(h.calls.some(x=>x.path==='/api/mission/outcome'),false);
  clock.advance(1);
  await assert.rejects(running,e=>e.adStage==='preload'&&e.adCode==='PRELOAD_DEADLINE');
  finish();await settle();assert.equal(h.calls.filter(x=>x.options?.type==='end').length,0);
  const outcome=h.calls.find(x=>x.path==='/api/mission/outcome').body;
  assert.equal(outcome.attempt_id,ymid);assert.equal(outcome.elapsed_ms,18000);
});
test('a slow preload that finishes after eight seconds displays once within the new loading budget',async()=>{
  const h=setup(),clock=useClock(h.ctx);let finishPreload,finishDisplay;
  h.ctx.window.show_123=options=>{
    h.calls.push({options});
    return new Promise(resolve=>{if(options.type==='preload')finishPreload=resolve;else finishDisplay=resolve;});
  };
  const running=h.run();await settle();clock.advance(14000);finishPreload();await settle();
  assert.deepEqual(h.calls.filter(x=>x.options).map(x=>x.options.type),['preload','end']);
  clock.advance(75000);await settle();
  assert.equal(h.calls.some(x=>x.path==='/api/mission/outcome'),false,'the preparation watchdog is removed before viewing');
  finishDisplay({reward_event_type:'valued'});await running;
  const report=h.calls.find(x=>x.path==='/api/mission/outcome').body;
  assert.equal(report.stage,'display');assert.equal(report.elapsed_ms,75000,'elapsed time resets when display starts');
});
test('a provider timeout remains distinct from the application preparation deadline',async()=>{
  const h=setup(),clock=useClock(h.ctx);let rejectPreload;
  h.ctx.window.show_123=options=>{h.calls.push({options});return new Promise((_,reject)=>{rejectPreload=reject;});};
  const running=h.run();await settle();clock.advance(15000);rejectPreload(Error('Timeout'));
  await assert.rejects(running,e=>e.adCode==='SDK_TIMEOUT'&&e.adElapsedMs===15000);
  const report=h.calls.find(x=>x.path==='/api/mission/outcome').body;
  assert.equal(report.error_code,'SDK_TIMEOUT');assert.equal(report.elapsed_ms,15000);
  clock.advance(3000);await settle();assert.equal(h.calls.filter(x=>x.path==='/api/mission/outcome').length,1);
});
test('an advert displayed for more than 45 seconds has no application display deadline',async()=>{
  const h=setup(),clock=useClock(h.ctx);let finish,completed=false;
  h.ctx.window.show_123=options=>{h.calls.push({options});return options.type==='preload'?Promise.resolve():new Promise(resolve=>{finish=resolve;});};
  const running=h.run().then(result=>{completed=true;return result;});await settle();
  assert.equal(h.stages.at(-1).stage,'display');clock.advance(75000);await settle();
  assert.equal(completed,false);assert.equal(h.calls.some(x=>x.path==='/api/mission/outcome'),false);
  finish({reward_event_type:'valued'});await running;
  assert.equal(h.calls.find(x=>x.path==='/api/mission/outcome').body.error_code,'SDK_RETURNED');
});
test('late cancelled preload cannot display or duplicate the action cancellation outcome',async()=>{
  const h=setup();let finish;
  h.ctx.window.show_123=options=>{h.calls.push({options});return new Promise(resolve=>{finish=resolve;});};
  const running=h.run();await settle();h.setVisible(false);finish();
  await assert.rejects(running,/AD_EXIT/);
  assert.equal(h.calls.some(x=>x.path==='/api/mission/outcome'),false,'the outer action records its own cancellation');
  assert.equal(h.calls.filter(x=>x.options?.type==='end').length,0);
});
test('diagnostic elapsed time is a bounded integer and absent for legacy callers',async()=>{
  for(const [elapsed,expected] of [[15000.8,15000],[-1,0],[400000,300000],[undefined,undefined],[NaN,undefined],['15000',undefined]]){
    const h=setup();h.ctx.reportAdOutcome(code,101,ymid,'preload','SDK_TIMEOUT',elapsed);await settle();
    const report=h.calls.find(x=>x.path==='/api/mission/outcome').body;
    assert.equal(report.elapsed_ms,expected);assert.equal(Object.hasOwn(report,'elapsed_ms'),expected!==undefined);
  }
});
test('diagnostics fail silently and never turn a provider result into a reward or user-visible error',async()=>{
  const h=setup(),api=h.ctx.apiPost;h.ctx.apiPost=(path,body)=>path==='/api/mission/outcome'?Promise.reject(Error('offline')):api(path,body);
  const result=await h.run();await settle();assert.equal(result.reward_event_type,'valued');
  assert.equal(h.calls.some(x=>x.path==='/api/mission/complete'),false);
});
