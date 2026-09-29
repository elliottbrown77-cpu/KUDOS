const KUDOS_PUSH_VERSION = '2026-09-29.2';
const KUDOS_VAPID_PUBLIC_KEY = 'BO8d__SEQvllT9hy8fO2KRcjG8kbW-Zb52rq8KEUvFIdfzToPEtkJwTJNvBK5ILXxj3vvT2vfKPQtrlEBZACPqE';
let reminderCardRendering = false;

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}

function deviceId() {
  let id = localStorage.getItem('kudos_push_device_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() :
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('kudos_push_device_id', id);
  }
  return id;
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

async function postSubscription(action, subscription = null) {
  const response = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, deviceId: deviceId(), subscription })
  });
  if (!response.ok) throw new Error((await response.text()) || 'Could not save notification preference');
}

async function ensureFreshServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  try { await registration.update(); }
  catch (error) { console.warn('KUDOS service worker update check failed', error); }
  return registration;
}

async function currentSubscription() {
  const registration = await ensureFreshServiceWorker();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function subscribe() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }
  if (isIOS() && !isStandalone()) {
    throw new Error('On iPhone, install KUDOS to the Home Screen first, then open the installed app and enable reminders.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted. You can change this in your browser or phone settings.');
  }

  const registration = await ensureFreshServiceWorker();
  if (!registration) throw new Error('KUDOS service worker is not ready.');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(KUDOS_VAPID_PUBLIC_KEY)
    });
  }

  await postSubscription('subscribe', subscription.toJSON());
  return subscription;
}

async function unsubscribe() {
  const subscription = await currentSubscription();
  if (subscription) await subscription.unsubscribe();
  await postSubscription('unsubscribe');
}
async function showLocalNotificationTest() {
  if (Notification.permission !== 'granted') {
    throw new Error('Notifications are not allowed for KUDOS on this device.');
  }
  const registration = await ensureFreshServiceWorker();
  if (!registration) throw new Error('KUDOS service worker is not ready.');
  await registration.showNotification('KUDOS phone test', {
    body: 'This confirms your Galaxy/Android notification settings can display KUDOS notifications.',
    icon: '/kudos-app-192-v2.png',
    badge: '/kudos-app-192-v2.png',
    tag: 'kudos-local-diagnostic-' + Date.now(),
    data: { url: '/' }
  });
}

async function repairPushSubscription() {
  const existing = await currentSubscription();
  if (existing) {
    try { await existing.unsubscribe(); } catch {}
  }
  try { await postSubscription('unsubscribe'); } catch {}
  const subscription = await subscribe();
  localStorage.setItem('kudos_push_enabled', '1');
  return subscription;
}

async function sendTestNotification() {
  const response = await fetch('/api/push-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId() })
  });

  let payload = {};
  try { payload = await response.json(); } catch {}

  if (!response.ok) {
    if (response.status === 410 || payload?.expired) {
      try {
        const existing = await currentSubscription();
        if (existing) await existing.unsubscribe();
      } catch {}
      localStorage.setItem('kudos_push_enabled', '0');
    }
    throw new Error(payload?.error || `Test notification failed (HTTP ${response.status})`);
  }
  return payload;
}

function notificationSupportMessage() {
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
    return 'This browser does not support web push notifications.';
  }
  if (isIOS() && !isStandalone()) {
    return 'On iPhone, add KUDOS to your Home Screen and open the installed app before enabling notifications.';
  }
  if (Notification.permission === 'denied') {
    return 'Notifications are blocked for KUDOS in your browser or phone settings. Allow notifications for KUDOS, then return here.';
  }
  return '';
}



