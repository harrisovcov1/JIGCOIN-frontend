'use strict';
const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const vault=html.slice(html.indexOf('<div class="sheet" id="withdrawSheet"'),html.indexOf('<section class="sheet" id="vipOfferSheet"'));
const styleStart=html.indexOf('/* Vault v31 — a personal treasury');
const css=html.slice(styleStart,html.indexOf('</style>',styleStart));
const codeFor=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
test('v32 Vault keeps rank and collection finish without duplicated treasury text',()=>{
 assert.ok(Number(html.match(/name="jigcoin-build" content="v(\d+)-/)?.[1])>=32);
 assert.match(vault,/id="vaultRank"/);
 assert.doesNotMatch(vault,/id="vaultBalanceFinish"/);
 assert.match(vault,/id="vaultCollectionOpen"/);
 assert.match(html,/Rank · /);
 assert.match(vault,/Prestige coin finish/);
});
test('separate cabinets replace the obsolete VIP card; crown remains accessible',()=>{
 assert.match(vault,/Coin Cabinet/);assert.match(vault,/Trophy Cabinet/);
 assert.doesNotMatch(vault,/id="vaultVipOpen"/);
 assert.match(vault,/data-vip-origin="vault"/);
 assert.match(html,/id="shopVipPass"/);
});
test('account activity consolidates three real destinations and preserves original IDs',()=>{
 assert.match(vault,/id="vaultAccountDrawer"/);
 for(const id of ['vaultCoinOrdersOpen','vaultHistoryOpen','vaultRewardHistoryOpen'])
   assert.equal((vault.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(vault,/Coin-pack orders &amp; payment help/);
 assert.match(vault,/VIP purchases &amp; payment support/);
 assert.match(vault,/Referral reward history/);
 assert.match(html,/vaultCoinOrdersOpen'\)\.addEventListener\('click'/);
 assert.match(html,/openCoinShopSheet\(\)/);
 assert.match(html,/orders\.open=true/);
});
test('VIP Shop summary handles active and pending status without removed Vault elements',()=>{
 const script=codeFor('function renderVipSummaries(){','function renderVaultCollection(goal){');
 const nodes=new Map(),el=id=>{if(id.startsWith('vault'))return null;if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{}});return nodes.get(id)};
 let product={product:{enabled:true},vip_until:null,benefits:{vip_energy:110},vip_bonus_coins:0};
 let pending=null;
 const render=new Function('document','vaultSnapshot','vaultNow','vaultPending','vaultError','formatNumber',script+'\nreturn renderVipSummaries;')({getElementById:el},()=>product,()=>Date.now(),()=>pending,false,n=>Number(n).toLocaleString('en-GB'));
 render();assert.match(el('shopVipState').textContent,/30 days · ★500 · View VIP benefits/);
 product={...product,vip_until:new Date(Date.now()+86400000).toISOString(),benefits:{vip_energy:110},vip_bonus_coins:25};
 render();assert.match(el('shopVipState').textContent,/extra tap coins recorded/);
 pending='vp_pending';render();assert.match(el('shopVipState').textContent,/Payment confirmation pending/);
});
test('legacy daily medals render only inside the collapsed archive and are account-scoped',()=>{
 const script=codeFor('function renderVaultMedals(){','async function loadVaultMedals(');
 const elements=new Map(),get=id=>{if(id==='vaultMedalSpotlight')return null;if(!elements.has(id))elements.set(id,{textContent:'',disabled:false});return elements.get(id)};
 const data={my_awards:[{place:1,day:'2026-11-20',score:200},{place:2,day:'2026-11-19',score:100},{place:3,day:'2026-11-18',score:90}]};
 const make=(owner,ready=true)=>new Function('document','vaultMedalsOwner','homeUserId','vaultMedalsData','vaultMedalsError','vaultMedalsRequest','formatNumber','accountIsReady',script+'\nreturn renderVaultMedals;')({getElementById:get},owner,()=>17,data,false,null,n=>Number(n).toLocaleString('en-GB'),()=>ready);
 make(17)();assert.match(get('vaultDailyMedalList').textContent,/^Gold · 20 Nov 2026/);assert.match(get('vaultDailyMedalList').textContent,/Silver · 19 Nov 2026/);assert.match(get('vaultDailyMedalList').textContent,/Bronze · 18 Nov 2026/);
 make(18)();assert.doesNotMatch(get('vaultDailyMedalList').textContent,/20 Nov 2026/);
 make(17,false)();assert.doesNotMatch(get('vaultDailyMedalList').textContent,/20 Nov 2026/);
 assert.match(vault,/<details id="vaultLegacyHonours">/);assert.doesNotMatch(vault,/id="vaultMedalSpotlight"/);
});
test('roadmap states game progress without a purchase or token guarantee',()=>{
 assert.match(vault,/Rank 8 · 10,000,000 saved in-game coins/);
 assert.match(vault,/Game coins have no cash-out value/);
 assert.match(vault,/do not guarantee any token allocation or monetary return/);
 assert.doesNotMatch(vault,/airdrop countdown|guaranteed airdrop|buy to qualify/i);
});
test('responsive sizing keeps natural overflow and usable account targets',()=>{
 assert.ok(styleStart>0);
 assert.match(css,/vault-content\s*\{[^}]*overflow-y:auto/);
 assert.match(css,/vault-summary\s*\{[^}]*flex:1 0 auto/);
 assert.match(css,/vault-collection\s*\{[^}]*flex:2 0 auto/);
 assert.match(css,/vault-account-links button\s*\{[^}]*min-height:44px/);
 assert.match(css,/@media\(max-height:730px\),\(max-width:350px\)/);
 assert.doesNotMatch(css,/#coinShopSheet|#boostSheet|#friendsSheet|#mainScroll|#homeCoinWrap/);
});
test('Home, Rewards, Shop and Invite core contracts remain in the source',()=>{
 assert.match(html,/const HOME_TIERS = Object\.freeze/);
 assert.match(html,/id="shopVipPass"/);
 assert.match(html,/id="boostSheet"/);
 assert.match(html,/id="friendsSheet"/);
 assert.match(html,/const referencePacks = \[/);
});
test('all script blocks parse and all HTML IDs are unique',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(match[1]));
});
