'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.slice(html.indexOf('let energySample = null;'), html.indexOf('function recoveryQueueKey()'));
const bands = [{below:10,ms:1000},{below:30,ms:3000},{below:null,ms:6000}];

function fixture() {
  const labels = {energyLabel:{}, energyFill:{style:{},dataset:{}}};
  const ctx = {time:0,pending:0,maxEnergy:55,state:{energy:0}, window:{__lastState:{}},
    accountIsReady:()=>true,homeUserId:()=>101,energyText:{},energySubText:{},
    document:{getElementById:id=>labels[id]}, homeEnergyLow:(n,max)=>n<=max*.2};
  ctx.performance = {now:()=>ctx.time};
  ctx.getPendingTaps = ()=>ctx.pending;
  vm.createContext(ctx);
  vm.runInContext(code,ctx);
  return {ctx,labels,accept(energy,elapsed=0) {
    return ctx.acceptEnergyClock({energy,energy_clock:{elapsed_ms:elapsed,bands}});
  }};
}

test('positive energy refills before the first poll without a distracting countdown', () => {
  const {ctx,labels,accept} = fixture();
  accept(19,1100);
  ctx.renderHomeEnergy(ctx.state.energy,true);
  assert.equal(labels.energyLabel.textContent,'Energy');
  ctx.time = 1899;
  ctx.updateProjectedEnergy();
  assert.equal(ctx.state.energy,19);
  ctx.time++;
  ctx.updateProjectedEnergy();
  assert.equal(ctx.state.energy,20);
  ctx.renderHomeEnergy(ctx.state.energy,true);
  assert.equal(labels.energyLabel.textContent,'Energy');
  assert.equal(ctx.energyText.textContent,'20 / 55');
});
test('28 to 30 crosses into the slower band; a paused timer catches up only to capacity', () => {
  const {ctx,labels,accept} = fixture();
  accept(28);
  for (const [time, expected] of [[3000,29],[6000,30],[11999,30],[12000,31],[1000000,55]]) {
    ctx.time=time;
    ctx.updateProjectedEnergy();
    assert.equal(ctx.state.energy,expected);
  }
  ctx.renderHomeEnergy(ctx.state.energy,true);
  assert.equal(labels.energyLabel.textContent,'Energy');
});
test('reserve unsent taps exactly once and rebase on each receipt', () => {
  const {ctx,accept} = fixture();
  accept(5);
  ctx.pending=3;
  ctx.updateProjectedEnergy();
  assert.equal(ctx.state.energy,2);
  ctx.time=1100;
  ctx.updateProjectedEnergy();
  assert.equal(ctx.state.energy,3);
  ctx.pending=1; accept(4,100);
  assert.equal(ctx.state.energy,3);
  ctx.pending=0; accept(3,100);
  assert.equal(ctx.state.energy,3);
  ctx.time=1999; ctx.updateProjectedEnergy(); assert.equal(ctx.state.energy,3);
  ctx.time=2000; ctx.updateProjectedEnergy(); assert.equal(ctx.state.energy,4);
});
test('owner mode retains its independent queue and missing schedules disable prediction', () => {
  const {ctx,accept} = fixture();
  ctx.window.__lastState.recovery_gameplay=true;ctx.pending=3;
  accept(5);assert.equal(ctx.state.energy,5);
  ctx.homeUserId=()=>999;ctx.time=6000;assert.equal(ctx.updateProjectedEnergy(),null);
  assert.equal(ctx.acceptEnergyClock({energy:2}),false);
  assert.equal(ctx.updateProjectedEnergy(),null);
});

test('late account snapshots cannot replace a newer refill, spend or capacity on the same account', () => {
  const {ctx} = fixture();
  const at = (energy, revision) => ({energy,energy_clock:{sampled_us:revision,elapsed_ms:0,bands}});
  ctx.acceptEnergyClock(at(19,100000001));
  assert.equal(ctx.isOlderAccountSample(at(55,100000000)),true);
  assert.equal(ctx.isOlderAccountSample(at(18,100000002)),false);
  ctx.homeUserId=()=>404;
  assert.equal(ctx.isOlderAccountSample(at(9,100000000)),false);
});

test('only exhausted energy shows the next-tap countdown, clearing at the first refill', () => {
  const {ctx,labels,accept} = fixture();
  accept(0,100);
  ctx.renderHomeEnergy(ctx.state.energy,true);
  assert.equal(labels.energyLabel.textContent,'Energy +1 in 1s');
  ctx.time=900;ctx.updateProjectedEnergy();
  ctx.renderHomeEnergy(ctx.state.energy,true);
  assert.equal(ctx.energyText.textContent,'1 / 55');
  assert.equal(labels.energyLabel.textContent,'Energy');
});