function initialOptInPrompt() {
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'default') return;
  if (isIOS() && !isStandalone()) return;
  if (document.getElementById('kudos-notification-optin')) return;

  const dismissedAt = Number(localStorage.getItem('kudos_notification_prompt_dismissed') || 0);
  const oneDay = 24 * 60 * 60 * 1000;
  if (dismissedAt && Date.now() - dismissedAt < oneDay) return;

  const prompt = document.createElement('div');
  prompt.id = 'kudos-notification-optin';
  prompt.setAttribute('role', 'region');
  prompt.setAttribute('aria-label', 'Turn on KUDOS reminders');
  prompt.innerHTML = `
    <div class="kudos-notification-optin-copy">
      <strong>Turn on KUDOS reminders</strong>
      <span>Get a reminder to update your progress every Monday at 08:00 and Friday at 12:00.</span>
    </div>
    <div class="kudos-notification-optin-actions">
      <button type="button" class="btn ghost" id="kudos-notification-later">Not now</button>
      <button type="button" class="btn navy" id="kudos-notification-enable">Enable notifications</button>
    </div>`;
  document.body.appendChild(prompt);

  document.getElementById('kudos-notification-later')?.addEventListener('click', () => {
    localStorage.setItem('kudos_notification_prompt_dismissed', String(Date.now()));
    prompt.remove();
  });

  document.getElementById('kudos-notification-enable')?.addEventListener('click', async () => {
    const button = document.getElementById('kudos-notification-enable');
    if (button) {
      button.disabled = true;
      button.textContent = 'Enabling…';
    }
    try {
      await subscribe();
      localStorage.setItem('kudos_push_enabled', '1');
      localStorage.removeItem('kudos_notification_prompt_dismissed');
      let enabledMessage='Reminders are enabled on this device.';
      try {
        await sendTestNotification();
        enabledMessage='Reminders enabled. Use Test phone and Test push below to verify this device.';
      } catch (testError) {
        enabledMessage=`Reminders enabled, but the test failed: ${testError?.message || testError}`;
      }
      prompt.remove();
      document.getElementById('kudos-reminder-card')?.remove();
      await renderReminderCard(enabledMessage);
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = 'Enable notifications';
      }
      const copy = prompt.querySelector('.kudos-notification-optin-copy span');
      if (copy) copy.textContent = error?.message || String(error);
    }
  });
}

function notificationCard(enabled, message = '') {
  const supportMessage = notificationSupportMessage();
  const detail = message || supportMessage || (enabled
    ? 'Monday 08:00 and Friday 12:00 reminders are enabled on this device.'
    : 'Enable reminders for Monday 08:00 and Friday 12:00.');
  const blocked = Notification.permission === 'denied';
  return `
    <div class="card kudos-reminder-card" id="kudos-reminder-card">
      <div>
        <div class="eyebrow">PROGRESS REMINDERS</div>
        <h3 style="margin:.2rem 0 .35rem">KUDOS notifications</h3>
        <div class="help" style="margin-top:7px">${detail}</div>
      </div>
      <div class="kudos-reminder-actions">
        ${enabled ? '<button class="btn ghost" id="kudos-reminder-phone-test">Test phone</button><button class="btn ghost" id="kudos-reminder-test">Test push</button><button class="btn ghost" id="kudos-reminder-repair">Repair</button>' : ''}
        <button class="btn ${enabled ? 'ghost' : 'navy'}" id="kudos-reminder-toggle" ${blocked?'disabled':''}>${enabled ? 'Turn off reminders' : blocked ? 'Blocked in settings' : 'Enable reminders'}</button>
      </div>
    </div>`;
}

