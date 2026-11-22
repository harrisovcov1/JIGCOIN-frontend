'use strict';
const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const vault=html.slice(html.indexOf('<div class="sheet" id="withdrawSheet"'),html.indexOf('<section class="sheet" id="vipOfferSheet"'));
const marker=html.indexOf('/* Vault v32 final three: reclaim just enough height');
const css=html.slice(marker,html.indexOf('</style>',marker));
test('v32 Vault keeps its coin balance and rank without repeating finish twice',()=>{
 assert.ok(Number(html.match(/name="jigcoin-build" content="v(\d+)-/)?.[1])>=32);
 assert.match(vault,/id="withdrawBalanceText"/);
 assert.match(vault,/id="vaultRank"/);
 assert.doesNotMatch(vault,/id="vaultBalanceFinish"/);
 assert.match(vault,/id="vaultCollectionLabel"/);
 assert.match(vault,/Equipped coin finish/);
 assert.doesNotMatch(html,/document\.getElementById\('vaultBalanceFinish'\)/);
});
test('latest three verified medals show a left-to-right chronological journey',()=>{
 const start=html.indexOf('function renderVaultMedals(){');
 const end=html.indexOf('async function loadVaultMedals(',start);
 const code=html.slice(start,end);
 const elements=new Map();
 const create=()=>({textContent:'',hidden:false,disabled:false,children:[],
   append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
 const el=id=>{if(!elements.has(id))elements.set(id,create());return elements.get(id)};
 const history={my_awards:[
  {place:1,day:'2026-11-19',score:250},
  {place:2,day:'2026-11-16',score:120},
  {place:1,day:'2026-11-20',score:420},
  {place:3,day:'2026-11-18',score:180}]};
 const make=owner=>new Function('document','vaultMedalsOwner','homeUserId','vaultMedalsData','vaultMedalsError','vaultMedalsRequest','formatNumber',code+'return renderVaultMedals;')
  ({getElementById:el,createElement:create},owner,()=>101,history,false,null,n=>Number(n).toLocaleString('en-GB'));
 make(101)();
 assert.equal(el('vaultMedalSpotlight').hidden,false);
 assert.deepEqual(el('vaultMedalSpotlight').children.map(c=>c.children[1].textContent),['18 Nov','19 Nov','20 Nov']);
 assert.match(el('vaultDailyMedalList').textContent,/^Gold · 20 Nov 2026/);
 assert.equal(history.my_awards[0].day,'2026-11-19'); // never mutate server data
 make(202)();
 assert.equal(el('vaultMedalSpotlight').hidden,true);
 assert.equal(el('vaultMedalSpotlight').children.length,0);
});
test('compact Vault uses less height without hiding content or reducing touch targets',()=>{
 assert.ok(marker>0);
 assert.match(css,/vault-content\s*\{[^}]*gap:clamp\(4px,\.63dvh,8px\)/);
 assert.match(css,/vault-summary\s*\{[^}]*min-height:126px/);
 assert.match(css,/vault-collection\s*\{[^}]*min-height:176px/);
 assert.match(css,/vault-medal-badge\s*\{[^}]*padding:5px 3px/);
 assert.match(css,/vault-account-drawer>summary\s*\{[^}]*min-height:46px/);
 assert.match(css,/vault-airdrop summary\s*\{[^}]*min-height:46px/);
 assert.match(html,/vault-account-drawer \.vault-account-links button\s*\{[^}]*min-height:44px/);
 assert.match(css,/@media\(max-height:730px\),\(max-width:350px\)/);
 assert.match(html,/vault-content\s*\{[^}]*overflow-y:auto/);
 assert.doesNotMatch(css,/#boostSheet|#coinShopSheet|#friendsSheet|#mainScroll|#homeCoinWrap/);
});
test('Vault preserves safe airdrop disclosure and all existing account destinations',()=>{
 assert.match(vault,/id="vaultWithdrawalDetails"/);
 assert.match(vault,/Planned · Rules awaiting publication/);
 assert.match(vault,/In-game coins currently have no cash-out value/);
 assert.match(vault,/do not guarantee an airdrop allocation/);
 for(const id of ['vaultCoinOrdersOpen','vaultHistoryOpen','vaultRewardHistoryOpen','vaultVipOpen','vaultMedalCollection']){
   assert.equal((vault.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
});
test('Home, Rewards, Shop and Invite pages have no changed runtime IDs',()=>{
 for(const id of ['mainScroll','boostSheet','coinShopSheet','friendsSheet','shopVipPass','inviteDetailsOpen']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
});
test('all inline JavaScript parses',()=>{
 for(const x of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  assert.doesNotThrow(()=>new Function(x[1]));
 }
});