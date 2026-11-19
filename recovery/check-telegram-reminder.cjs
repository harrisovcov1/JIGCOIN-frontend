'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/streak-reminder.js', 'utf8');
const scheduled = {due_at:'2026-11-20T19:00:00Z',time_zone:'Europe/London',local_time:'19:00',target_day:'2026-11-20'};
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(options = {}) {
  const elements = new Map();
  const calls = [];
  const webEvents = new Map();
  const navigations = [];
  const state = {id:11,ready:true,claimed:true,reminder:null,permissions:0,...options};
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      value:'19:00',hidden:true,disabled:false,events:new Map(),classList:{contains:() => false},
      addEventListener(event, cb) { this.events.set(event, cb); },
      click() { this.events.get('click')?.(); },
      reportValidity() { return true; },
      showModal() { this.open = true; },
      close() { this.open = false; this.events.get('close')?.(); },
    });
    return elements.get(id);
  }
  const app = {
    initDataUnsafe:{user:{id:11},start_param:state.startParam},
    requestWriteAccess(cb) {
      state.permissions++;
      if (state.deferPermission) state.permission = cb;
      else cb(!state.deny);
    }
  };
  const window = {Telegram:{WebApp:app},addEventListener:(ev,cb) => webEvents.set(ev,cb)};
  const ctx = {
    Date,Intl,Number,Object,URLSearchParams,setTimeout,clearTimeout,window,
    document:{getElementById:el,addEventListener(){}},location:{search:'',hash:''},
    showToast:() => {},accountIsReady:() => state.ready,homeUserId:() => state.id,
    dailyCheckinModel:() => ({claimed:state.claimed,resets_at:'2026-11-20T00:00:00Z'}),
    progressionNow:() => Date.parse('2026-11-19T12:00:00Z'),progressionError:false,
    openBoostSheet:focus => navigations.push(focus),
    apiPost:async (path, data, opts) => {
      calls.push({path,data,opts});
      if (path.endsWith('status')) return {ok:true,reminder:state.reminder};
      if (state.failure) return state.failure;
      state.reminder = data.enabled ? scheduled : null;
      return {ok:true,reminder:state.reminder};
    }
  };
  vm.runInNewContext(source, ctx);
  async function open() { el('rewardsTelegramReminder').click(); await tick(); }
  return {state,window,webEvents,navigations,el,open,calls,api:window.JigStreakReminder};
}

test('post-claim offer opens a local-time picker without prompting or scheduling until a player acts', async () => {
  const h = harness();
  assert.equal(h.el('rewardsTelegramReminder').hidden, false);
  h.state.claimed = false; h.api.render();
  assert.equal(h.el('calendarTelegramReminder').hidden, true);
  h.state.claimed = true; h.api.render();
  await h.open();
  assert.deepEqual(h.calls.map(c=>c.path), ['/api/streak/reminder/status']);
  assert.equal(h.el('streakMessageTimeField').hidden, false);
  assert.equal(h.state.permissions, 0);
});

test('permission authorises one schedule and users can review and cancel it on reentry', async () => {
  const h = harness();
  await h.open();
  h.el('streakMessageTime').value = '19:00';
  h.el('streakMessageSave').click(); h.el('streakMessageSave').click();
  await tick();
  const writes = h.calls.filter(c=>c.path.endsWith('set'));
  assert.equal(writes.length,1);
  assert.equal(writes[0].data.enabled,true);
  assert.equal(writes[0].data.consent,true);
  assert.equal(writes[0].data.local_time,'19:00');
  assert.equal(writes[0].data.time_zone,Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(writes[0].opts.tapOwner,11);
  assert.match(h.el('streakMessageStatus').textContent,/scheduled for.*19:00/i);
  h.el('streakMessageClose').click();
  h.state.claimed=false; h.api.render();
  assert.equal(h.el('rewardsTelegramReminder').hidden,false);
  await h.open();
  assert.equal(h.el('streakMessageCancel').hidden,false);
  h.el('streakMessageCancel').click(); await tick();
  assert.equal(h.calls.at(-1).data.enabled,false);
  assert.match(h.el('streakMessageStatus').textContent,/cancelled/);
  assert.equal(h.el('rewardsTelegramReminder').hidden,true);
  assert.equal(h.state.permissions,1);
});

test('declining Telegram permission never submits a reminder', async () => {
  const h=harness({deny:true});
  await h.open(); h.el('streakMessageSave').click(); await tick();
  assert.equal(h.calls.some(c=>c.path.endsWith('set')),false);
  assert.match(h.el('streakMessageStatus').textContent,/Permission declined/);
});

test('account change while permission prompt is open cannot schedule for either account', async () => {
  const h=harness({deferPermission:true});
  await h.open(); h.el('streakMessageSave').click();
  h.state.id=12; h.api.render();
  h.state.permission(true); await tick();
  assert.equal(h.calls.some(c=>c.path.endsWith('set')),false);
  assert.equal(h.el('streakMessageDialog').open,false);
});

test('server-side wall-time mismatch and unknown mutation outcomes stay actionable', async () => {
  const h=harness({failure:{ok:false,status:400,reason:'REMINDER_TIME_OUTSIDE_REWARD_DAY'}});
  await h.open(); h.el('streakMessageSave').click(); await tick();
  assert.match(h.el('streakMessageStatus').textContent,/different time/);
  h.state.failure={ok:false,reason:'TIMEOUT'};
  h.el('streakMessageSave').click(); await tick();
  assert.equal(h.el('streakMessageRetry').hidden,false);
  assert.equal(h.el('streakMessageSave').hidden,true);
});

test('only the exact daily reward link opens Rewards once when the account is ready', () => {
  const h=harness({ready:false,startParam:'daily_rewards'});
  assert.deepEqual(h.navigations,[]);
  h.state.ready=true;h.webEvents.get('jigcoin:account-ready')();h.webEvents.get('jigcoin:account-ready')();
  assert.deepEqual(h.navigations,['daily']);
  assert.deepEqual(harness({startParam:'ref_123'}).navigations,[]);
});
