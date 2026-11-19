# Integrated JigCoin frontend release v16

Status: implementation and the authorized synthetic HTTPS preview have passed review, including mobile browser QA. Publication and deployment are authorized. Backend and frontend production deployment remain pending; no production deployment was performed from this frontend worktree.

## Included changes

- Shop shows all five coin packs in ascending price order, one compact affordable suggestion, accurate value labels, and exact saved-balance/rank outcomes in each purchase review.
- JigCoin VIP Pass uses a separate gold crown and one shared offer/consent/payment flow from Shop and Vault. The established 500 Stars, 30 days, double tap coins and double energy capacity terms remain unchanged. Midnight Crown remains an optional manually equipped coin finish.
- Invite separates referral levels from earned coin rank, shows server-verified friend progress and the real next reward, and retains every legacy qualification contract. New referrals use 100 cumulative verified taps. An authenticated incoming referral can show a one-time named welcome and its own saved goal; the general 1,000-coin welcome is labelled separately.
- Vault shows saved rank progress, the current/next collection finish, confirmed daily/weekly medals, purchase and reward-history links, and the planned airdrop status without implying cash-out or guaranteed allocation.
- Leaderboard preserves coin colours, uses explicit active-VIP crown badges, bounds one/two/three-player podiums, labels Today/Global/Friends scoring, and provides an invitation action for a solo player.
- Weekly Race consumes the server policy: the existing week keeps its three-run allowance; daily ranked allowances activate at 23 November 2026 00:00 UTC. Ranked play, unlimited unranked practice, request keys, UTC rollover, the final 45-second closing window, scope, and finalized awards remain distinct.
- Existing Home/refill policy, SDK display/receipt confirmation, energy/tap saving and checkout verification paths are preserved.
- Mobile QA fixes remove the obsolete first-pack hero spacing, give Invite details themed padding/progress bars and an inline SVG share arrow, correct singular medal/practice counts, and show an explicit pending-payment label. Weekly ranked/practice entry resets scroll once, tile selection preserves scroll, and the run clock stays visible while scrolling on short screens.

## Completed local validation

Run from the frontend repository root:

```sh
node --test recovery/check-*.cjs
git diff --check
python recovery/build-integrated-preview.py
```

The final full Node suite passed **307 tests: 307 passed, 0 failed, 0 cancelled, 0 skipped**. Coverage includes the existing ad/refill, payment, tap-save and account-boundary checks, plus the upgraded Shop/Invite/Vault/leaderboard/race behaviour. The focused command `node --test recovery/check-weekly-race.cjs` passed **12/12** cases covering period transitions, previous-day resume, active practice key retention, separate endpoints, account switches, mismatched data, closing-window availability, and scroll behaviour when entering/resuming a run versus selecting tiles. HTML IDs and all inline scripts are checked by the existing suite.

`git diff --check` passed. The synthetic preview generator ran successfully and checks its complete injected script with `node --check` before writing the output.

## Completed mobile browser review

The authorized synthetic HTTPS preview was reviewed at **320, 390 and 430 CSS pixels**, including the short 320 × 568 viewport. Primary panels and relevant edge states were checked:

- All five compact coin-pack rows and their purchase-review outcomes; shared VIP review with inactive, active, expired and pending states. Pending payment keeps checkout disabled and offers the existing check-payment recovery action.
- Invite overview/details, 48-character referral names, themed progress, and the named incoming welcome with its saved qualification goal.
- Vault rank/finish/medal views and one-, two- and three-player leaderboard podiums.
- Legacy weekly and new daily ranked allowances, practice entry/resume, a correct pair and completed practice run, and unchanged ranked allowance/best score after practice.
- Footer-safe scrolling and visible controls; on short screens the practice timer opens at the top and remains visible while reaching the tiles.

This validates layout and synthetic controller behaviour. It does not establish live provider ad fill, real payment delivery, or production API deployment.

## Synthetic preview

`recovery/build-integrated-preview.py` strips production bootstrap/external scripts, uses synthetic accounts and mock API responses, and writes outside the production tree by default to `/tmp/jigcoin-integrated-preview`. Its local assets link points to this checkout. It is not loaded by the production entrypoint and makes no production API calls.

Parameters: `panel=shop|vip|vault|invite|invite-details|leaderboard|weekly|welcome`; optional `case=active|expired|pending|solo|two|long|used|legacy|referred`; leaderboard also accepts `mode=daily|global|friends`. The default leaderboard has three players. The `long` case uses 48-character synthetic names; `pending` uses a valid-format synthetic stored request without an invoice. Weekly mocks use a consistent clock and support start/resume, answer, duplicate-answer reconciliation, expiry and a fresh practice run, while keeping practice outside the ranked quota and best score. The preview deliberately prevents checkout acceptance and does not simulate provider ad supply or real payment delivery.

## Remaining release gates

1. Deploy the approved backend migration/API and frontend commits through the authorized repositories and deployment services. Production deployment is still pending at this checkpoint.
2. After deployment, verify the actual frontend version, API contracts and live account states. Confirm a real ad and provider receipt on the device, and real completed checkout only through the established payment verification path. Local synthetic fixtures do not establish live ad fill, revenue or payment delivery.

Deploy the backend contract first (or atomically with this frontend). The client tolerates the legacy Invite contract and legacy global weekly shape, but new practice and daily-policy features require the v16 API. Follow the backend `recovery/INTEGRATED_RELEASE_V16.md` for migration order and rollback.
