'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('/* Shop v27: share spare vertical room');
const end=html.indexOf('</style>',start);
const css=html.slice(start,end);
const shop=html.slice(html.indexOf('<div class="sheet" id="coinShopSheet">'),html.indexOf('<div class="toast" id="toast">'));
test('Shop v27 build and targeted stylesheet present',()=>{
 assert.match(html,/<meta name="jigcoin-build" content="v27-shop-responsive-fill-1">/);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(css,/#boostSheet|#mainScroll|#homeCoinWrap|#tabHome|#tabRewards/);
});
test('Coin pack list and rows stretch together into spare vertical space',()=>{
 assert.match(css,/html body #coinShopSheet #coinPackList\s*\{[^}]*flex:1 0 auto/);
 assert.match(css,/html body #coinShopSheet \.hub-catalog-dense \.hub-product\s*\{[^}]*flex:1 0 57px/);
});
test('Purchase controls remain large and pricing gets a readable hierarchy',()=>{
 assert.match(css,/\.hub-buy\s*\{[^}]*min-height:44px!important/);
 assert.match(css,/\.hub-buy span\s*\{[^}]*font-size:11px/);
 assert.match(css,/\.hub-buy strong\s*\{[^}]*font-size:clamp\(15px,4\.3vw,18px\)/);
});
test('Small screen and large viewport rules preserve natural layout',()=>{
 assert.match(css,/@media\(max-height:710px\)/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/@media\(min-height:980px\)/);
 assert.match(css,/flex:0 0 auto/);
 assert.match(css,/min-height:55px!important/);
});
test('Shop still retains visible payment help outside scrollable body',()=>{
 assert.match(shop,/<\/div>\s*<details class="hub-history shop-help-dock" id="hubOrderDetails">/);
 assert.equal((shop.match(/id="hubOrderDetails"/g)||[]).length,1);
});
test('Existing reference pack prices and VIP action are unchanged',()=>{
 const prices=html.slice(html.indexOf('const referencePacks = ['),html.indexOf('];',html.indexOf('const referencePacks = [')));
 for(const [coins,stars] of [[1000,100],[3000,250],[7000,500],[37500,2500],[700000,35000]])
   assert.match(prices,new RegExp('coins:'+coins+',stars:'+stars));
 assert.match(shop,/id="shopVipPass"/);
});
