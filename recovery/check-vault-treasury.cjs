'use strict';
const fs=require('node:fs'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const vault=html.slice(html.indexOf('<div class="sheet" id="withdrawSheet"'),html.indexOf('<section class="sheet" id="vipOfferSheet"'));
const styleStart=html.indexOf('/* Vault v31 — a personal treasury');
const css=html.slice(styleStart,html.indexOf('</style>',styleStart));
const codeFor=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
test('v31 Vault is a treasury with clear rank and equipped-finish labels',()=>{
 assert.match(html,/name="jigcoin-build" content="v31-vault-treasury-1"/);
 assert.match(vault,/id="vaultRank"/);
 assert.match(vault,/id="vaultBalanceFinish"/);
 assert.match(vault,/id="vaultCollectionOpen"/);
 assert.match(html,/Rank · /);
 assert.match(html,/Equipped finish · /);
});
test('collection leads; VIP is a compact membership card, not another Shop card',()=>{
 assert.ok(vault.indexOf('id="vaultCollectionTitle"')<vault.indexOf('id="vaultVipOpen"'));
 assert.match(vault,/class="vip-summary vault-membership-card"/);
 assert.match(vault,/<strong>VIP membership<\/strong>/);
 assert.match(css,/button#vaultVipOpen\.vault-membership-card/);
 assert.match(css,/button#vaultVipOpen\.vault-membership-card[^}]*min-height:68px/);
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
test('VIP status in Vault uses membership wording while Shop sales wording stays unchanged',()=>{
 const script=codeFor('function renderVipSummaries(){','function renderVaultCollection(goal){');
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{}});return nodes.get(id)};
 let product={product:{enabled:true},vip_until:null,benefits:{vip_energy:110},vip_bonus_coins:0};
 let pending=null;
 const render=new Function('document','vaultSnapshot','vaultNow','vaultPending','vaultError','formatNumber',script+'\nreturn renderVipSummaries;')({getElementById:el},()=>product,()=>Date.now(),()=>pending,false,n=>Number(n).toLocaleString('en-GB'));
 render();
 assert.match(el('shopVipState').textContent,/30 days · ★500 · View VIP benefits/);
 assert.match(el('vaultVipState').textContent,/Not active · 30 days for ★500 · View benefits/);
 product={...product,vip_until:new Date(Date.now()+86400000).toISOString(),benefits:{vip_energy:110},vip_bonus_coins:25};
 render();
 assert.match(el('shopVipState').textContent,/extra tap coins recorded/);
 assert.match(el('vaultVipState').textContent,/VIP active until/);
 pending='vp_pending';render();
 assert.match(el('vaultVipState').textContent,/Payment pending/);
});
test('recent medals appear only from account-matched verified history',()=>{
 const script=codeFor('function renderVaultMedals(){','async function loadVaultMedals(');
 const elements=new Map(),create=()=>({hidden:false,textContent:'',children:[],append(...v){this.children.push(...v);},replaceChildren(){this.children=[];}});
 const get=id=>{if(!elements.has(id))elements.set(id,create());return elements.get(id)};
 const data={my_awards:[{place:1,day:'2026-11-20',score:200},{place:2,day:'2026-11-19',score:100},{place:3,day:'2026-11-18',score:90}]};
 const make=(owner)=>new Function('document','vaultMedalsOwner','homeUserId','vaultMedalsData','vaultMedalsError','vaultMedalsRequest','formatNumber',script+'\nreturn renderVaultMedals;')({getElementById:get,createElement:create},owner,()=>17,data,false,null,n=>Number(n).toLocaleString('en-GB'));
 make(17)();
 assert.equal(get('vaultMedalSpotlight').hidden,false);
 assert.equal(get('vaultMedalSpotlight').children.length,3);
 assert.equal(get('vaultMedalCount').textContent,'3 daily medals shown');
 make(18)();
 assert.equal(get('vaultMedalSpotlight').hidden,true);
 assert.equal(get('vaultMedalSpotlight').children.length,0);
});
test('airdrop terms remain truthful, inactive and unlinked to purchase eligibility',()=>{
 assert.match(vault,/Planned · Rules awaiting publication/);
 assert.match(vault,/In-game coins currently have no cash-out value/);
 assert.match(vault,/do not guarantee an airdrop allocation/);
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
