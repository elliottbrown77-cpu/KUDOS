const KUDOS_TEAM_SELECTOR_VERSION = '2026-09-16.2';

const CFG = window.KUDOS_CONFIG || {};
const KEY = CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_ANON_KEY || '';
const READY = !!(CFG.SUPABASE_URL && KEY && window.supabase);

if (READY) {
  const db = window.supabase.createClient(CFG.SUPABASE_URL, KEY);

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[c]));

  const today = () => new Date().toISOString().slice(0, 10);

  function getActingMode(appUser) {
    const stored = localStorage.getItem('kudos_acting_mode') || '';
    if (appUser?.role === 'admin') {
      return ['individual', 'rep', 'admin'].includes(stored) ? stored : 'admin';
    }
    if (appUser?.role === 'rep') return stored === 'individual' ? 'individual' : 'rep';
    return 'individual';
  }

  async function context() {
    const { data: { session } } = await db.auth.getSession();
    const user = session?.user || null;
    if (!user) return { user: null, appUser: null, profile: null };

    const [{ data: appUser, error: appError }, profileId] = await Promise.all([
      db.from('app_users').select('auth_user_id,role,team_id').eq('auth_user_id', user.id).maybeSingle(),
      Promise.resolve(localStorage.getItem('kudos_profile') || '')
    ]);
    if (appError) throw appError;

    let profile = null;
    if (profileId) {
      const { data, error } = await db.from('profiles').select('id,name,team_id,active').eq('id', profileId).maybeSingle();
      if (error) throw error;
      profile = data || null;
    }

    return { user, appUser: appUser || null, profile };
  }

  async function activeTeams() {
    const { data, error } = await db
      .from('teams')
      .select('id,name,display_order,active')
      .eq('active', true)
      .order('display_order')
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async function psfs() {
    const { data, error } = await db.from('psfs').select('id,name,display_order').order('display_order');
    if (error) throw error;
    return data || [];
  }

  function addStyles() {
    if (document.getElementById('kudos-shared-challenge-styles')) return;
    const style = document.createElement('style');
    style.id = 'kudos-shared-challenge-styles';
    style.textContent = `
      #kudos-shared-challenge-modal .team-select-box{
        border:1px solid rgba(12,35,56,.14);border-radius:14px;padding:12px;background:rgba(12,35,56,.025)
      }
      #kudos-shared-challenge-modal .team-select-all{
        display:flex;gap:9px;align-items:center;padding:3px 2px 11px;border-bottom:1px solid rgba(12,35,56,.10);margin-bottom:10px;cursor:pointer
      }
      #kudos-shared-challenge-modal .team-select-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}
      #kudos-shared-challenge-modal .team-choice{display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 8px;border-radius:9px}
      #kudos-shared-challenge-modal .team-choice:hover{background:rgba(12,35,56,.05)}
      #kudos-shared-challenge-modal input[type="checkbox"]{width:18px;height:18px;accent-color:#435F46}
      #kudos-shared-challenge-modal .locked-team{opacity:.82}
      #kudos-shared-challenge-modal .challenge-status{margin-top:10px}
      @media(max-width:620px){#kudos-shared-challenge-modal .team-select-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function teamSelector(teams, repTeamId, mode) {
    const isRepMode = mode === 'rep';
    return `
      <div class="field">
        <label>Applies to teams</label>
        <div class="team-select-box">
          <label class="team-select-all">
            <input type="checkbox" id="challengeAllTeams" checked>
            <strong>All teams</strong>
          </label>
          <div class="team-select-grid">
            ${teams.map(t => {
              const locked = isRepMode && t.id === repTeamId;
              return `
                <label class="team-choice ${locked ? 'locked-team' : ''}">
                  <input type="checkbox" name="challenge_team_ids" value="${esc(t.id)}" checked ${locked ? 'disabled data-required-rep-team="true"' : ''}>
                  <span>${esc(t.name)}${locked ? ' • your Rep team' : ''}</span>
                </label>`;
            }).join('')}
          </div>
        </div>
        <div class="help">${isRepMode
          ? 'Your Rep team must remain included. Leave All teams selected for a CHF-wide challenge, or untick other teams for a smaller comparison group.'
          : 'Leave All teams selected for a CHF-wide challenge, or untick teams to create one directly comparable challenge across a selected group.'}</div>
      </div>
    `;
  }

  function psfSelector(rows) {
    return `<div class="field"><label>Performance Shaping Factors</label><div class="psf-grid">${
      rows.map(x => `<label class="psf"><input type="checkbox" name="psfs" value="${esc(x.name)}">${esc(x.name)}</label>`).join('')
    }</div></div>`;
  }

  async function showChallengeModal() {
    const ctx = await context();
    if (!ctx.user || !ctx.appUser || !['rep','admin'].includes(ctx.appUser.role)) {
      throw new Error('Rep or Administrator sign-in is required.');
    }

    const mode = getActingMode(ctx.appUser);
    if (!['rep','admin'].includes(mode)) throw new Error('Switch to Rep or Admin mode to create a challenge.');

    const [teams, psfRows] = await Promise.all([activeTeams(), psfs()]);
    const repTeamId = ctx.appUser.team_id || ctx.profile?.team_id || '';

    if (mode === 'rep' && !repTeamId) {
      throw new Error('Rep mode needs a Rep team. Assign one in Admin access, or choose an individual profile attached to a team.');
    }

    addStyles();
    document.getElementById('kudos-shared-challenge-modal')?.remove();

    const wrap = document.createElement('div');
    wrap.id = 'kudos-shared-challenge-modal';
    wrap.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
            <div>
              <h2 style="margin-bottom:4px">Create shared challenge</h2>
              <div class="help">${mode === 'admin' ? 'Administrator mode • global scope' : 'Performance Rep mode • shared team challenge'}</div>
            </div>
            <button class="btn ghost compact" type="button" data-close-shared-challenge>Close</button>
          </div>
          <form id="sharedChallengeForm" style="margin-top:14px">
            ${teamSelector(teams, repTeamId, mode)}
            <div class="grid two">
              <div class="field"><label>Challenge name</label><input name="title" required placeholder="e.g. Move Together"></div>
              <div class="field"><label>Measure</label><input name="unit" required placeholder="km, pauses, shares..."></div>
            </div>
            <div class="field"><label>Objective</label><textarea name="description" required placeholder="One sentence. If it cannot be explained in one sentence, simplify it."></textarea></div>
            <div class="grid two">
              <div class="field"><label>Team target</label><input name="target" type="number" min="0" step="any" required></div>
              <div class="field"><label>Source type</label><select name="source_type"><option value="progress">Normal progress</option><option value="recognition">Recognition count</option><option value="innovation">Innovation count</option><option value="safety">Flight Safety count</option></select></div>
            </div>
            <div class="grid two">
              <div class="field"><label>Start date</label><input name="start_date" type="date" value="${today()}" required></div>
              <div class="field"><label>End date</label><input name="end_date" type="date" required></div>
            </div>
            ${psfSelector(psfRows)}
            <button class="btn primary" type="submit">Create challenge</button>
            <div class="challenge-status" id="sharedChallengeStatus"></div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const form = wrap.querySelector('#sharedChallengeForm');
    const all = form.querySelector('#challengeAllTeams');
    const boxes = [...form.querySelectorAll('input[name="challenge_team_ids"]')];

    const syncAll = () => {
      const selectable = boxes.filter(b => !b.disabled);
      const allChecked = selectable.every(b => b.checked) && boxes.every(b => b.checked);
      const anyChecked = boxes.some(b => b.checked);
      all.checked = allChecked;
      all.indeterminate = !allChecked && anyChecked;
    };

    all.addEventListener('change', () => {
      boxes.forEach(b => {
        if (!b.disabled) b.checked = all.checked;
        else b.checked = true;
      });
      syncAll();
    });
    boxes.forEach(b => b.addEventListener('change', syncAll));

    wrap.querySelector('[data-close-shared-challenge]').addEventListener('click', () => wrap.remove());

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('#sharedChallengeStatus');
      const fd = new FormData(form);

      try {
        button.disabled = true;
        button.textContent = 'Creating…';
        status.innerHTML = '<div class="notice">Creating challenge…</div>';

        const selectedTeamIds = boxes.filter(b => b.checked).map(b => b.value);
        if (!selectedTeamIds.length) throw new Error('Select at least one team.');
        if (mode === 'rep' && !selectedTeamIds.includes(repTeamId)) {
          throw new Error('Your Rep team must be included.');
        }

        const payload = {
          team_ids: selectedTeamIds,
          title: String(fd.get('title') || '').trim(),
          description: String(fd.get('description') || '').trim(),
          target: Number(fd.get('target')),
          unit: String(fd.get('unit') || '').trim(),
          source_type: String(fd.get('source_type') || 'progress'),
          start_date: String(fd.get('start_date') || ''),
          end_date: String(fd.get('end_date') || ''),
          psf_names: fd.getAll('psfs').map(String)
        };

        const { data, error } = await db.functions.invoke('create-team-challenge-set', { body: payload });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const copies = Number(data?.copies || selectedTeamIds.length);
        status.innerHTML = `<div class="notice success">Challenge created for ${copies} team${copies === 1 ? '' : 's'}.</div>`;
        setTimeout(() => window.location.reload(), 700);
      } catch (err) {
        status.innerHTML = `<div class="notice">${esc(err.message || err)}</div>`;
        button.disabled = false;
        button.textContent = 'Create challenge';
      }
    });
  }

  document.addEventListener('click', e => {
    const trigger = e.target.closest?.('[data-kudos-create-challenge], [data-action="newChallenge"]');
    if (!trigger) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    showChallengeModal().catch(err => {
      window.alert(`Could not open challenge creator: ${err.message || err}`);
    });
  }, true);
}
