'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const rewardedSDKs ='),html.indexOf('// Unified Rewards.'));
const code='sp_emergency_energy',ymid='12345678-1234-4123-8123-123456789abc';
function setup({result={reward_event_type:'valued'},failure,loadFailure=false}={}) {
  const calls=[],scripts=[];
  let owner=101,visible=true;
  const ctx={Map,Error,Promise,setTimeout,clearTimeout,
    homeUserId:()=>owner,accountIsReady:()=>true,missionsOwner:101,
    hubMissions:[{code,provider:'monetag',status:'available',zone_id:'123'}],window:{},
    apiPost:async(path,body)=>{calls.push({path,body});return {ok:true,provider:'monetag',zone_id:'123',ymid,request_var:code};},
    document:{createElement:()=>({dataset:{},remove(){this.removed=true;}}),head:{appendChild(script){
      scripts.push(script);
      queueMicrotask(()=>{
        if(loadFailure){script.onerror();return;}
        ctx.window.show_123=async options=>{
          calls.push({options});
          if(failure)throw Error(failure);
          return options.type==='preload'?undefined:result;
        };
        script.onload();
      });
    }}}
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,calls,scripts,run:()=>ctx.runMonetagQuest(code,()=>visible),
    setVisible:value=>visible=value,setOwner:value=>owner=value,setLoadFailure:value=>loadFailure=value};
}
test('SDK loads before an attempt; preload and display share the server-issued reward identity',async()=>{
  const h=setup();const result=await h.run();
  assert.equal(result.reward_event_type,'valued');
  assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].dataset.zone,'123');
  assert.equal(h.calls[0].path,'/api/mission/start');
  assert.deepEqual(h.calls.slice(1).map(x=>x.options.type),['preload','end']);
  for(const {options} of h.calls.slice(1)){assert.equal(options.ymid,ymid);assert.equal(options.requestVar,code);}
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
  assert.equal(h.calls.length,0);assert.equal(h.scripts[0].removed,true);
  h.setLoadFailure(false);await h.run();
  assert.equal(h.scripts.length,2);assert.equal(h.calls[0].path,'/api/mission/start');
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
    await assert.rejects(h.run(),/AD_REWARDS_UNAVAILABLE/);assert.equal(h.calls.length,0);
  }
});
