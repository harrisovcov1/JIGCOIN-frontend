const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('let dailyClaimInFlight = false;'),html.indexOf('// ---- Sponsor / mission link helpers'));
function setup(replies) {
 const toasts=[],applied=[],calls=[];
 const ctx={homeUserId:()=>10001,apiPost:async(...args)=>{calls.push(args);const item=replies.shift();return typeof item==='function'?item():item;},showToast:x=>toasts.push(x),applyBackendState:x=>applied.push(x),render(){},async openDailyRewards(){toasts.push("options");},updateTaskCardStates(){},updateBoostHub(){},handleOnboardingDailyClaimed(){}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return Object.assign(ctx,{toasts,applied,calls});
}
test('daily success uses server reward including milestone',async()=>{const c=setup([{ok:true,reward:700}]);await c.handleDailyTask();assert.match(c.toasts[0],/700/);assert.equal(c.applied.length,1);});
test('maintenance is not presented as an already-used reward',async()=>{const c=setup([{ok:false,reason:'MAINTENANCE_MODE'}]);await c.handleDailyTask();assert.match(c.toasts[0],/maintenance/);assert.equal(c.applied.length,0);});
test('already-claimed response reconciles state without announcing credit',async()=>{const c=setup([{ok:false,reason:'ALREADY_CLAIMED',balance:500}]);await c.handleDailyTask();assert.match(c.toasts[0],/already saved/);assert.equal(c.applied.length,1);});
test('missed day opens options and never restarts without a deliberate choice',async()=>{const c=setup([{ok:false,reason:'STREAK_BROKEN'}]);await c.handleDailyTask();assert.equal(c.calls.length,1);assert.ok(c.toasts.includes('options'));});
test('explicit free restart submits start_new and uses server reward',async()=>{const c=setup([{ok:true,reward:500}]);await c.handleDailyTask(true);assert.equal(c.calls[0][1].action,'start_new');assert.equal(c.applied.length,1);});
test('rapid repeat claim clicks send one request while first is unresolved',async()=>{let release;const c=setup([()=>new Promise(r=>release=r)]);const first=c.handleDailyTask();await c.handleDailyTask();assert.equal(c.calls.length,1);release({ok:true,reward:500});await first;});
test('daily card follows UTC day, ignoring obsolete browser claim timer',()=>{
 const start=html.indexOf('  const now = Date.now();',html.indexOf('function updateTaskCardStates()'));
 const end=html.indexOf('  const dailyCard',start);
 const snippet=html.slice(start,end)+'\nremaining;';
 const epoch=Date.parse('2026-11-16T00:01:00Z');
 const FakeDate=class extends Date {constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};
 assert.equal(vm.runInNewContext(snippet,{Date:FakeDate,state:{lastCheckin:'2026-11-15'},DAILY_COOLDOWN_MS:86400000}),0);
 assert.equal(vm.runInNewContext(snippet,{Date:FakeDate,state:{lastCheckin:'2026-11-16'},DAILY_COOLDOWN_MS:86400000}),86340000);
});

test('old account daily response cannot replace a switched account',async()=>{let finish;const c=setup([()=>new Promise(r=>finish=r)]);const p=c.handleDailyTask();c.homeUserId=()=>10002;finish({ok:true,reward:500});await p;assert.equal(c.applied.length,0);});
