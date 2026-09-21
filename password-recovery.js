const db = window.KUDOS_SUPABASE;

function esc(s='') {
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}

function clearRecoveryUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('kudos');
  history.replaceState({}, '', url.pathname + url.search);
}

function recoveryMarkup(message='') {
  return `
    <div class="modal-backdrop" id="kudos-password-reset-modal">
      <div class="modal">
        <h2>Set a new KUDOS password</h2>
        <p class="challenge-desc">Choose a new password for your Rep/Admin account.</p>
        ${message ? `<div class="notice">${esc(message)}</div>` : ''}
        <form id="kudos-password-reset-form">
          <div class="field">
            <label>New password</label>
            <input name="password" type="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters">
          </div>
          <div class="field">
            <label>Confirm password</label>
            <input name="confirm" type="password" minlength="10" required autocomplete="new-password" placeholder="Repeat password">
          </div>
          <button class="btn primary" type="submit">Update password</button>
        </form>
        <div id="kudos-password-reset-status" class="rep-tool-status" style="margin-top:10px"></div>
      </div>
    </div>`;
}

function showRecovery(message='') {
  if (document.getElementById('kudos-password-reset-modal')) return;
  const host = document.createElement('div');
  host.innerHTML = recoveryMarkup(message);
  document.body.appendChild(host.firstElementChild);

  document.getElementById('kudos-password-reset-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const status = document.getElementById('kudos-password-reset-status');
    const button = e.target.querySelector('button[type="submit"]');
    const fd = new FormData(e.target);
    const password = String(fd.get('password') || '');
    const confirm = String(fd.get('confirm') || '');

    if (password.length < 10) {
      if (status) status.innerHTML = '<div class="notice">Use at least 10 characters.</div>';
      return;
    }
    if (password !== confirm) {
      if (status) status.innerHTML = '<div class="notice">The passwords do not match.</div>';
      return;
    }

    try {
      if (button) button.disabled = true;
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;
      if (status) status.innerHTML = '<div class="notice success">Password updated. You can now sign in with the new password.</div>';
      clearRecoveryUrl();
      setTimeout(() => {
        document.getElementById('kudos-password-reset-modal')?.remove();
      }, 1400);
    } catch (err) {
      if (button) button.disabled = false;
      if (status) status.innerHTML = `<div class="notice">${esc(err?.message || err)}</div>`;
    }
  });
}

async function initialiseRecovery() {
  if (!db) return;

  const url = new URL(window.location.href);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const errorCode = hash.get('error_code');
  const errorDescription = hash.get('error_description');

  if (errorCode) {
    showRecovery(errorCode === 'otp_expired'
      ? 'This password reset link has expired or has already been used. Request a new reset email from KUDOS.'
      : (errorDescription || 'This password reset link could not be used.'));
    return;
  }

  const wantsReset = url.searchParams.get('kudos') === 'password-reset';
  const { data: { session } } = await db.auth.getSession();
  if (wantsReset && session) showRecovery();

  db.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showRecovery();
  });
}

initialiseRecovery().catch(err => console.error('KUDOS password recovery failed', err));
