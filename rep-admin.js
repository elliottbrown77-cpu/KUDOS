const KUDOS_REP_TOOLS_VERSION = '2026-09-16.1';

const CFG = window.KUDOS_CONFIG || {};
const SUPABASE_KEY = CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_ANON_KEY || '';
const READY = !!(CFG.SUPABASE_URL && SUPABASE_KEY && window.supabase);

if (!READY) {
  console.info('KUDOS Rep Tools: Supabase is not configured; rep controls are disabled.');
} else {
  const db = window.supabase.createClient(CFG.SUPABASE_URL, SUPABASE_KEY);

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[c]));

  const fmt = n => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  let running = false;
  let scheduled = null;

  function isRepPage() {
    const main = document.querySelector('#app main');
    if (!main) return null;
    const headings = [...main.querySelectorAll('.section-title h2, h2')];
    const found = headings.some(h => /Performance Representative\s*\/\s*Admin/i.test(h.textContent || ''));
    return found ? main : null;
  }

  async function getContext() {
    const { data: { session } } = await db.auth.getSession();
    const user = session?.user || null;
    if (!user) return { user: null, appUser: null };

    const { data: appUser, error } = await db
      .from('app_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    return { user, appUser: appUser || null };
  }

  async function getTeams() {
    const { data, error } = await db
      .from('teams')
      .select('id,name,display_order,active')
      .eq('active', true)
      .order('display_order')
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async function loadTeamData(teamId) {
    const [profilesRes, challengesRes, scoresRes, adjustmentsRes] = await Promise.all([
      db.from('profiles').select('id,name,team_id,active').eq('team_id', teamId).eq('active', true).order('name'),
      db.from('challenges').select('id,title,target,unit,source_type,start_date,end_date,active,team_id,challenge_group_id').eq('team_id', teamId).eq('active', true).order('start_date'),
      db.from('profile_scores').select('profile_id,name,team_id,kudos_score,adjustment_points').eq('team_id', teamId).order('name'),
      db.from('kudos_point_adjustments').select('id,profile_id,team_id,points_delta,reason,created_at,created_by').eq('team_id', teamId).order('created_at', { ascending: false }).limit(50)
    ]);

    const firstError = [profilesRes, challengesRes, scoresRes, adjustmentsRes].find(r => r.error)?.error;
    if (firstError) throw firstError;

    const profiles = profilesRes.data || [];
    const challenges = challengesRes.data || [];
    const profileIds = profiles.map(p => p.id);

    let progress = [], recognition = [], innovation = [], safety = [];

    if (profileIds.length) {
      const [pRes, rRes, iRes, sRes] = await Promise.all([
        db.from('progress_entries').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }).limit(150),
        db.from('recognition_entries').select('*').in('submitter_profile_id', profileIds).order('created_at', { ascending: false }).limit(150),
        db.from('innovation_entries').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }).limit(150),
        db.from('safety_entries').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }).limit(150)
      ]);
      const entryError = [pRes, rRes, iRes, sRes].find(r => r.error)?.error;
      if (entryError) throw entryError;
      progress = pRes.data || [];
      recognition = rRes.data || [];
      innovation = iRes.data || [];
      safety = sRes.data || [];
    }

    return {
      profiles,
      challenges,
      scores: scoresRes.data || [],
      adjustments: adjustmentsRes.data || [],
      entries: { progress, recognition, innovation, safety }
    };
  }

  function entryRows(data) {
    const profileMap = Object.fromEntries(data.profiles.map(p => [p.id, p]));
    const challengeMap = Object.fromEntries(data.challenges.map(c => [c.id, c]));
    const rows = [];

    data.entries.progress.forEach(x => rows.push({
      id: x.id,
      type: 'progress',
      label: 'Progress',
      profileId: x.profile_id,
      person: profileMap[x.profile_id]?.name || 'Unknown profile',
      date: x.entry_date || String(x.created_at || '').slice(0, 10),
      title: challengeMap[x.challenge_id]?.title || 'Challenge progress',
      detail: `${fmt(x.value)} ${challengeMap[x.challenge_id]?.unit || ''}${x.note ? ` • ${x.note}` : ''}`
    }));

    data.entries.recognition.forEach(x => rows.push({
      id: x.id,
      type: 'recognition',
      label: 'Recognition',
      profileId: x.submitter_profile_id,
      person: profileMap[x.submitter_profile_id]?.name || 'Unknown profile',
      date: x.entry_date || String(x.created_at || '').slice(0, 10),
      title: `Nominee: ${x.nominated_person || 'Not recorded'}`,
      detail: x.reason || ''
    }));

    data.entries.innovation.forEach(x => rows.push({
      id: x.id,
      type: 'innovation',
      label: 'Innovation',
      profileId: x.profile_id,
      person: profileMap[x.profile_id]?.name || 'Unknown profile',
      date: x.entry_date || String(x.created_at || '').slice(0, 10),
      title: x.title || 'Innovation',
      detail: x.description || ''
    }));

    data.entries.safety.forEach(x => rows.push({
      id: x.id,
      type: 'safety',
      label: 'Flight Safety',
      profileId: x.profile_id,
      person: profileMap[x.profile_id]?.name || 'Unknown profile',
      date: x.entry_date || String(x.created_at || '').slice(0, 10),
      title: x.category || 'Flight Safety',
      detail: x.description || ''
    }));

    return rows
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 200);
  }

  function styles() {
    if (document.getElementById('kudos-rep-tools-styles')) return;
    const style = document.createElement('style');
    style.id = 'kudos-rep-tools-styles';
    style.textContent = `
      #kudos-rep-tools{margin-top:24px}
      #kudos-rep-tools .rep-tools-head{display:flex;gap:12px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}
      #kudos-rep-tools .rep-tools-head .field{min-width:220px;margin:0}
      #kudos-rep-tools .rep-tool-card{margin-top:14px}
      #kudos-rep-tools .rep-tool-actions{display:flex;gap:8px;flex-wrap:wrap}
      #kudos-rep-tools .rep-tool-table td,#kudos-rep-tools .rep-tool-table th{vertical-align:top}
      #kudos-rep-tools .rep-tool-table .detail{max-width:420px;white-space:normal}
      #kudos-rep-tools .rep-tool-table .num{text-align:right;white-space:nowrap}
      #kudos-rep-tools .rep-tool-muted{opacity:.72}
      #kudos-rep-tools .rep-tool-danger{background:#8d1f1f;color:#fff;border-color:#8d1f1f}
      #kudos-rep-tools .rep-tool-danger:hover{filter:brightness(.95)}
      #kudos-rep-tools .rep-tool-form{display:grid;grid-template-columns:1.2fr .7fr 2fr auto;gap:10px;align-items:end}
      #kudos-rep-tools .rep-tool-form .field{margin:0}
      #kudos-rep-tools .rep-tool-status{margin-top:10px}
      #kudos-rep-tools .adjustment-negative{font-weight:800}
      @media(max-width:760px){
        #kudos-rep-tools .rep-tool-form{grid-template-columns:1fr}
        #kudos-rep-tools .rep-tool-table{min-width:760px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderChallengeSection(data) {
    const rows = data.challenges.map(c => `
      <tr>
        <td><strong>${esc(c.title)}</strong><div class="help">${esc(c.source_type)} • ${esc(c.start_date)} to ${esc(c.end_date)}</div></td>
        <td>${fmt(c.target)} ${esc(c.unit)}</td>
        <td class="num"><button class="btn danger compact rep-tool-danger" data-rep-remove-challenge="${esc(c.id)}" data-title="${esc(c.title)}">Remove from team</button></td>
      </tr>
    `).join('');

    return `
      <div class="section-title"><h2>Challenge management</h2><p>Rep/Admin controls • soft removal keeps historic entries</p></div>
      <div class="card rep-tool-card">
        <div class="notice">Removing a challenge sets it inactive for this team. Its previous entries are retained for audit/history, but the challenge and its challenge-derived KUDOS no longer count in active reporting.</div>
        <div class="table-wrap" style="margin-top:12px">
          <table class="rep-tool-table">
            <thead><tr><th>Challenge</th><th>Target</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3"><div class="empty compact-empty">No active challenges for this team.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderEntrySection(data, existingAdminModeration) {
    if (existingAdminModeration) return '';
    const rows = entryRows(data).map(r => `
      <tr>
        <td><strong>${esc(r.label)}</strong></td>
        <td>${esc(r.person)}</td>
        <td>${esc(r.date)}</td>
        <td><strong>${esc(r.title)}</strong></td>
        <td class="detail">${esc(r.detail)}</td>
        <td class="num"><button class="btn danger compact rep-tool-danger" data-rep-delete-entry="${esc(r.id)}" data-entry-type="${esc(r.type)}">Remove</button></td>
      </tr>
    `).join('');

    return `
      <div class="section-title"><h2>Entry moderation</h2><p>Remove erroneous entries from your team</p></div>
      <div class="card rep-tool-card">
        <div class="notice">Removing an entry immediately recalculates challenge progress and KUDOS scores. Any email notification already sent cannot be recalled.</div>
        <div class="table-wrap" style="margin-top:12px">
          <table class="rep-tool-table">
            <thead><tr><th>Type</th><th>Submitted by</th><th>Date</th><th>Entry</th><th>Detail</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6"><div class="empty compact-empty">No entries to moderate for this team.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderPointsSection(data) {
    const scoreMap = Object.fromEntries(data.scores.map(s => [s.profile_id, s]));
    const profileOptions = data.profiles.map(p => {
      const score = scoreMap[p.id];
      const label = `${p.name} — ${fmt(score?.kudos_score || 0)} KUDOS`;
      return `<option value="${esc(p.id)}">${esc(label)}</option>`;
    }).join('');

    const adjustmentRows = data.adjustments.map(a => {
      const p = data.profiles.find(x => x.id === a.profile_id);
      return `
        <tr>
          <td>${esc(p?.name || 'Profile')}</td>
          <td class="num adjustment-negative">${fmt(a.points_delta)}</td>
          <td>${esc(a.reason)}</td>
          <td>${esc(String(a.created_at || '').replace('T', ' ').slice(0, 16))}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="section-title"><h2>KUDOS point adjustments</h2><p>Audited deductions only</p></div>
      <div class="card rep-tool-card">
        <div class="notice">Use this only when points need to be removed without deleting the underlying contribution. The deduction is permanent, reasoned and recorded in the audit log.</div>
        <form id="kudos-point-adjustment-form" class="rep-tool-form" style="margin-top:14px">
          <div class="field">
            <label>Person</label>
            <select name="profile_id" required>
              <option value="">Choose person…</option>
              ${profileOptions}
            </select>
          </div>
          <div class="field">
            <label>Points to remove</label>
            <input name="points" type="number" min="0.01" step="0.01" required placeholder="e.g. 20">
          </div>
          <div class="field">
            <label>Reason</label>
            <input name="reason" minlength="3" maxlength="500" required placeholder="Why are these points being removed?">
          </div>
          <button class="btn danger rep-tool-danger" type="submit">Remove points</button>
        </form>
        <div id="kudos-rep-tool-status" class="rep-tool-status"></div>
        <div class="section-title" style="margin-top:20px"><h2>Recent deductions</h2><p>${data.adjustments.length} shown</p></div>
        <div class="table-wrap">
          <table class="rep-tool-table">
            <thead><tr><th>Person</th><th>Points</th><th>Reason</th><th>Date</th></tr></thead>
            <tbody>${adjustmentRows || '<tr><td colspan="4"><div class="empty compact-empty">No point deductions recorded for this team.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function setStatus(message, isError = false) {
    const el = document.getElementById('kudos-rep-tool-status');
    if (!el) return;
    el.innerHTML = `<div class="notice ${isError ? '' : 'success'}">${esc(message)}</div>`;
  }

  async function removeChallenge(id, title) {
    const ok = window.confirm(`Remove "${title}" from this team's active challenges?\n\nHistoric entries will be retained, but the challenge will stop counting in active progress and challenge-derived KUDOS.`);
    if (!ok) return;

    const { data, error } = await db
      .from('challenges')
      .update({ active: false })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No challenge was changed. Check that you have permission for this team.');
    window.location.reload();
  }

  async function deleteEntry(type, id) {
    const tables = {
      progress: 'progress_entries',
      recognition: 'recognition_entries',
      innovation: 'innovation_entries',
      safety: 'safety_entries'
    };
    const table = tables[type];
    if (!table) throw new Error('Unknown entry type.');

    const ok = window.confirm('Remove this entry from KUDOS? Challenge progress and scores will be recalculated immediately.');
    if (!ok) return;

    const { data, error } = await db
      .from(table)
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No entry was removed. Check that it belongs to your team and that you have permission.');
    window.location.reload();
  }

  async function submitPointAdjustment(form, ctx, teamId, data) {
    const fd = new FormData(form);
    const profileId = String(fd.get('profile_id') || '');
    const points = Number(fd.get('points') || 0);
    const reason = String(fd.get('reason') || '').trim();

    if (!profileId || !Number.isFinite(points) || points <= 0 || reason.length < 3) {
      throw new Error('Choose a person, enter a positive number of points and provide a reason.');
    }

    const profile = data.profiles.find(p => p.id === profileId);
    if (!profile || profile.team_id !== teamId) {
      throw new Error('That profile is not part of the selected team.');
    }

    const currentScore = Number(data.scores.find(s => s.profile_id === profileId)?.kudos_score || 0);
    if (points > currentScore) {
      throw new Error(`You cannot remove ${fmt(points)} points because ${profile.name} currently has ${fmt(currentScore)} KUDOS.`);
    }

    const ok = window.confirm(`Remove ${fmt(points)} KUDOS points from ${profile.name}?\n\nCurrent score: ${fmt(currentScore)}\nReason: ${reason}\n\nThis action will be recorded in the audit log.`);
    if (!ok) return;

    const { data: inserted, error } = await db
      .from('kudos_point_adjustments')
      .insert({
        profile_id: profileId,
        team_id: teamId,
        points_delta: -Math.abs(points),
        reason,
        created_by: ctx.user.id
      })
      .select('id');

    if (error) throw error;
    if (!inserted?.length) throw new Error('The deduction was not recorded.');
    window.location.reload();
  }

  async function renderTools(main, ctx, teams, teamId) {
    const existing = document.getElementById('kudos-rep-tools');
    if (existing) existing.remove();

    const data = await loadTeamData(teamId);
    const selectedTeam = teams.find(t => t.id === teamId);
    const existingAdminModeration = !!main.querySelector('.moderation-table');

    const root = document.createElement('section');
    root.id = 'kudos-rep-tools';
    root.innerHTML = `
      <div class="section-title rep-tools-head">
        <div>
          <h2>Rep controls</h2>
          <p>${esc(selectedTeam?.name || 'Team')} • ${esc(String(ctx.appUser.role || '').toUpperCase())}</p>
        </div>
        ${ctx.appUser.role === 'admin' ? `
          <div class="field">
            <label>Manage team</label>
            <select id="kudos-rep-tools-team">
              ${teams.map(t => `<option value="${esc(t.id)}" ${t.id === teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
          </div>` : ''}
      </div>
      ${renderChallengeSection(data)}
      ${renderEntrySection(data, existingAdminModeration)}
      ${renderPointsSection(data)}
    `;
    main.appendChild(root);

    document.getElementById('kudos-rep-tools-team')?.addEventListener('change', e => {
      localStorage.setItem('kudos_rep_tools_team', e.target.value);
      document.getElementById('kudos-rep-tools')?.remove();
      schedule();
    });

    root.querySelectorAll('[data-rep-remove-challenge]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          await removeChallenge(btn.dataset.repRemoveChallenge, btn.dataset.title || 'challenge');
        } catch (err) {
          btn.disabled = false;
          setStatus(`Could not remove challenge: ${err.message || err}`, true);
        }
      });
    });

    root.querySelectorAll('[data-rep-delete-entry]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          await deleteEntry(btn.dataset.entryType, btn.dataset.repDeleteEntry);
        } catch (err) {
          btn.disabled = false;
          setStatus(`Could not remove entry: ${err.message || err}`, true);
        }
      });
    });

    document.getElementById('kudos-point-adjustment-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.target.querySelector('button[type="submit"]');
      try {
        if (button) button.disabled = true;
        setStatus('Saving deduction…');
        await submitPointAdjustment(e.target, ctx, teamId, data);
      } catch (err) {
        if (button) button.disabled = false;
        setStatus(`Could not remove points: ${err.message || err}`, true);
      }
    });
  }

  async function enhance() {
    if (running) return;
    const main = isRepPage();
    if (!main) return;
    if (document.getElementById('kudos-rep-tools')) return;

    running = true;
    try {
      styles();
      const ctx = await getContext();
      if (!ctx.user || !ctx.appUser || !['rep', 'admin'].includes(ctx.appUser.role)) return;

      const teams = await getTeams();
      let teamId = ctx.appUser.role === 'rep'
        ? ctx.appUser.team_id
        : (localStorage.getItem('kudos_rep_tools_team') || teams[0]?.id || '');

      if (!teams.some(t => t.id === teamId)) teamId = teams[0]?.id || '';
      if (!teamId) return;

      await renderTools(main, ctx, teams, teamId);
    } catch (err) {
      console.error('KUDOS Rep Tools', err);
      const root = document.getElementById('kudos-rep-tools') || document.createElement('section');
      root.id = 'kudos-rep-tools';
      root.innerHTML = `<div class="notice">Rep controls could not be loaded: ${esc(err.message || err)}</div>`;
      if (!root.parentNode && main) main.appendChild(root);
    } finally {
      running = false;
    }
  }

  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(enhance, 120);
  }

  const app = document.getElementById('app');
  if (app) {
    const observer = new MutationObserver(schedule);
    observer.observe(app, { childList: true, subtree: true });
  }

  window.addEventListener('load', schedule);
  schedule();
}