async function renderReminderCard(message = '') {
  if (reminderCardRendering) return;
  const main = document.querySelector('#app main');
  if (!main) return;

  const existingCards = [...document.querySelectorAll('#kudos-reminder-card')];
  if (existingCards.length) {
    existingCards.slice(1).forEach(card => card.remove());
    return;
  }

  reminderCardRendering = true;
  try {
  const headings = [...main.querySelectorAll('.section-title h2, h2')];
  const home = headings.some(h => /overview|make a contribution|current challenges/i.test(h.textContent || ''));
  if (!home) return;

  let enabled = false;
  try { enabled = !!(await currentSubscription()) && Notification.permission === 'granted'; }
  catch {}

  if (enabled) {
    const crests = main.querySelector('.crest-row');
    if (crests) {
      crests.insertAdjacentHTML('beforebegin', notificationCard(true, message));
    } else {
      main.insertAdjacentHTML('beforeend', notificationCard(true, message));
    }
  } else {
    const hero = main.querySelector('.hero');
    if (!hero) return;
    hero.insertAdjacentHTML('afterend', notificationCard(false, message));
  }

  document.getElementById('kudos-reminder-phone-test')?.addEventListener('click', async () => {
    const button = document.getElementById('kudos-reminder-phone-test');
    if (button) { button.disabled = true; button.textContent = 'Testing…'; }
    try {
      await showLocalNotificationTest();
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard('Phone test requested. If no “KUDOS phone test” appears, Android/Chrome notification settings are blocking display.');
    } catch (error) {
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard(error?.message || String(error));
    }
  });

  document.getElementById('kudos-reminder-test')?.addEventListener('click', async () => {
    const button = document.getElementById('kudos-reminder-test');
    if (button) { button.disabled = true; button.textContent = 'Sending…'; }
    try {
      const result = await sendTestNotification();
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard(result?.accepted ? 'Push provider accepted the remote test. If no “KUDOS push test” appears, use Test phone; if that works, use Repair.' : 'Remote push test requested.');
    } catch (error) {
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard(error?.message || String(error));
    }
  });

  document.getElementById('kudos-reminder-repair')?.addEventListener('click', async () => {
    const button = document.getElementById('kudos-reminder-repair');
    if (button) { button.disabled = true; button.textContent = 'Repairing…'; }
    try {
      await repairPushSubscription();
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard('Push subscription rebuilt. Run Test push again.');
    } catch (error) {
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard('Repair failed: ' + (error?.message || String(error)));
    }
  });

  document.getElementById('kudos-reminder-toggle')?.addEventListener('click', async () => {
    const button = document.getElementById('kudos-reminder-toggle');
    if (button) button.disabled = true;
    try {
      if (enabled) {
        await unsubscribe();
        localStorage.setItem('kudos_push_enabled', '0');
        document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
        reminderCardRendering = false;
        await renderReminderCard('Reminders are off on this device.');
      } else {
        await subscribe();
        localStorage.setItem('kudos_push_enabled', '1');
        let enabledMessage='Reminders are enabled on this device.';
        try {
          await sendTestNotification();
          enabledMessage='Reminders enabled. Use Test phone and Test push below to verify this device.';
        } catch (testError) {
          enabledMessage=`Reminders enabled, but the test failed: ${testError?.message || testError}`;
        }
        document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
        reminderCardRendering = false;
        await renderReminderCard(enabledMessage);
      }
    } catch (error) {
      document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
      reminderCardRendering = false;
      await renderReminderCard(error?.message || String(error));
    }
  });
  } finally {
    reminderCardRendering = false;
  }
}

async function resyncExistingSubscription() {
  try {
    const subscription = await currentSubscription();
    if (subscription && Notification.permission === 'granted') {
      await postSubscription('subscribe', subscription.toJSON());
      localStorage.setItem('kudos_push_enabled', '1');
    }
  } catch (error) {
    console.warn('KUDOS reminder resync failed', error);
  }
}

function openLogFromNotification() {
  if (new URL(location.href).searchParams.get('kudos') !== 'log') return;
  const tryOpen = () => {
    const button = document.querySelector('[data-view="log"]');
    if (!button) return false;
    button.click();
    history.replaceState({}, '', location.pathname);
    return true;
  };
  if (!tryOpen()) {
    const timer = setInterval(() => {
      if (tryOpen()) clearInterval(timer);
    }, 250);
    setTimeout(() => clearInterval(timer), 8000);
  }
}

const observer = new MutationObserver(() => renderReminderCard());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('load', () => {
  renderReminderCard();
  resyncExistingSubscription();
  openLogFromNotification();
  setTimeout(initialOptInPrompt, 1400);
});
