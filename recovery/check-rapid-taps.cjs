const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = fs.readFileSync('index.html','utf8');
const queueCode = html.slice(html.indexOf('function recoveryTapView(saved)'),html.indexOf('// -------- Exit-safe save'));
function harness({touch=true,storage=new Map(),energy=50}={}) {
 let clock=1000000,id=0,online=true,delayResponse=null,failBefore=false,loseAfter=false,appliedLimit=Infinity;
 const timers = new Map(), handlers = {},calls=[],receipts=new Map(),el={}; let timerId=0,total=0;
 const ctx = {window:{__lastState:{recovery_test:true,recovery_gameplay:true},Telegram:{WebApp:{initDataUnsafe:{user:{id:123}}}},PointerEvent: function(){},addEventListener(){}},
 perTapBase:1,maxEnergy:50,setInterval(){},navigator:{maxTouchPoints:touch?5:0,get onLine(){return online;}},document:{hidden:false,addEventListener(){},getElementById:()=>el},
 tg:null,state:{energy,bal:100,today:0},Date:{now:()=>clock,parse:Date.parse},vaultNow:()=>clock,__lastPointerTapAt:0,__stateRequestVersion:0,
 accountIsReady:()=>true,safeParseJSON:(v,f)=>v?JSON.parse(v):f,
 appStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>(storage.set(k,v),true)},
 setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},
 makePacketId:()=>`packet_${clock}_${++id}`,showToast(){},render(){ctx.updateRecoveryTapFeedback();},updateTaskCardStates(){},
 applyBackendState:r=>{ctx.state.energy=r.energy;ctx.state.bal=r.balance;ctx.state.today=r.balance-100;},
 tapBtn:{addEventListener:(n,fn)=>{handlers[n]=fn;}},
 apiPost:async(path,p)=>{calls.push({...p}); if(failBefore) {failBefore=false;return{ok:false,reason:'NETWORK'};}
 if(delayResponse)await delayResponse;
 let receipt=receipts.get(p.packet_id);
 if(receipt) assert.equal(receipt.count,p.count);
 else {const applied=Math.min(p.count,ctx.state.energy,appliedLimit);total+=applied;receipt={count:p.count,applied};receipts.set(p.packet_id,receipt);}
 if(loseAfter){loseAfter=false;return{ok:false,reason:'TIMEOUT'};}
 return{ok:true,applied:receipt.applied,balance:100+total,energy:energy-total};}
 };
 if(touch)ctx.window.ontouchstart=null;
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function effectiveTapRate('),html.indexOf('function vaultSnapshot(')),ctx);vm.runInContext(queueCode,ctx);
 const event=(over={})=>({cancelable:true,preventDefault(){},stopPropagation(){},...over});
 return {ctx,el,storage,timers,calls,receipts,handlers,
 touch(n=1){clock+=30;handlers.touchstart(event({type:'touchstart',changedTouches:Array.from({length:n},(_,i)=>({identifier:i}))}));},
 click(detail=1){handlers.click(event({type:'click',detail}));},
 pointer(type='mouse'){clock+=30;handlers.pointerdown?.(event({type:'pointerdown',pointerType:type,button:0}));},
 advance(ms){clock+=ms;},setOffline(){online=false;},
 fail(){failBefore=true;},lose(){loseAfter=true;},limit(n){appliedLimit=n;},
 hold(){delayResponse=new Promise(r=>this.release=()=>{delayResponse=null;r();});},
 async flush(){if(timers.size) await this.tick(); else await ctx.runRecoveryTap(false);},
 async tick(){const next=timers.entries().next().value;if(!next)return;timers.delete(next[0]);clock+=next[1].ms;next[1].fn();for(let i=0;i<20;i++)await Promise.resolve();},
 total:()=>total};
}
test('all inline scripts parse',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});
test('ten rapid physical touches count ten; compatibility events never count twice',async()=>{
 const h=harness();for(let i=0;i<10;i++){h.touch();h.pointer('touch');h.click();}
 assert.equal(h.ctx.readRecoveryQueue().received,10);assert.match(h.el.textContent,/10 pending/);
 await h.flush();assert.equal(h.total(),10);assert.equal(h.ctx.state.bal,110);assert.match(h.el.textContent,/10 confirmed · 0 pending/);
});
test('multi-finger touchdown counts each finger once',async()=>{const h=harness();for(let i=0;i<5;i++)h.touch(2);await h.flush();assert.equal(h.total(),10);});
test('touches during server latency survive read-modify-write',async()=>{
 const h=harness();h.touch();h.hold();const f=h.ctx.runRecoveryTap(false);for(let i=0;i<29;i++)h.touch();h.release();await f;
 await h.ctx.runRecoveryTap(false);await h.ctx.runRecoveryTap(false);assert.equal(h.total(),30);assert.equal(h.ctx.readRecoveryQueue().pending,0);
});
test('response lost after commit retries identical ID and never doubles credit',async()=>{
 const h=harness();for(let i=0;i<10;i++)h.touch();h.lose();await h.flush();const id=h.ctx.readRecoveryQueue().packet.packet_id;
 assert.equal(h.total(),10);assert(h.timers.size>0);await h.tick();assert.equal(h.calls.at(-1).packet_id,id);assert.equal(h.total(),10);assert.equal(h.ctx.readRecoveryQueue().confirmed,10);
});
test('transient failure retries automatically without another touch',async()=>{const h=harness();h.touch();h.fail();await h.flush();assert.equal(h.total(),0);await h.tick();assert.equal(h.total(),1);});
test('reload preserves pending packet and received counter',async()=>{const h=harness();h.touch();h.fail();await h.flush();const q=h.ctx.readRecoveryQueue();const re=harness({storage:h.storage});await re.flush();assert.equal(re.calls[0].packet_id,q.packet.packet_id);assert.equal(re.ctx.readRecoveryQueue().confirmed,1);});
test('energy capacity excludes queued taps; no invisible over-credit',async()=>{const h=harness({energy:8});for(let i=0;i<10;i++)h.touch();assert.equal(h.ctx.readRecoveryQueue().received,8);assert.match(h.el.textContent,/Energy/);await h.flush();assert.equal(h.total(),8);});
test('server partial acceptance is explicitly counted as limited',async()=>{const h=harness();for(let i=0;i<10;i++)h.touch();h.limit(6);await h.flush();assert.equal(h.ctx.readRecoveryQueue().confirmed,6);assert.equal(h.ctx.readRecoveryQueue().limited,4);assert.match(h.el.textContent,/4 limited/);});
test('mouse pointer clicks count once and keyboard remains usable',async()=>{const h=harness({touch:false});for(let i=0;i<10;i++){h.pointer();h.click();}h.advance(1000);h.click(0);await h.flush();assert.equal(h.total(),11);});
test('disabled countdown has explicit foreground and WebKit text colour',()=>{assert.match(html,/\.boost-action:disabled[^}]*opacity:1[^}]*color:#cbd5e1;[^}]*-webkit-text-fill-color:#cbd5e1/s);});
test('account poll waits for queued mutations but startup can still authenticate',async()=>{
 const h=harness();let reads=0;
 h.ctx.refreshState=async()=>{reads++;return{ok:true};};h.ctx.__stateInFlight=null;
 vm.runInContext(html.slice(html.indexOf('function syncStateIfIdle()'),html.indexOf('async function refreshBalance()')),h.ctx);
 h.touch();await h.ctx.syncStateIfIdle();assert.equal(reads,0);
 h.ctx.accountIsReady=()=>false;await h.ctx.syncStateIfIdle();assert.equal(reads,1);
});
test('unknown Telegram identity cannot save to a shared anonymous queue',()=>{
 const h=harness();h.ctx.window.Telegram.WebApp.initDataUnsafe.user.id=null;
 h.touch();assert.equal(h.storage.size,0);
});

test('eight taps immediately project energy 8 to 0 and balance +8 before server response',async()=>{
 const h=harness({energy:8});for(let i=0;i<8;i++)h.touch();
 assert.equal(h.ctx.recoveryTapView(h.ctx.state).energy,0);
 assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,108);
 assert.equal(h.ctx.state.bal,100); // authoritative snapshot was not edited
 await h.flush();assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,108);
 assert.equal(h.ctx.recoveryTapView(h.ctx.state).energy,0);
});
test('partial receipt removes only settled projection; remaining taps stay visible',async()=>{
 const h=harness();h.touch();h.hold();const f=h.ctx.runRecoveryTap(false);
 for(let i=0;i<7;i++)h.touch();assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,108);
 h.release();await f;assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,108);
 await h.ctx.runRecoveryTap(false);assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,108);
});
test('server rejection corrects projected balance instead of persisting fake points',async()=>{
 const h=harness();for(let i=0;i<10;i++)h.touch();h.limit(6);
 assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,110);await h.flush();
 assert.equal(h.ctx.recoveryTapView(h.ctx.state).bal,106);
});
