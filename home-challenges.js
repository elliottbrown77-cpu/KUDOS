const KUDOS_HOME_ALL_CHALLENGES_VERSION = '2026-09-16.1';

const CFG = window.KUDOS_CONFIG || {};
const KEY = CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_ANON_KEY || '';
const READY = !!(CFG.SUPABASE_URL && KEY && window.supabase);

if (READY) {
  const db = window.supabase.createClient(CFG.SUPABASE_URL, KEY);
  let running = false;
  let timer = null;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[c]));
  const fmt = n => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  const pct = n => `${(Number(n || 0) * 100).toFixed(Number(n || 0) < .01 ? 2 : 1)}%`;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function homeChallengeGrid() {
    const main = document.querySelector('#app main');
    if (!main) return null;

    const heading = [...main.querySelectorAll('.section-title h2')]
      .find(h => /^Current challenges$/i.test((h.textContent || '').trim()));

    if (!heading) return null;
    const section = heading.closest('.section-title');
    const grid = section?.nextElementSibling;
    return grid?.classList?.contains('grid') ? grid : null;
  }

  async function loadHomeChallenges() {
    const profileId = localStorage.getItem('kudos_profile') || '';
    if (!profileId) return null;

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id,team_id,active')
      .eq('id', profileId)
      .eq('active', true)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.team_id) return null;

    const { data: team, error: teamError } = await db
      .from('teams')
      .select('id,name')
      .eq('id', profile.team_id)
      .maybeSingle();
    if (teamError) throw teamError;

    const { data: challenges, error: challengeError } = await db
      .from('challenges')
      .select('id,team_id,title,description,target,unit,source_type,start_date,end_date,active')
      .eq('team_id', profile.team_id)
      .eq('active', true)
      .order('start_date')
      .order('title');

    if (challengeError) throw challengeError;
    const rows = challenges || [];
    if (!rows.length) return { profile, team, challenges: [] };

    const ids = rows.map(c => c.id);

    const [progressRes, totalsRes, linksRes, psfsRes] = await Promise.all([
      db.from('challenge_progress').select('challenge_id,actual_progress,target,completion,remaining,contributors').in('challenge_id', ids),
      db.from('profile_challenge_totals').select('challenge_id,profile_id,contribution').eq('profile_id', profileId).in('challenge_id', ids),
      db.from('challenge_psfs').select('challenge_id,psf_id').in('challenge_id', ids),
      db.from('psfs').select('id,name')
    ]);

    const firstError = [progressRes, totalsRes, linksRes, psfsRes].find(r => r.error)?.error;
    if (firstError) throw firstError;

    const progress = Object.fromEntries((progressRes.data || []).map(x => [x.challenge_id, x]));
    const totals = Object.fromEntries((totalsRes.data || []).map(x => [x.challenge_id, Number(x.contribution || 0)]));
    const psfNames = Object.fromEntries((psfsRes.data || []).map(x => [x.id, x.name]));
    const challengePsfs = {};

    (linksRes.data || []).forEach(x => {
      (challengePsfs[x.challenge_id] ||= []).push(psfNames[x.psf_id]);
    });

    return {
      profile,
      team,
      challenges: rows.map(c => ({
        ...c,
        progress: progress[c.id] || null,
        mine: totals[c.id] || 0,
        psfs: (challengePsfs[c.id] || []).filter(Boolean)
      }))
    };
  }

  function card(c, teamName) {
    const s = c.progress || {};
    const target = Number(s.target ?? c.target ?? 0);
    const actual = Number(s.actual_progress || 0);
    const completion = Number(s.completion || 0);
    const contributors = Number(s.contributors || 0);
    const pc = clamp(completion * 100, 0, 100);

    return `<article class="card challenge-card" data-home-challenge-id="${esc(c.id)}">
      <div class="challenge-head">
        <div>
          <h3>${esc(c.title)}</h3>
          <div class="score-badge">${esc(teamName || 'Team')}</div>
        </div>
        <span class="unit-badge">${esc(c.unit)}</span>
      </div>
      <div class="challenge-desc">${esc(c.description || '')}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${pc}%"></div></div>
      <div class="progress-line">
        <span><strong>${fmt(actual)}</strong> / ${fmt(target)} ${esc(c.unit)}</span>
        <span><strong>${pct(completion)}</strong></span>
      </div>
      <div class="progress-line">
        <span>My contribution: <strong>${fmt(c.mine)} ${esc(c.unit)}</strong></span>
        <span>${contributors} contributor${contributors === 1 ? '' : 's'}</span>
      </div>
      <div class="tags">${c.psfs.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      <div class="actions">
        <button class="btn primary small" data-home-log="${esc(c.id)}">Add progress</button>
        <button class="btn ghost small" data-home-detail="${esc(c.id)}">View progress</button>
      </div>
    </article>`;
  }

  function relayToBase(action, challengeId) {
    const challengeNav = document.querySelector('.nav-btn[data-view="challenges"]');
    if (!challengeNav) return;
    challengeNav.click();

    requestAnimationFrame(() => {
      const selector = action === 'log'
        ? `[data-log="${CSS.escape(challengeId)}"]`
        : `[data-detail="${CSS.escape(challengeId)}"]`;
      document.querySelector(selector)?.click();
    });
  }

  async function enhance() {
    if (running) return;
    const grid = homeChallengeGrid();
    if (!grid) return;

    running = true;
    try {
      const data = await loadHomeChallenges();
      if (!data) return;

      const activeCount = data.challenges.length;
      const existingCount = grid.querySelectorAll('.challenge-card').length;

      // If app.js is later changed to show every challenge itself, this module
      // automatically becomes a no-op.
      if (existingCount === activeCount && activeCount > 0) return;

      grid.innerHTML = data.challenges.length
        ? data.challenges.map(c => card(c, data.team?.name)).join('')
        : '<div class="empty">No active challenges for this team.</div>';

      grid.dataset.homeAllChallenges = 'true';

      grid.querySelectorAll('[data-home-log]').forEach(btn => {
        btn.addEventListener('click', () => relayToBase('log', btn.dataset.homeLog));
      });
      grid.querySelectorAll('[data-home-detail]').forEach(btn => {
        btn.addEventListener('click', () => relayToBase('detail', btn.dataset.homeDetail));
      });
    } catch (err) {
      console.error('KUDOS Home All Challenges', err);
    } finally {
      running = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(enhance, 80);
  }

  const app = document.getElementById('app');
  if (app) {
    new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  }

  window.addEventListener('load', schedule);
  schedule();
}
