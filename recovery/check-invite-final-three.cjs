'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const overview=html.slice(html.indexOf('<div class="sheet" id="friendsSheet">'),html.indexOf('<div class="sheet" id="inviteDetailsSheet">'));
const details=html.slice(html.indexOf('<div class="sheet" id="inviteDetailsSheet">'),html.indexOf('<div class="sheet" id="withdrawSheet">'));
const marker=html.indexOf('/* Invite v29: one friends/rewards destination');
const css=html.slice(marker,html.indexOf('</style>',marker));
test('A single Friends & rewards action contains the actual friend status',()=>{
 assert.match(html,/name="jigcoin-build" content="v30-invite-responsive-fill-1"/);
 assert.equal((overview.match(/id="inviteDetailsOpen"/g)||[]).length,1);
 assert.equal((overview.match(/id="invitePendingSummary"/g)||[]).length,1);
 assert.match(overview,/<button type="button" id="inviteDetailsOpen"[\s\S]*?<small id="invitePendingSummary" hidden><\/small>/);
 assert.doesNotMatch(overview,/<button[^>]*id="invitePendingSummary"/);
 assert.doesNotMatch(overview,/Full referral rewards & history/);
});
test('Completed incoming invitation lives in details rather than main Invite',()=>{
 assert.doesNotMatch(overview,/id="incomingInviteCard"/);
 assert.match(details,/id="incomingInviteSection" hidden/);
 assert.match(details,/id="incomingInviteCard"/);
 assert.equal((html.match(/id="incomingInviteCard"/g)||[]).length,1);
});
test('Active friend activation goal remains a compact optional reminder',()=>{
 assert.match(overview,/id="incomingActiveReminder"[^>]*hidden/);
 assert.match(html,/reminder\.hidden=true/);
 assert.match(html,/if\(reminder&&active&&row\.qualification_mode!=='legacy_unknown'\)/);
 assert.match(html,/id="incomingActiveText"/);
 assert.match(css,/invite-active-reminder\[hidden\]\{display:none!important\}/);
});
test('All main page actions have at least 44px height',()=>{
 assert.match(css,/invite-details-link\s*\{[\s\S]*?min-height:48px/);
 assert.match(css,/invite-active-reminder\s*\{[\s\S]*?min-height:44px/);
 assert.match(html,/invite-actions button\{min-height:44px/);
});
test('Only Invite/Invite detail CSS updated; small screens can scroll',()=>{
 assert.doesNotMatch(css,/#boostSheet|#coinShopSheet|#mainScroll|#tabHome|#withdrawSheet/);
 assert.match(css,/invite-overview\s*\{[\s\S]*?gap:5px/);
 assert.match(html,/html body #friendsSheet \.invite-overview \{[\s\S]*?overflow-y:auto/);
 assert.match(css,/@media\(max-width:350px\)/);
});
test('No duplicate IDs and all inline scripts parse',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Function(script[1]));
});
test('Invite data contract and earned-credit logic retained',()=>{
 assert.match(html,/friends_rewarded/);
 assert.match(html,/friends_on_hold/);
 assert.match(html,/reward evidence needs review/);
 assert.match(html,/data\.qualification\.min_taps/);
 assert.match(html,/data\.invite_link/);
});
