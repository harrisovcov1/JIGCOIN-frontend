'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const invite=html.slice(html.indexOf('<div class="sheet" id="friendsSheet">'),html.indexOf('<div class="sheet" id="inviteDetailsSheet">'));
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
test('Invite v28 preserves premium layout and puts the outward referral offer first',()=>{
 assert.ok(Number(html.match(/name="jigcoin-build" content="v(\d+)-/)?.[1])>=30);
 assert.ok(invite.includes('id="shareTelegramBtn"'));
 assert.doesNotMatch(invite,/id="incomingInviteCard"/);
 assert.match(invite,/id="inviteShareCardOpen"/);
 assert.match(invite,/id="inviteJoinedCount"/);
});
test('Invite has separate joined, rewarded, and earned counters',()=>{
 assert.match(invite,/<span>Joined<\/span><strong id="inviteJoinedCount">/);
 assert.match(invite,/<span>Rewarded<\/span><strong id="friendsJoinedText">/);
 assert.match(invite,/<span>Coins earned<\/span><strong id="referralPointsText">/);
});
test('Review records remain distinguishable from paid referrals',()=>{
 assert.match(html,/Historical referral · old credit records are being reconciled/);
 assert.match(html,/parts\.join\(' · '\)/);
 assert.match(html,/if\(data\.friends_on_hold\)parts\.push/);
});
test('Share card uses established JigCoin gold design and confirmed-progress fallback',()=>{
 assert.match(html,/background\.addColorStop\(0,'#080d15'\)/);
 assert.match(html,/metal\.addColorStop\(\.24,'#f7d890'\)/);
 assert.doesNotMatch(html,/rgba\(236, 72, 153, 0\.95\)/);
 assert.match(html,/homeIdentity===homeUserId\(\)\&\&Number\.isSafeInteger\(homeConfirmedBalance\)/);
});
test('Tracking uses a signed user route but cannot grant referrals from Invite',()=>{
 assert.match(html,/apiPost\('\/api\/invite\/interaction'/);
 assert.match(html,/if\(!inviteSnapshot\(\)\)return;/);
 assert.doesNotMatch(invite,/reward-claim|claim-payout|payment/);
});
test('Existing Telegram startapp link and share URL remain account-scoped',()=>{
 assert.match(html,/startapp=ref_/);
 assert.match(html,/https:\/\/t\.me\/share\/url/);
});
test('Every inline app script parses',()=>{for(const script of scripts)assert.doesNotThrow(()=>new Function(script));});
