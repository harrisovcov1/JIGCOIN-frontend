'use strict';
const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const vault=html.slice(html.indexOf('<div class="sheet" id="withdrawSheet"'),html.indexOf('<section class="sheet" id="vipOfferSheet"'));
test('separate cabinets, compact game roadmap and history with no redundant VIP card',()=>{
 for(const id of ['vaultCollectionOpen','vaultMedalCollection','vaultLegacyHonours','vaultDailyMedalList','pilotMedalList','vaultTrophyList','vaultLegendProgress','vaultCoinOrdersOpen','vaultHistoryOpen','vaultRewardHistoryOpen'])assert.match(vault,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(vault,/vaultVipOpen|vaultMedalSpotlight|Airdrop status/);
 assert.match(vault,/Rank 8 · 10,000,000 saved in-game coins/);
 assert.match(vault,/do not guarantee any token allocation or monetary return/);
 assert.match(html,/id="vaultCoinGallery"/);
 assert.match(html,/grid-template-columns:44px minmax\(0,1fr\) 44px/);
 assert.match(html,/grid-area:1\/1;position:(?:relative|static)/);
 assert.match(html,/grid-area:1\/3;position:static/);
 assert.doesNotMatch(html,/getElementById\('vaultVipOpen'\)\.addEventListener/);
});
test('weekly trophy validation rejects wrong account, invalid coins and duplicate weeks',()=>{
 const code=html.slice(html.indexOf('function validVaultTrophies('),html.indexOf('function renderVaultTrophies('));
 const valid=new Function(code+'return validVaultTrophies;')();
 const good={ok:true,telegram_id:'101',trophies:[{week:'2026-11-30',place:1,score:5000,coins:100000}]};
 assert.equal(valid(good,101),true);assert.equal(valid({...good,trophies:[]},101),true);
 assert.equal(valid(good,202),false);assert.equal(valid({...good,trophies:[{...good.trophies[0],coins:0}]},101),false);
 assert.equal(valid({...good,trophies:[...good.trophies,...good.trophies]},101),false);
 assert.equal(valid({...good,trophies:[{week:'2026-11-30',place:4,score:5000}]},101),false);
 assert.equal(valid({...good,trophies:[null]},101),false);
});
test('inline scripts parse and IDs remain unique',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(m[1]));
});
