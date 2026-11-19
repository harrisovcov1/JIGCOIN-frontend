/* One Telegram message for the next UTC streak reward. Consent is per reminder. */
(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const dialog = byId('streakMessageDialog');
  const buttons = [byId('calendarTelegramReminder'), byId('rewardsTelegramReminder')];
  const timeInput = byId('streakMessageTime');
  let owner = null;
  let revision = 0;
  let snapshot = null;
  let checked = false;
  let reading = false;
  let saving = false;
  let permissionGranted = false;
  let feedback = '';
  let launchConsumed = false;
  let dialogVisit = 0;

  function reset() {
    ++revision;
    owner = null;
    snapshot = null;
    checked = false;
    reading = false;
    saving = false;
    permissionGranted = false;
    feedback = '';
    timeInput.value = '19:00';
    for (const button of buttons) button.hidden = true;
    if (dialog.open) dialog.close();
  }

  function currentAccount() {
    const id = accountIsReady() ? homeUserId() : null;
    if (id !== owner) {
      reset();
      owner = id;
    }
    return id;
  }

  function claimedToday() {
    const checkin = dailyCheckinModel();
    return !!checkin?.claimed && !progressionError && Date.parse(checkin.resets_at) > progressionNow();
  }

  function zone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }

  function localSchedule() {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: snapshot.time_zone, timeZoneName: 'short'
    }).format(new Date(snapshot.due_at));
  }

  function render() {
    if (!currentAccount()) return;
    const canSet = claimedToday();
    for (const button of buttons) {
      button.hidden = !canSet && !snapshot;
      button.textContent = snapshot ? 'Manage Telegram reminder' : 'Remind me tomorrow';
    }
    if (!dialog.open) return;
    const chooseTime = checked && !snapshot && canSet;
    byId('streakMessageTimeField').hidden = !chooseTime;
    byId('streakMessageZone').textContent = zone().replaceAll('_', ' ');
    timeInput.disabled = saving || reading;
    byId('streakMessageSave').hidden = !chooseTime;
    byId('streakMessageCancel').hidden = !checked || !snapshot;
    byId('streakMessageRetry').hidden = checked || saving || reading;
    byId('streakMessageSave').disabled = saving || reading;
    byId('streakMessageCancel').disabled = saving || reading;
    byId('streakMessageTerms').textContent = snapshot
      ? 'JigCoin will message you only if that daily reward is still unclaimed.'
      : 'Choose a time tomorrow. Get one Telegram message if your next daily reward is still unclaimed.';
    const message = feedback || (reading ? 'Checking your reminder…' :
      snapshot ? 'Scheduled for ' + localSchedule() + '.' :
      !checked ? 'Check your reminder to continue.' :
      !canSet ? 'Collect today’s daily reward to set your next reminder.' : '');
    const status = byId('streakMessageStatus');
    if (status.textContent !== message) status.textContent = message;
  }

  function takeSnapshot(response) {
    if (!response?.ok || !Object.hasOwn(response, 'reminder')) return false;
    const entry = response.reminder;
    if (entry !== null) {
      if (!Number.isFinite(Date.parse(entry?.due_at)) || typeof entry.time_zone !== 'string') return false;
      try { new Intl.DateTimeFormat('en-GB', {timeZone: entry.time_zone}); } catch (_) { return false; }
    }
    snapshot = entry;
    checked = true;
    return true;
  }

  async function refresh() {
    const id = currentAccount();
    if (!id || reading || saving) return;
    const ticket = ++revision;
    reading = true;
    feedback = '';
    render();
    const response = await apiPost('/api/streak/reminder/status', {}, {tapOwner:id,timeoutMs:8000});
    if (ticket !== revision || id !== currentAccount()) return;
    reading = false;
    checked = takeSnapshot(response);
    if (!checked) feedback = 'Couldn’t check your reminder. Try again.';
    render();
  }

  function requestPermission() {
    const telegram = window.Telegram?.WebApp;
    if (permissionGranted || telegram?.initDataUnsafe?.user?.allows_write_to_pm === true) return Promise.resolve(true);
    if (!telegram?.requestWriteAccess || (telegram.isVersionAtLeast && !telegram.isVersionAtLeast('6.9'))) {
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(null), 30000);
      try {
        telegram.requestWriteAccess(allowed => {
          clearTimeout(timeout);
          resolve(allowed === true);
        });
      } catch (_) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  async function save(enabled) {
    const id = currentAccount();
    if (!id || !dialog.open || saving || reading || !checked) return;
    if (enabled && (!claimedToday() || !timeInput.reportValidity())) return;
    const payload = enabled ? {enabled:true, consent:true, local_time:timeInput.value, time_zone:zone()} : {enabled:false};
    const ticket = ++revision;
    const visit = dialogVisit;
    const valid = () => ticket === revision && id === currentAccount();
    saving = true;
    feedback = enabled ? 'Checking permission…' : 'Cancelling…';
    render();
    try {
      if (enabled) {
        const allowed = await requestPermission();
        if (!valid() || !dialog.open || visit !== dialogVisit) return;
        if (allowed !== true) {
          feedback = allowed === false ? 'Permission declined. You can collect your next daily reward in Rewards.' :
            'Open JigCoin in an up-to-date Telegram app to allow reminders.';
          return;
        }
        permissionGranted = true;
        feedback = 'Saving reminder…';
        render();
      }
      const post = () => apiPost('/api/streak/reminder/set', payload, {tapOwner:id,timeoutMs:8000});
      let response = await post();
      // The permission service update can arrive a moment after Telegram closes its permission sheet.
      if (enabled && response?.reason === 'REMINDER_WRITE_PERMISSION' && valid() && dialog.open) {
        await new Promise(resolve => setTimeout(resolve, 1100));
        if (!valid() || !dialog.open || visit !== dialogVisit) return;
        response = await post();
      }
      if (!valid()) return;
      if (takeSnapshot(response)) {
        feedback = snapshot ? 'Scheduled for ' + localSchedule() + '.' : 'Reminder cancelled.';
      } else if (response?.reason === 'REMINDER_TIME_OUTSIDE_REWARD_DAY') {
        feedback = 'Choose a different time tomorrow, within the next UTC reward day.';
      } else if (response?.status === 409) {
        feedback = 'Refresh Rewards and collect today’s reward before setting a reminder.';
      } else if (response?.status === 403) {
        permissionGranted = false;
        feedback = 'Telegram hasn’t confirmed permission. Reopen JigCoin from the bot and try again.';
      } else {
        checked = false;
        feedback = 'Couldn’t confirm the change. Check your reminder before trying again.';
      }
    } finally {
      if (valid()) {
        saving = false;
        render();
      }
    }
  }

  for (const button of buttons) button.addEventListener('click', () => {
    if (!currentAccount() || dialog.open) return;
    if (!dialog.showModal) { showToast('Open JigCoin in an up-to-date Telegram app to set a reminder.'); return; }
    feedback = '';
    dialog.showModal();
    render();
    void refresh();
  });
  dialog.addEventListener('close', () => { ++dialogVisit; });
  byId('streakMessageSave').addEventListener('click', () => void save(true));
  byId('streakMessageCancel').addEventListener('click', () => void save(false));
  byId('streakMessageRetry').addEventListener('click', () => void refresh());
  byId('streakMessageClose').addEventListener('click', () => dialog.close());

  function openFromBot() {
    if (launchConsumed || !accountIsReady()) return;
    const tg = window.Telegram?.WebApp;
    const start = tg?.initDataUnsafe?.start_param || new URLSearchParams(tg?.initData).get('start_param') ||
      new URLSearchParams(location.search).get('tgWebAppStartParam') ||
      new URLSearchParams(location.hash.slice(1)).get('tgWebAppStartParam');
    if (start === 'daily_rewards') {
      launchConsumed = true;
      void openBoostSheet('daily');
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (dialog.open || byId('homeDailySheet').classList.contains('show') || byId('boostSheet').classList.contains('show'))) void refresh();
  });
  window.JigStreakReminder = {render, refresh, reset};
  window.addEventListener('jigcoin:account-ready', openFromBot);
  render();
  openFromBot();
})();
