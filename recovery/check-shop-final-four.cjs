'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const shop=html.slice(html.indexOf('<div class="sheet" id="coinShopSheet">'),html.indexOf('<div class="toast" id="toast">'));
const css=html.slice(html.indexOf('/* Shop final four'),html.indexOf('</style>',html.indexOf('/* Shop final four')));
test('Shop payment support is docked below the scrollable product body',()=>{
  const body=shop.indexOf('<div class="sheet-body">');
  const catalog=shop.indexOf('id="coinPackList"');
  const bodyEnd=shop.indexOf('</div>\n    <details',catalog);
  const help=shop.indexOf('id="hubOrderDetails"');
  assert.ok(body>=0&&catalog>body&&bodyEnd>catalog&&help>bodyEnd);
  assert.equal((shop.match(/id="hubOrderDetails"/g)||[]).length,1);
  assert.match(shop,/class="hub-history shop-help-dock"/);
  assert.match(css,/shop-help-dock[^}]*min-height:44px/);
});
test('Compact styling overrides shared Shop row height and gap rules',()=>{
  assert.match(css,/html body #coinShopSheet \.sheet-body\s*\{[^}]*gap:3px/);
  assert.match(css,/html body #coinShopSheet #coinPackList\s*\{[^}]*gap:3px/);
  assert.match(css,/hub-product:first-child\)[^}]*min-height:57px!important/);
  assert.match(css,/hub-product:first-child\) \.hub-buy[^}]*min-height:44px!important/);
});
test('Progression banner is compact and does not duplicate the balance strip',()=>{
  const from=html.indexOf('function renderPackChoices('),to=html.indexOf('function shopLoadError(',from);
  const code=html.slice(from,to);
  assert.match(code,/strip\.hidden=!!goal&&!goal\.complete/);
  assert.match(code,/Preview finish/);
  assert.doesNotMatch(code,/Rank unlock option:/);
});
test('All five existing catalogue preview prices are unchanged',()=>{
  const start=html.indexOf('const referencePacks = [');
  const end=html.indexOf('];',start);
  const preview=html.slice(start,end);
  for(const [coins,stars] of [[1000,100],[3000,250],[7000,500],[37500,2500],[700000,35000]])
    assert.match(preview,new RegExp('coins:'+coins+',stars:'+stars));
});
test('No shared Home or Rewards selector is introduced by the final four CSS',()=>{
  assert.doesNotMatch(css,/#boostSheet|#mainScroll|#homeCoinWrap|#tabHome|#tabRewards/);
});
