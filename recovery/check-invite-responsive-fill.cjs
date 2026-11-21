'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const main=html.slice(html.indexOf('<div class="sheet" id="friendsSheet">'),html.indexOf('<div class="sheet" id="inviteDetailsSheet">'));
const from=html.indexOf('/* Invite v30: fill only real spare height');
const css=html.slice(from,html.indexOf('</style>',from));
test('new version and Invite-only styling are present',()=>{
 assert.ok(Number(html.match(/name="jigcoin-build" content="v(\d+)-/)?.[1])>=30);
 assert.ok(from>=0);
 assert.doesNotMatch(css,/#coinShopSheet|#boostSheet|#withdrawSheet|#mainScroll|#tabHome|#tabRewards/);
});
test('the hero and progression milestone expand into genuine spare space',()=>{
 assert.match(css,/invite-reward-card\s*\{[^}]*flex:2 0 auto/);
 assert.match(css,/invite-milestone\s*\{[^}]*flex:1 0 auto/);
 assert.match(css,/invite-reward-card\s*\{[^}]*align-content:space-evenly/);
 assert.match(css,/invite-overview\s*\{[^}]*overflow-y:auto/);
});
test('large viewports do not overinflate panels; small viewports naturally scroll',()=>{
 assert.match(css,/@media \(max-height:710px\), \(max-width:350px\)/);
 assert.match(css,/@media \(min-height:1000px\)/);
 assert.match(css,/invite-reward-card\s*\{[^}]*flex:0 0 auto/);
 assert.match(css,/invite-milestone\s*\{[^}]*flex:0 0 auto/);
 assert.match(css,/invite-details-link\{margin-top:0/);
});
test('the final visible Invite action is Friends & rewards, with optional goal before it',()=>{
 assert.ok(main.indexOf('id="incomingActiveReminder"')<main.indexOf('id="inviteDetailsOpen"'));
 assert.equal((main.match(/id="inviteDetailsOpen"/g)||[]).length,1);
 assert.match(css,/invite-details-link\s*\{[^}]*margin-top:auto/);
});
test('sharing, VIP-free referral terms and historical review are preserved',()=>{
 for(const key of ['id="shareTelegramBtn"','id="copyInviteBtn"','id="inviteShareCardOpen"','id="inviteJoinedCount"','id="invitePendingSummary"','id="inviteFriendsBoard"','id="inviteWeeklyRace"'])
   assert.ok(main.includes(key),key);
 assert.match(html,/100 verified taps in total/);
 assert.match(html,/No purchase needed/);
 assert.match(html,/Historical referral · reward evidence needs review/);
 assert.match(css,/invite-actions button \{min-height:44px/);
});
test('all original HTML IDs are unique and scripts parse',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const x of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
   assert.doesNotThrow(()=>new Function(x[1]));
});
