const KUDOS_PUSH_VERSION = '2026-09-20.4';
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

async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
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

  const registration = await navigator.serviceWorker.ready;
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
      prompt.remove();
      document.getElementById('kudos-reminder-card')?.remove();
      await renderReminderCard('Reminders are enabled on this device.');
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
  return `
    <div class="card kudos-reminder-card" id="kudos-reminder-card">
      <div>
        <div class="eyebrow">PROGRESS REMINDERS</div>
        <h3 style="margin:.2rem 0 .35rem">KUDOS notifications</h3>
        ${message ? `<div class="help" style="margin-top:7px">${message}</div>` : ''}
      </div>
      <button class="btn ${enabled ? 'ghost' : 'navy'}" id="kudos-reminder-toggle">${enabled ? 'Turn off reminders' : 'Enable reminders'}</button>
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
        document.querySelectorAll('#kudos-reminder-card').forEach(card => card.remove());
        reminderCardRendering = false;
        await renderReminderCard('Reminders are enabled on this device.');
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
  if (localStorage.getItem('kudos_push_enabled') !== '1') return;
  try {
    const subscription = await currentSubscription();
    if (subscription && Notification.permission === 'granted') {
      await postSubscription('subscribe', subscription.toJSON());
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
