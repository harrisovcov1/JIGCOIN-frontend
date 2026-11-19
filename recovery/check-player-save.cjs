'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const section = (from, until) => page.slice(page.indexOf(from), page.indexOf(until, page.indexOf(from)));
const ordinary = section('let __tapFlushTimer = null;', '// Durable owner queue');
const api = section('async function apiPost(', '// Invite v10');
const safeParseJSON = (value, fallback) => {try {return JSON.parse(value) ?? fallback;} catch (_) {return fallback;}};

function account() {
  const items = new Map(), events = {}, responses = [];
  let serial = 0;
  const storage = {
    get length() {return items.size;},
    key: i => [...items.keys()][i],
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => {items.set(key, String(value)); return true;},
    removeItem: key => items.delete(key),
  };
  const ctx = {owner:101, state:{bal:100,today:10}, maxEnergy:50, Date, setTimeout:()=>1,
    window:{localStorage:storage, __lastState:{}, addEventListener:(key, fn)=>{events[key]=fn;}},
    navigator:{locks:{request(){}}}, document:{hidden:false}, accountIsReady:()=>true,
    appStorage:storage, safeParseJSON, effectiveTapRate:()=>1.05, render(){},
    makePacketId:()=>'packet_id_'+(++serial),
    apiPost:async (...args)=>responses.shift()(...args),
    applyBackendState:res=>{ctx.state.bal=res.balance;ctx.state.today=res.today;}
  };
  ctx.homeUserId=()=>ctx.owner;
  vm.createContext(ctx);
  vm.runInContext(ordinary,ctx);
  return {ctx,items,events,responses};
}

test('ordinary partial receipt keeps touches registered during the request visible and queued',async()=>{
  const {ctx,responses}=account();
  for (let i=0;i<3;i++) ctx.addOrdinaryTap();
  let release;
  responses.push(async(_path, body, options)=>{
    assert.equal(body.count,3);assert.equal(options.tapOwner,101);
    return new Promise(done=>{release=done;});
  });
  const saved=ctx.sendOrdinaryPacket(101,true);
  ctx.addOrdinaryTap();ctx.addOrdinaryTap();
  release({ok:true,applied:2,balance:102,today:12});
  await saved;
  assert.equal(ctx.getPendingTaps(),2);
  assert.equal(ctx.state.bal,104.1);assert.equal(ctx.state.today,14.1);
  responses.push(async()=>({ok:true,applied:2,balance:104,today:14}));
  await ctx.sendOrdinaryPacket(101,true);
  assert.equal(ctx.getPendingTaps(),0);assert.equal(ctx.state.bal,104);
});

test('ordinary retries keep the same packet id and count across a lost receipt',async()=>{
  const {ctx,responses}=account();
  ctx.addOrdinaryTap();ctx.addOrdinaryTap();
  let packet;
  responses.push(async(_path,body)=>{packet=body;return {ok:false,reason:'NETWORK'};});
  await assert.rejects(ctx.sendOrdinaryPacket(101,true));
  assert.equal(ctx.getPendingTaps(),2);
  responses.push(async(_path,body)=>{
    assert.equal(body.packet_id,packet.packet_id);assert.equal(body.count,packet.count);
    return {ok:true,duplicate:true,applied:2,balance:102,today:12};
  });
  await ctx.sendOrdinaryPacket(101,true);assert.equal(ctx.getPendingTaps(),0);assert.equal(ctx.state.bal,102);
});

test('unowned historical inputs survive reconnection and stay outside either account queue',()=>{
  const {ctx,items,events}=account();
  items.set('ae_pending_taps','3');
  items.set('ae_tap_packet_queue_v1','[{"packet_id":"historical_id"}]');
  for (const owner of [101,202]){
    ctx.owner=owner;events['jigcoin:account-ready']();
    assert.equal(ctx.getPendingTaps(),0);assert.equal(ctx.getTapQueue().length,0);
    assert.match(vm.runInContext('legacyTapNotice',ctx),/older unconfirmed taps/);
  }
  assert.equal(items.get('ae_pending_taps'),'3');
  assert.equal(items.get('ae_tap_packet_queue_v1'),'[{"packet_id":"historical_id"}]');
});

test('a Telegram account switch discards the previous reply and never borrows its cached launch data',async()=>{
  const raw = id=>new URLSearchParams({user:JSON.stringify({id})}).toString();
  const app={initDataUnsafe:{user:{id:101}},initData:raw(101)};
  const ctx={URLSearchParams,AbortController,API_BASE:'https://fixture.invalid',setTimeout:()=>1,clearTimeout(){},
    window:{Telegram:{WebApp:app}}, homeUserId:()=>app.initDataUnsafe.user.id, accountIsReady:()=>true,
    safeParseJSON,getClientSignals:()=>({})};
  let release,calls=0;
  const heldBody=new Promise(done=>{release=done;});
  ctx.fetch=async()=>{calls++;return{ok:true,json:()=>heldBody};};
  vm.createContext(ctx);vm.runInContext(api,ctx);
  const late=ctx.apiPost('/api/state',{}, {fastAuth:true});
  await Promise.resolve();
  app.initDataUnsafe.user.id=202;
  release({ok:true,balance:100});assert.equal((await late).reason,'TELEGRAM_ACCOUNT_CHANGED');
  app.initData='';assert.equal((await ctx.apiPost('/api/state',{}, {fastAuth:true})).reason,'NO_TELEGRAM_ID');
  app.initData=raw(101);assert.equal((await ctx.apiPost('/api/state',{}, {fastAuth:true})).reason,'TELEGRAM_ACCOUNT_CHANGED');
  assert.equal(calls,1);
  app.initData=raw(202);
  ctx.fetch=async(_u,req)=>{calls++;assert.equal(JSON.parse(req.body).telegram_id,202);return{ok:true,json:async()=>({ok:true,balance:50})};};
  assert.equal((await ctx.apiPost('/api/state',{}, {fastAuth:true})).balance,50);
  app.initData='';assert.equal((await ctx.apiPost('/api/state',{}, {fastAuth:true})).balance,50);
  assert.equal(calls,3);
});

test('ordinary refill handoff runs after a valid tap receipt and unlocked queue, never after failure',async()=>{
  const {ctx,responses}=account(),handoffs=[];
  ctx.navigator.locks.request=async(_key,work)=>work();
  ctx.resumeRefillAfterTapAck=owner=>handoffs.push({owner,pending:ctx.getPendingTaps(),flushing:vm.runInContext('__tapFlushing',ctx)});
  ctx.addOrdinaryTap();responses.push(async()=>({ok:false,reason:'NETWORK'}));await ctx.flushPendingTaps();
  assert.equal(handoffs.length,0);assert.equal(ctx.getPendingTaps(),1);
  responses.push(async()=>({ok:true,applied:1,balance:101,today:11}));await ctx.flushPendingTaps();
  assert.deepEqual(handoffs,[{owner:101,pending:0,flushing:false}]);assert.equal(ctx.getPendingTaps(),0);
});
