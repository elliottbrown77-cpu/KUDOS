const KUDOS_REP_TOOLS_VERSION = '2026-09-21.6';

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


  async function getSelectedProfileContext() {
    const profileId = localStorage.getItem('kudos_profile') || '';
    if (!profileId) return null;
    const { data, error } = await db
      .from('profiles')
      .select('id,name,team_id,active')
      .eq('id', profileId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  function getActingMode(ctx) {
    const stored = localStorage.getItem('kudos_acting_mode') || '';
    if (ctx.appUser?.role === 'admin') {
      return ['individual','rep','admin'].includes(stored) ? stored : 'admin';
    }
    if (ctx.appUser?.role === 'rep') {
      return stored === 'individual' ? 'individual' : 'rep';
    }
    return 'individual';
  }

  function resolvedRepTeamId(ctx, profile, teams) {
    const candidate = ctx.appUser?.team_id || profile?.team_id || '';
    return teams.some(t => t.id === candidate) ? candidate : '';
  }

  function hideCoreRepPage(main) {
    [...main.children].forEach(el => {
      if (el.id === 'kudos-rep-tools') return;
      el.style.display = 'none';
      el.setAttribute('data-kudos-core-rep-hidden', 'true');
    });
  }

  function modeLabel(mode) {
    if (mode === 'admin') return 'Administrator';
    if (mode === 'rep') return 'Performance Rep';
    return 'Individual';
  }

  function actingModeBar(ctx, profile, teams, mode, repTeamId) {
    const repTeam = teams.find(t => t.id === repTeamId);
    const buttons = [
      `<button class="btn ${mode==='individual'?'primary':'ghost'} acting-mode-btn" data-kudos-acting-mode="individual">Individual</button>`,
      `<button class="btn ${mode==='rep'?'primary':'ghost'} acting-mode-btn" data-kudos-acting-mode="rep" ${repTeamId?'':'disabled'}>Rep</button>`,
      ctx.appUser?.role === 'admin'
        ? `<button class="btn ${mode==='admin'?'primary':'ghost'} acting-mode-btn" data-kudos-acting-mode="admin">Admin</button>`
        : ''
    ].join('');

    let context = '';
    if (mode === 'individual') {
      context = profile
        ? `Normal KUDOS member view • ${esc(profile.name)} • ${esc(teams.find(t=>t.id===profile.team_id)?.name || 'Team')}`
        : 'Normal KUDOS member view • choose an individual profile from the profile button.';
    } else if (mode === 'rep') {
      context = repTeam
        ? `Team-scoped Rep context • ${esc(repTeam.name)}`
        : 'No Rep team is assigned. An Admin can set the Rep team in Access accounts.';
    } else {
      context = 'Global Administrator context • not tied to your individual profile or team.';
    }

    return `
      <div class="card acting-shell">
        <div class="acting-head">
          <div>
            <h2 style="margin:0">Acting as: ${esc(modeLabel(mode))}</h2>
            <div class="acting-modes">${buttons}</div>
            <div class="acting-context">${context}</div>
          </div>
          <div class="mode-actions">
            ${mode!=='individual' ? `<button class="btn navy" data-kudos-create-challenge>Create challenge</button>` : ''}
            <button class="btn ghost" data-kudos-signout>Sign out</button>
          </div>
        </div>
      </div>
    `;
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
      db.from('kudos_point_adjustments').select('id,profile_id,team_id,points_delta,reason,created_at,created_by').eq('team_id', teamId).order('created_at', { ascending: false })
    ]);

    const firstError = [profilesRes, challengesRes, scoresRes, adjustmentsRes].find(r => r.error)?.error;
    if (firstError) throw firstError;

    const profiles = profilesRes.data || [];
    const challenges = challengesRes.data || [];
    const profileIds = profiles.map(p => p.id);

    let progress = [], recognition = [], innovation = [], safety = [];

    if (profileIds.length) {
      const [pRes, rRes, iRes, sRes] = await Promise.all([
        db.from('progress_entries').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }),
        db.from('recognition_entries').select('*').in('submitter_profile_id', profileIds).order('created_at', { ascending: false }),
        db.from('innovation_entries').select('*').in('profile_id', profileIds).order('created_at', { ascending: false }),
        db.from('safety_entries').select('*').in('profile_id', profileIds).order('created_at', { ascending: false })
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
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
      #kudos-rep-tools .admin-scroll-card{display:flex;flex-direction:column;max-height:560px;overflow:hidden}
      #kudos-rep-tools .admin-scroll-card .table-wrap{overflow:auto;min-height:0;flex:1}
      #kudos-rep-tools .profile-search-row{display:flex;gap:10px;align-items:end;justify-content:space-between;flex-wrap:wrap;margin-top:12px}
      #kudos-rep-tools .profile-search-row .field{margin:0;min-width:min(320px,100%);flex:1}
      #kudos-rep-tools .profile-search-count{font-size:.84rem;opacity:.72;white-space:nowrap}
      #kudos-rep-tools .rep-tool-actions{display:flex;gap:8px;flex-wrap:wrap}
      #kudos-rep-tools .rep-tool-table td,#kudos-rep-tools .rep-tool-table th{vertical-align:top}
      #kudos-rep-tools .rep-tool-table .detail{max-width:420px;white-space:normal}
      #kudos-rep-tools .rep-tool-table .num{text-align:right;white-space:nowrap}
      #kudos-rep-tools .rep-tool-muted{opacity:.72}
      #kudos-rep-tools .rep-tool-danger{background:#8d1f1f;color:#fff;border-color:#8d1f1f}
      #kudos-rep-tools .rep-tool-danger:hover{filter:brightness(.95)}
      #kudos-rep-tools .rep-tool-form{display:grid;grid-template-columns:1.2fr .7fr 2fr auto;gap:10px;align-items:end}\n      #kudos-rep-tools .rep-tool-form.admin-adjustment-form{grid-template-columns:1.2fr .8fr .7fr 2fr auto}
      #kudos-rep-tools .rep-tool-form .field{margin:0}
      #kudos-rep-tools .rep-tool-status{margin-top:10px}
      #kudos-rep-tools .adjustment-negative,#kudos-rep-tools .adjustment-positive{font-weight:800}
      #kudos-rep-tools .admin-access-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}
      #kudos-rep-tools .admin-access-metric{padding:16px;border-radius:14px;background:rgba(12,35,56,.05)}
      #kudos-rep-tools .admin-access-metric b{display:block;font-size:1.7rem;line-height:1}
      #kudos-rep-tools .admin-access-metric span{display:block;margin-top:7px;font-size:.86rem;opacity:.72}
      #kudos-rep-tools .admin-invite-form{display:grid;grid-template-columns:1.6fr 1.2fr .8fr 1.2fr auto;gap:10px;align-items:end}
      #kudos-rep-tools .admin-invite-form .field{margin:0}
      #kudos-rep-tools .access-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      #kudos-rep-tools .access-role-select{min-width:110px}
      #kudos-rep-tools .access-team-select{min-width:150px}
      #kudos-rep-tools .access-password-input{min-width:150px;max-width:190px}
      #kudos-rep-tools .access-current-user{font-size:.74rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;opacity:.65}
      #kudos-rep-tools .access-audit{font-size:.88rem}
      #kudos-rep-tools .magic-link-card{margin-top:14px}
      #kudos-rep-tools .acting-shell{margin-bottom:18px}
      #kudos-rep-tools .acting-head{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
      #kudos-rep-tools .acting-modes{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      #kudos-rep-tools .acting-mode-btn{min-width:110px}
      #kudos-rep-tools .acting-context{margin-top:10px;font-size:.9rem;opacity:.78}
      #kudos-rep-tools .admin-global-badge{display:inline-block;padding:5px 9px;border-radius:999px;background:rgba(12,35,56,.08);font-weight:800;font-size:.78rem;letter-spacing:.04em}
      #kudos-rep-tools .mode-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      @media(max-width:900px){
        #kudos-rep-tools .admin-access-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        #kudos-rep-tools .admin-invite-form{grid-template-columns:1fr 1fr}
      }
      @media(max-width:760px){
        #kudos-rep-tools .rep-tool-form{grid-template-columns:1fr}
        #kudos-rep-tools .rep-tool-table{min-width:760px}
        #kudos-rep-tools .admin-access-grid{grid-template-columns:1fr 1fr}
        #kudos-rep-tools .admin-invite-form{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function renderChallengeSection(data, isFullAdmin=false) {
    const rows = data.challenges.map(c => `
      <tr>
        <td><strong>${esc(c.title)}</strong><div class="help">${esc(c.source_type)} • ${esc(c.start_date)} to ${esc(c.end_date)}</div></td>
        <td>${fmt(c.target)} ${esc(c.unit)}</td>
        <td class="num">
          <div class="rep-tool-actions" style="justify-content:flex-end">
            <button class="btn danger compact rep-tool-danger" data-rep-remove-challenge="${esc(c.id)}" data-title="${esc(c.title)}">Delete from this team</button>
            ${isFullAdmin && c.challenge_group_id ? `<button class="btn danger compact rep-tool-danger" data-admin-remove-challenge-group="${esc(c.challenge_group_id)}" data-title="${esc(c.title)}">Delete from all teams</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    return `
      <div class="section-title"><h2>Challenge management</h2><p>Permanent deletion • term-based challenge reset</p></div>
      <div class="card rep-tool-card">
        <div class="notice">${isFullAdmin
          ? 'Delete from this team permanently removes that team copy. Delete from all teams permanently removes every copy in the shared challenge group. Challenge progress entries and PSF links are deleted with the challenge and scores/reports are recalculated.'
          : 'Deleting a challenge permanently removes it from your team. Challenge progress entries and PSF links are deleted with it and scores/reports are recalculated.'}</div>
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

  async function loadGlobalContributionData() {
    const [profilesRes, safetyRes, innovationRes, rewardsRes] = await Promise.all([
      db.from('profiles').select('id,name,team_id').eq('active', true).order('name'),
      db.from('safety_entries').select('*').order('created_at', {ascending:false}),
      db.from('innovation_entries').select('*').order('created_at', {ascending:false}),
      db.from('recognition_entries').select('*').order('created_at', {ascending:false})
    ]);
    const err = [profilesRes, safetyRes, innovationRes, rewardsRes].find(r => r.error)?.error;
    if (err) throw err;
    return {
      profiles: profilesRes.data || [],
      entries: {
        safety: safetyRes.data || [],
        innovation: innovationRes.data || [],
        recognition: rewardsRes.data || []
      }
    };
  }

  async function loadGlobalProfileData() {
    const [profilesRes, scoresRes] = await Promise.all([
      db.from('profiles').select('id,name,team_id,active').eq('active', true).order('name'),
      db.from('profile_scores').select('profile_id,name,team_id,kudos_score,adjustment_points').order('name')
    ]);
    const err = [profilesRes, scoresRes].find(r => r.error)?.error;
    if (err) throw err;
    return {
      profiles: profilesRes.data || [],
      scores: scoresRes.data || []
    };
  }

  function contributionDate(x) {
    return x.entry_date || String(x.created_at || '').slice(0, 10) || '—';
  }

  function renderContributionQueues(data, teams=[], global=false) {
    const profileMap = Object.fromEntries(data.profiles.map(p => [p.id, p]));
    const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const teamCell = profileId => {
      const teamId = profileMap[profileId]?.team_id;
      return esc(teamMap[teamId] || 'Team');
    };

    const safetyRows = [...data.entries.safety]
      .sort((a,b)=>String(b.created_at||b.entry_date||'').localeCompare(String(a.created_at||a.entry_date||'')))
      .map(x => `<tr>
        <td>${esc(contributionDate(x))}</td>
        <td><strong>${esc(profileMap[x.profile_id]?.name || 'Profile')}</strong></td>
        ${global ? `<td>${teamCell(x.profile_id)}</td>` : ''}
        <td>${esc(x.category || 'Flight Safety')}</td>
        <td class="detail">${esc(x.description || '')}${x.external_reference ? `<div class="help">Ref: ${esc(x.external_reference)}</div>` : ''}</td>
        ${global ? `<td class="num"><button class="btn danger compact rep-tool-danger" data-rep-delete-entry="${esc(x.id)}" data-entry-type="safety">Delete</button></td>` : ''}
      </tr>`).join('');

    const innovationRows = [...data.entries.innovation]
      .sort((a,b)=>String(b.created_at||b.entry_date||'').localeCompare(String(a.created_at||a.entry_date||'')))
      .map(x => `<tr>
        <td>${esc(contributionDate(x))}</td>
        <td><strong>${esc(profileMap[x.profile_id]?.name || 'Profile')}</strong></td>
        ${global ? `<td>${teamCell(x.profile_id)}</td>` : ''}
        <td>${esc(x.title || 'Innovation')}</td>
        <td class="detail">${esc(x.description || '')}</td>
        ${global ? `<td class="num"><button class="btn danger compact rep-tool-danger" data-rep-delete-entry="${esc(x.id)}" data-entry-type="innovation">Delete</button></td>` : ''}
      </tr>`).join('');

    const rewardRows = [...data.entries.recognition]
      .sort((a,b)=>String(b.created_at||b.entry_date||'').localeCompare(String(a.created_at||a.entry_date||'')))
      .map(x => `<tr>
        <td>${esc(contributionDate(x))}</td>
        <td><strong>${esc(profileMap[x.submitter_profile_id]?.name || 'Profile')}</strong></td>
        ${global ? `<td>${teamCell(x.submitter_profile_id)}</td>` : ''}
        <td>${esc(x.nominated_person || 'Not recorded')}</td>
        <td class="detail">${esc(x.reason || '')}</td>
        ${global ? `<td class="num"><button class="btn danger compact rep-tool-danger" data-rep-delete-entry="${esc(x.id)}" data-entry-type="recognition">Delete</button></td>` : ''}
      </tr>`).join('');

    const table = (headers, rows, empty) => `
      <div class="table-wrap">
        <table class="rep-tool-table">
          <thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${headers.length}"><div class="empty compact-empty">${esc(empty)}</div></td></tr>`}</tbody>
        </table>
      </div>`;

    const scopeText = global ? 'All teams' : 'Team-scoped';

    return `
      <div class="section-title"><h2>Contribution areas</h2><p>${scopeText} Safety, Innovation and Rewards</p></div>

      <div class="card rep-tool-card admin-scroll-card">
        <div class="eyebrow">FLIGHT SAFETY</div>
        <h3 style="margin:.25rem 0 12px">Safety contributions</h3>
        ${table(global ? ['Date','Submitted by','Team','Category','Contribution',''] : ['Date','Submitted by','Category','Contribution'], safetyRows, 'No Flight Safety contributions found.')}
      </div>

      <div class="card rep-tool-card admin-scroll-card">
        <div class="eyebrow">INNOVATION</div>
        <h3 style="margin:.25rem 0 12px">Innovation contributions</h3>
        ${table(global ? ['Date','Submitted by','Team','Idea','Detail',''] : ['Date','Submitted by','Idea','Detail'], innovationRows, 'No Innovation contributions found.')}
      </div>

      <div class="card rep-tool-card admin-scroll-card">
        <div class="eyebrow">REWARDS</div>
        <h3 style="margin:.25rem 0 12px">Recognition / rewards</h3>
        ${table(global ? ['Date','Submitted by','Team','Recognised person','Reason',''] : ['Date','Submitted by','Recognised person','Reason'], rewardRows, 'No Recognition / Reward contributions found.')}
      </div>
    `;
  }

  function renderEmailRoutingSection(data) {
    const routeMap = Object.fromEntries((data.routes || []).map(r => [r.contribution_type, r]));
    const field = (type, label, help) => {
      const recipients = routeMap[type]?.recipients || [];
      return `
        <div class="field">
          <label>${esc(label)}</label>
          <textarea name="${esc(type)}" rows="3" placeholder="name@example.com, team@example.com">${esc(recipients.join(', '))}</textarea>
          <div class="help">${esc(help)}</div>
        </div>`;
    };

    return `
      <div class="section-title"><h2>Contribution email routing</h2><p>Admin only • manage recipient addresses</p></div>
      <div class="card rep-tool-card">
        <div class="notice">Enter one or more email addresses separated by commas or new lines. These are the routing addresses for each contribution area.</div>
        <form id="kudos-contribution-routing-form" style="margin-top:14px">
          ${field('safety','Flight Safety recipients','Receives Flight Safety contribution notifications.')}
          ${field('innovation','Innovation recipients','Receives Innovation contribution notifications.')}
          ${field('rewards','Rewards / Recognition recipients','Receives Recognition and reward contribution notifications.')}
          <button class="btn navy" type="submit">Save email routing</button>
        </form>
        <div id="kudos-routing-status" class="rep-tool-status"></div>
      </div>
    `;
  }

  function renderPointsSection(data, canAdd=false) {
    const scoreMap = Object.fromEntries(data.scores.map(s => [s.profile_id, s]));
    const profileOptions = data.profiles.map(p => {
      const score = scoreMap[p.id];
      const label = `${p.name} — ${fmt(score?.kudos_score || 0)} KUDOS`;
      return `<option value="${esc(p.id)}">${esc(label)}</option>`;
    }).join('');

    const adjustmentRows = data.adjustments.map(a => {
      const p = data.profiles.find(x => x.id === a.profile_id);
      const delta = Number(a.points_delta || 0);
      const displayDelta = delta > 0 ? `+${fmt(delta)}` : fmt(delta);
      return `
        <tr>
          <td>${esc(p?.name || 'Profile')}</td>
          <td class="num ${delta > 0 ? 'adjustment-positive' : 'adjustment-negative'}">${displayDelta}</td>
          <td>${esc(a.reason)}</td>
          <td>${esc(String(a.created_at || '').replace('T', ' ').slice(0, 16))}</td>
        </tr>
      `;
    }).join('');

    const actionField = canAdd
      ? `<div class="field">
          <label>Adjustment</label>
          <select name="action" required>
            <option value="">Choose…</option>
            <option value="add">Add points</option>
            <option value="deduct">Deduct points</option>
          </select>
        </div>`
      : '<input type="hidden" name="action" value="deduct">';

    return `
      <div class="section-title"><h2>KUDOS point adjustments</h2><p>${canAdd ? 'Audited additions and deductions' : 'Audited deductions only'}</p></div>
      <div class="card rep-tool-card">
        <div class="notice">${canAdd
          ? 'Admins can add or deduct KUDOS points when a manual correction or award is required. Every adjustment requires a reason and is retained in the audit history.'
          : 'Performance Reps can deduct points for their own team when a correction is required. Additions are restricted to Administrators.'}</div>
        <form id="kudos-point-adjustment-form" class="rep-tool-form ${canAdd ? 'admin-adjustment-form' : ''}" style="margin-top:14px">
          <div class="field">
            <label>Person</label>
            <select name="profile_id" required>
              <option value="">Choose person…</option>
              ${profileOptions}
            </select>
          </div>
          ${actionField}
          <div class="field">
            <label>Points</label>
            <input name="points" type="number" min="0.01" step="0.01" required placeholder="e.g. 20">
          </div>
          <div class="field">
            <label>Reason</label>
            <input name="reason" minlength="3" maxlength="500" required placeholder="Why is this adjustment being made?">
          </div>
          <button class="btn ${canAdd ? 'navy' : 'danger rep-tool-danger'}" type="submit">${canAdd ? 'Apply adjustment' : 'Remove points'}</button>
        </form>
        <div id="kudos-rep-tool-status" class="rep-tool-status"></div>
        <div class="section-title" style="margin-top:20px"><h2>Recent adjustments</h2><p>${data.adjustments.length} shown</p></div>
        <div class="table-wrap">
          <table class="rep-tool-table">
            <thead><tr><th>Person</th><th>Points</th><th>Reason</th><th>Date</th></tr></thead>
            <tbody>${adjustmentRows || '<tr><td colspan="4"><div class="empty compact-empty">No point adjustments recorded for this team.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderProfileManagementSection(data, teams=[]) {
    const scoreMap = Object.fromEntries(data.scores.map(s => [s.profile_id, s]));
    const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const sortedProfiles = [...data.profiles]
      .sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'en-GB', {sensitivity:'base'}));
    const rows = sortedProfiles
      .map(p => {
        const teamName = teamMap[p.team_id] || 'Team';
        return `
        <tr data-admin-profile-row data-search-text="${esc(`${p.name} ${teamName}`.toLowerCase())}">
          <td><strong>${esc(p.name)}</strong></td>
          <td>${esc(teamName)}</td>
          <td class="num">${fmt(scoreMap[p.id]?.kudos_score || 0)}</td>
          <td class="num">
            <button class="btn danger compact rep-tool-danger"
              data-admin-delete-profile="${esc(p.id)}"
              data-profile-name="${esc(p.name)}">Delete profile</button>
          </td>
        </tr>
      `;
      }).join('');

    return `
      <div class="section-title"><h2>Profile management</h2><p>Admin only • all active profiles across KUDOS</p></div>
      <div class="card rep-tool-card admin-scroll-card">
        <div class="notice">Showing all ${data.profiles.length} active profiles across every team. Deleting a profile permanently removes that person's challenge progress, innovation and Flight Safety submissions, submitted recognition and point adjustments. Recognition of that person is retained by name. Rep/Admin sign-in access is managed separately below.</div>
        <div class="profile-search-row">
          <div class="field">
            <label for="kudos-admin-profile-search">Search profiles</label>
            <input id="kudos-admin-profile-search" type="search" placeholder="Search by name or team…" autocomplete="off">
          </div>
          <div class="profile-search-count" id="kudos-admin-profile-search-count">${data.profiles.length} profiles</div>
        </div>
        <div class="table-wrap" style="margin-top:12px">
          <table class="rep-tool-table">
            <thead><tr><th>Name</th><th>Team</th><th>KUDOS</th><th></th></tr></thead>
            <tbody>
              ${rows || '<tr><td colspan="4"><div class="empty compact-empty">No active profiles found.</div></td></tr>'}
              <tr id="kudos-admin-profile-no-results" style="display:none"><td colspan="4"><div class="empty compact-empty">No profiles match your search.</div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function deleteProfile(profileId, profileName) {
    const ctx = await getContext();
    if (ctx.appUser?.role !== 'admin') throw new Error('Administrator permission is required.');

    const [
      progressRes,
      recognitionSubmittedRes,
      recognitionReceivedRes,
      innovationRes,
      safetyRes,
      adjustmentRes
    ] = await Promise.all([
      db.from('progress_entries').select('id', {count:'exact', head:true}).eq('profile_id', profileId),
      db.from('recognition_entries').select('id', {count:'exact', head:true}).eq('submitter_profile_id', profileId),
      db.from('recognition_entries').select('id', {count:'exact', head:true}).eq('recognised_profile_id', profileId),
      db.from('innovation_entries').select('id', {count:'exact', head:true}).eq('profile_id', profileId),
      db.from('safety_entries').select('id', {count:'exact', head:true}).eq('profile_id', profileId),
      db.from('kudos_point_adjustments').select('id', {count:'exact', head:true}).eq('profile_id', profileId)
    ]);

    const err = [progressRes, recognitionSubmittedRes, recognitionReceivedRes, innovationRes, safetyRes, adjustmentRes]
      .find(r => r.error)?.error;
    if (err) throw err;

    const submitted =
      Number(progressRes.count || 0) +
      Number(recognitionSubmittedRes.count || 0) +
      Number(innovationRes.count || 0) +
      Number(safetyRes.count || 0);

    const received = Number(recognitionReceivedRes.count || 0);
    const adjustments = Number(adjustmentRes.count || 0);
    const isCurrentProfile = (localStorage.getItem('kudos_profile') || '') === profileId;

    const ok = window.confirm(
      `Permanently delete the KUDOS profile for "${profileName}"?\n\n` +
      `${submitted} submitted contribution${submitted === 1 ? '' : 's'} and ${adjustments} point adjustment${adjustments === 1 ? '' : 's'} will be deleted.\n` +
      `${received} recognition entr${received === 1 ? 'y' : 'ies'} naming this person will be retained, but the profile link will be removed.\n` +
      (isCurrentProfile ? '\nThis is the profile currently selected on this device; KUDOS will ask you to choose another profile after deletion.\n' : '') +
      '\nThis cannot be undone.'
    );
    if (!ok) return;

    const {data, error} = await db
      .from('profiles')
      .delete()
      .eq('id', profileId)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No profile was deleted.');

    if (isCurrentProfile) localStorage.removeItem('kudos_profile');
    window.location.reload();
  }

  function setStatus(message, isError = false) {
    const el = document.getElementById('kudos-rep-tool-status');
    if (!el) return;
    el.innerHTML = `<div class="notice ${isError ? '' : 'success'}">${esc(message)}</div>`;
  }

  async function removeChallenge(id, title) {
    const { count: progressCount, error: countError } = await db
      .from('progress_entries')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', id);
    if (countError) throw countError;

    const entries = Number(progressCount || 0);
    const ok = window.confirm(
      `Permanently delete "${title}" from this team?\n\n` +
      `This will delete the challenge${entries ? ` and ${entries} logged progress entr${entries === 1 ? 'y' : 'ies'}` : ''}. ` +
      `Its PSF links will also be removed and KUDOS scores/reports will be recalculated.\n\nThis cannot be undone.`
    );
    if (!ok) return;

    const { data, error } = await db
      .from('challenges')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw new Error('No challenge was deleted. Check that you have permission for this team.');
    window.location.reload();
  }

  async function removeChallengeGroup(groupId, title) {
    const ctx = await getContext();
    if (ctx.appUser?.role !== 'admin') throw new Error('Administrator permission is required.');

    const { data: copies, error: copyError } = await db
      .from('challenges')
      .select('id,team_id')
      .eq('challenge_group_id', groupId);

    if (copyError) throw copyError;
    if (!copies?.length) throw new Error('No copies of this challenge were found.');

    const challengeIds = copies.map(x => x.id);
    const { count: progressCount, error: progressError } = await db
      .from('progress_entries')
      .select('id', { count: 'exact', head: true })
      .in('challenge_id', challengeIds);

    if (progressError) throw progressError;

    const entries = Number(progressCount || 0);
    const copyCount = copies.length;

    const ok = window.confirm(
      `Permanently delete "${title}" from all teams?\n\n` +
      `${copyCount} challenge cop${copyCount === 1 ? 'y' : 'ies'} will be deleted` +
      `${entries ? ` together with ${entries} logged progress entr${entries === 1 ? 'y' : 'ies'}` : ''}. ` +
      `PSF links will also be removed and KUDOS scores/reports will be recalculated.\n\nThis cannot be undone.`
    );
    if (!ok) return;

    const { data, error } = await db
      .from('challenges')
      .delete()
      .eq('challenge_group_id', groupId)
      .select('id,team_id');

    if (error) throw error;
    if (!data?.length) throw new Error('No challenge copies were deleted.');
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
    const action = String(fd.get('action') || 'deduct');
    const points = Number(fd.get('points') || 0);
    const reason = String(fd.get('reason') || '').trim();

    if (!profileId || !['add','deduct'].includes(action) || !Number.isFinite(points) || points <= 0 || reason.length < 3) {
      throw new Error('Choose a person and adjustment type, enter a positive number of points and provide a reason.');
    }

    if (action === 'add' && ctx.appUser?.role !== 'admin') {
      throw new Error('Only Administrators can add KUDOS points.');
    }

    const profile = data.profiles.find(p => p.id === profileId);
    if (!profile || profile.team_id !== teamId) {
      throw new Error('That profile is not part of the selected team.');
    }

    const currentScore = Number(data.scores.find(s => s.profile_id === profileId)?.kudos_score || 0);
    if (action === 'deduct' && points > currentScore) {
      throw new Error(`You cannot deduct ${fmt(points)} points because ${profile.name} currently has ${fmt(currentScore)} KUDOS.`);
    }

    const delta = action === 'add' ? Math.abs(points) : -Math.abs(points);
    const verb = action === 'add' ? 'Add' : 'Deduct';
    const resultingScore = Math.max(currentScore + delta, 0);

    const ok = window.confirm(
      `${verb} ${fmt(points)} KUDOS points ${action === 'add' ? 'to' : 'from'} ${profile.name}?\n\n` +
      `Current score: ${fmt(currentScore)}\n` +
      `Resulting score: ${fmt(resultingScore)}\n` +
      `Reason: ${reason}\n\nThis adjustment will be recorded in the audit history.`
    );
    if (!ok) return;

    const { data: inserted, error } = await db
      .from('kudos_point_adjustments')
      .insert({
        profile_id: profileId,
        team_id: teamId,
        points_delta: delta,
        reason,
        created_by: ctx.user.id
      })
      .select('id');

    if (error) throw error;
    if (!inserted?.length) throw new Error('The adjustment was not recorded.');
    window.location.reload();
  }


  const dt = value => {
    if (!value) return 'Never';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', {dateStyle:'medium', timeStyle:'short'});
  };

  async function loadAccessAdminData() {
    const [directoryRes, accessRes, pendingRes, auditRes, routesRes] = await Promise.all([
      db.from('access_directory').select('*').order('email'),
      db.from('app_users').select('*'),
      db.from('pending_access_invites').select('*').order('invited_at', {ascending:false}),
      db.from('access_role_audit').select('*').order('changed_at', {ascending:false}),
      db.from('contribution_email_routes').select('*').order('contribution_type')
    ]);
    const err = [directoryRes, accessRes, pendingRes, auditRes, routesRes].find(r => r.error)?.error;
    if (err) throw err;
    return {
      directory: directoryRes.data || [],
      access: accessRes.data || [],
      pending: pendingRes.data || [],
      audit: auditRes.data || [],
      routes: routesRes.data || []
    };
  }

  function teamSelectHtml(teams, selected='', disabled=false, attr='') {
    return `<select class="access-team-select" ${attr} ${disabled?'disabled':''}>
      <option value="">Choose team…</option>
      ${teams.map(t=>`<option value="${esc(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)}</option>`).join('')}
    </select>`;
  }

  function renderAccessAdminSection(ctx, teams, data) {
    if (ctx.appUser?.role !== 'admin') return '';

    const accessMap = Object.fromEntries(data.access.map(a => [a.auth_user_id, a]));
    const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
    const admins = data.access.filter(a => a.role === 'admin').length;
    const reps = data.access.filter(a => a.role === 'rep').length;
    const unassigned = data.directory.filter(d => !accessMap[d.auth_user_id]).length;

    const directoryRows = data.directory.map(d => {
      const a = accessMap[d.auth_user_id];
      const role = a?.role || '';
      const teamId = a?.team_id || '';
      const isCurrent = d.auth_user_id === ctx.user.id;
      return `<tr>
        <td>
          <strong>${esc(d.email)}</strong>
          ${isCurrent?'<div class="access-current-user">Current account</div>':''}
        </td>
        <td>${esc(dt(d.last_sign_in_at))}</td>
        <td>
          <select class="access-role-select" data-access-role="${esc(d.auth_user_id)}">
            <option value="" ${!role?'selected':''}>No access</option>
            <option value="rep" ${role==='rep'?'selected':''}>Rep</option>
            <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
          </select>
        </td>
        <td>${teamSelectHtml(teams, teamId, !role, `data-access-team="${esc(d.auth_user_id)}"`)}</td>
        <td>
          <div class="access-row-actions">
            <button class="btn primary compact" data-access-save="${esc(d.auth_user_id)}">${a?'Save':'Grant'}</button>
            <input class="access-password-input" data-access-password-input="${esc(d.auth_user_id)}" type="password" minlength="10" placeholder="New password">
            <button class="btn ghost compact" data-access-password="${esc(d.auth_user_id)}" data-email="${esc(d.email)}">Set password</button>
            <button class="btn ghost compact" data-access-reset-email="${esc(d.email)}">Email reset</button>
            ${a?`<button class="btn danger compact rep-tool-danger" data-access-revoke="${esc(d.auth_user_id)}" data-email="${esc(d.email)}">Revoke</button>`:''}
          </div>
        </td>
      </tr>`;
    }).join('');

    const pendingRows = data.pending.map(p => `
      <tr>
        <td><strong>${esc(p.email)}</strong></td>
        <td>${esc(String(p.role||'').toUpperCase())}</td>
        <td>${esc(p.team_id ? (teamMap[p.team_id] || 'Team') : '—')}</td>
        <td>${esc(dt(p.invited_at))}</td>
        <td><button class="btn danger compact rep-tool-danger" data-pending-cancel="${esc(p.email)}">Cancel</button></td>
      </tr>
    `).join('');

    const auditRows = data.audit.map(a => {
      const oldRole = a.old_role ? String(a.old_role).toUpperCase() : '—';
      const newRole = a.new_role ? String(a.new_role).toUpperCase() : '—';
      const oldTeam = a.old_team_id ? (teamMap[a.old_team_id] || 'Team') : '—';
      const newTeam = a.new_team_id ? (teamMap[a.new_team_id] || 'Team') : '—';
      return `<tr>
        <td>${esc(dt(a.changed_at))}</td>
        <td><strong>${esc(a.target_email || '')}</strong></td>
        <td>${esc(String(a.action||'').toUpperCase())}</td>
        <td>${esc(oldRole)} ${oldTeam!=='—'?`• ${esc(oldTeam)}`:''}</td>
        <td>${esc(newRole)} ${newTeam!=='—'?`• ${esc(newTeam)}`:''}</td>
      </tr>`;
    }).join('');

    return `
      <div class="section-title"><h2>Admin dashboard</h2><p>Manage Rep and Admin access inside KUDOS</p></div>
      <div class="card rep-tool-card">
        <div class="admin-access-grid">
          <div class="admin-access-metric"><b>${admins}</b><span>Administrators</span></div>
          <div class="admin-access-metric"><b>${reps}</b><span>Performance Reps</span></div>
          <div class="admin-access-metric"><b>${unassigned}</b><span>Unassigned access accounts</span></div>
          <div class="admin-access-metric"><b>${data.pending.length}</b><span>Pending invitations</span></div>
        </div>

        <h3>Create a Rep or Admin account</h3>
        <div class="notice">Creates a confirmed KUDOS account immediately using email + password. No invitation email is required. Give the temporary password to the user securely; they can change it later.</div>
        <form id="kudos-access-invite-form" class="admin-invite-form" style="margin-top:14px">
          <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="name@example.com"></div>
          <div class="field"><label>Temporary password</label><input name="password" type="password" minlength="10" required autocomplete="new-password" placeholder="At least 10 characters"></div>
          <div class="field"><label>Role</label><select name="role" id="kudos-invite-role"><option value="rep">Rep</option><option value="admin">Admin</option></select></div>
          <div class="field"><label>Rep team <span class="help">(optional for Admin)</span></label>${teamSelectHtml(teams,'',false,'name="team_id" id="kudos-invite-team"')}</div>
          <button class="btn navy" type="submit">Create account</button>
        </form>
        <div id="kudos-access-status" class="rep-tool-status"></div>
      </div>

      ${renderEmailRoutingSection(data)}

      <div class="section-title"><h2>Access accounts</h2><p>Grant, change or revoke KUDOS management access</p></div>
      <div class="card rep-tool-card">
        <div class="notice">Revoking access removes the KUDOS role but does not delete the person's authentication account. At least one KUDOS administrator is always retained by the database.</div>
        <div class="table-wrap" style="margin-top:12px">
          <table class="rep-tool-table">
            <thead><tr><th>Email</th><th>Last sign-in</th><th>Role</th><th>Rep team</th><th></th></tr></thead>
            <tbody>${directoryRows || '<tr><td colspan="5"><div class="empty compact-empty">No access accounts found.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="section-title"><h2>Pending invitations</h2><p>Invites awaiting account creation/sign-in</p></div>
      <div class="card rep-tool-card">
        <div class="table-wrap">
          <table class="rep-tool-table">
            <thead><tr><th>Email</th><th>Role</th><th>Rep team</th><th>Invited</th><th></th></tr></thead>
            <tbody>${pendingRows || '<tr><td colspan="5"><div class="empty compact-empty">No pending access invitations.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="section-title"><h2>Access audit</h2><p>Recent grants, role changes and revocations</p></div>
      <div class="card rep-tool-card">
        <div class="table-wrap">
          <table class="rep-tool-table access-audit">
            <thead><tr><th>Date</th><th>Account</th><th>Action</th><th>Previous</th><th>New</th></tr></thead>
            <tbody>${auditRows || '<tr><td colspan="5"><div class="empty compact-empty">No access changes recorded yet.</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function setAccessStatus(message, isError=false) {
    const el = document.getElementById('kudos-access-status');
    if (!el) return;
    el.innerHTML = `<div class="notice ${isError?'':'success'}">${esc(message)}</div>`;
  }

  async function sendPasswordReset(email) {
    const redirect = `${window.location.origin}${window.location.pathname}`;
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    if (error) throw error;
  }


  async function saveAccessRecord(userId, role, teamId) {
    if (!['rep','admin'].includes(role)) throw new Error('Choose Rep or Admin.');
    if (role === 'rep' && !teamId) throw new Error('Choose a Rep team.');
    const record = {
      auth_user_id: userId,
      role,
      team_id: teamId || null
    };
    const {error} = await db.from('app_users').upsert(record, {onConflict:'auth_user_id'});
    if (error) throw error;
  }

  async function revokeAccessRecord(userId, email) {
    const ok = window.confirm(`Revoke KUDOS management access for ${email}?\n\nTheir authentication account will remain, but they will no longer have Rep/Admin controls.`);
    if (!ok) return false;
    const {error} = await db.from('app_users').delete().eq('auth_user_id', userId);
    if (error) throw error;
    return true;
  }

  async function createAccessAccount(email, password, role, teamId) {
    email = String(email || '').trim().toLowerCase();
    password = String(password || '');
    if (!email) throw new Error('Enter an email address.');
    if (password.length < 10) throw new Error('Temporary password must be at least 10 characters.');
    if (!['rep','admin'].includes(role)) throw new Error('Choose Rep or Admin.');
    if (role === 'rep' && !teamId) throw new Error('Choose a team for the Rep.');

    const {data, error} = await db.functions.invoke('manage-kudos-account', {
      body: {
        action: 'create',
        email,
        password,
        role,
        team_id: teamId || null
      }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return 'Account created. The user can now sign in with their email address and password.';
  }

  async function setAccountPassword(userId, password) {
    password = String(password || '');
    if (password.length < 10) throw new Error('Password must be at least 10 characters.');
    const {data, error} = await db.functions.invoke('manage-kudos-account', {
      body: { action: 'set_password', user_id: userId, password }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  }

  async function cancelPendingInvite(email) {
    const ok = window.confirm(`Cancel the pending KUDOS access invitation for ${email}?`);
    if (!ok) return false;
    const {error} = await db.from('pending_access_invites').delete().eq('email', email);
    if (error) throw error;
    return true;
  }

  function bindAccessAdmin(ctx, teams, adminData, root) {
    if (ctx.appUser?.role !== 'admin') return;

    const inviteRole = document.getElementById('kudos-invite-role');
    const inviteTeam = document.getElementById('kudos-invite-team');
    const syncInviteTeam = () => {
      if (!inviteRole || !inviteTeam) return;
      inviteTeam.disabled = false;
    };
    inviteRole?.addEventListener('change', syncInviteTeam);
    syncInviteTeam();

    document.getElementById('kudos-contribution-routing-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.target.querySelector('button[type="submit"]');
      const status = document.getElementById('kudos-routing-status');
      const fd = new FormData(e.target);
      const parseEmails = value => [...new Set(String(value || '')
        .split(/[\n,;]+/)
        .map(x => x.trim().toLowerCase())
        .filter(Boolean))];

      const rows = ['safety','innovation','rewards'].map(type => ({
        contribution_type: type,
        recipients: parseEmails(fd.get(type)),
        updated_at: new Date().toISOString(),
        updated_by: ctx.user.id
      }));

      const invalid = rows.flatMap(r => r.recipients)
        .filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

      if (invalid.length) {
        if (status) status.innerHTML = `<div class="notice">Check these email addresses: ${esc(invalid.join(', '))}</div>`;
        return;
      }

      try {
        if (button) button.disabled = true;
        const {error} = await db.from('contribution_email_routes').upsert(rows, {onConflict:'contribution_type'});
        if (error) throw error;

        const {data:{session}} = await db.auth.getSession();
        if (!session?.access_token) throw new Error('Admin session is not available.');

        const mirror = await fetch('/api/contribution-routing', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            routes: Object.fromEntries(rows.map(r => [r.contribution_type, r.recipients]))
          })
        });
        if (!mirror.ok) throw new Error((await mirror.text()) || 'Could not activate routing.');

        if (status) status.innerHTML = '<div class="notice success">Routing saved and activated.</div>';
      } catch (err) {
        if (status) status.innerHTML = `<div class="notice">Could not save routing: ${esc(err.message || err)}</div>`;
      } finally {
        if (button) button.disabled = false;
      }
    });

    root.querySelectorAll('[data-access-role]').forEach(sel => {
      const userId = sel.dataset.accessRole;
      const teamSel = root.querySelector(`[data-access-team="${CSS.escape(userId)}"]`);
      const sync = () => {
        if (!teamSel) return;
        const hasAccess = ['rep','admin'].includes(sel.value);
        teamSel.disabled = !hasAccess;
        if (!hasAccess) teamSel.value = '';
      };
      sel.addEventListener('change', sync);
      sync();
    });

    document.getElementById('kudos-access-invite-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const button = e.target.querySelector('button[type="submit"]');
      const fd = new FormData(e.target);
      try {
        if (button) button.disabled = true;
        setAccessStatus('Creating account…');
        const message = await createAccessAccount(
          fd.get('email'),
          fd.get('password'),
          String(fd.get('role') || ''),
          String(fd.get('team_id') || '')
        );
        setAccessStatus(message);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        if (button) button.disabled = false;
        setAccessStatus(`Could not create account: ${err.message || err}`, true);
      }
    });

    root.querySelectorAll('[data-access-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.accessSave;
        const role = root.querySelector(`[data-access-role="${CSS.escape(userId)}"]`)?.value || '';
        const teamId = root.querySelector(`[data-access-team="${CSS.escape(userId)}"]`)?.value || '';
        try {
          btn.disabled = true;
          await saveAccessRecord(userId, role, teamId);
          setAccessStatus('Access saved.');
          setTimeout(() => window.location.reload(), 500);
        } catch (err) {
          btn.disabled = false;
          setAccessStatus(`Could not save access: ${err.message || err}`, true);
        }
      });
    });

    root.querySelectorAll('[data-access-revoke]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          const changed = await revokeAccessRecord(btn.dataset.accessRevoke, btn.dataset.email || 'this account');
          if (changed) window.location.reload();
          else btn.disabled = false;
        } catch (err) {
          btn.disabled = false;
          setAccessStatus(`Could not revoke access: ${err.message || err}`, true);
        }
      });
    });

    root.querySelectorAll('[data-access-password]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.accessPassword;
        const input = root.querySelector(`[data-access-password-input="${CSS.escape(userId)}"]`);
        const password = String(input?.value || '');
        try {
          btn.disabled = true;
          await setAccountPassword(userId, password);
          if (input) input.value = '';
          setAccessStatus(`Password updated for ${btn.dataset.email}.`);
        } catch (err) {
          setAccessStatus(`Could not set password: ${err.message || err}`, true);
        } finally {
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('[data-access-reset-email]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          await sendPasswordReset(btn.dataset.accessResetEmail);
          setAccessStatus(`Password reset email requested for ${btn.dataset.accessResetEmail}.`);
        } catch (err) {
          setAccessStatus(`Could not send password reset email: ${err.message || err}`, true);
        } finally {
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('[data-pending-cancel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          const changed = await cancelPendingInvite(btn.dataset.pendingCancel);
          if (changed) window.location.reload();
          else btn.disabled = false;
        } catch (err) {
          btn.disabled = false;
          setAccessStatus(`Could not cancel invite: ${err.message || err}`, true);
        }
      });
    });
  }

  function renderPasswordSignin(main) {
    if (document.getElementById('kudos-rep-tools')) return;
    const root = document.createElement('section');
    root.id = 'kudos-rep-tools';
    root.innerHTML = `
      <div class="card magic-link-card">
        <h3 style="margin-top:0">Rep / Admin sign in</h3>
        <p class="challenge-desc">Sign in with the email address and password assigned to your KUDOS management account.</p>
        <form id="kudos-password-login-form" class="admin-invite-form">
          <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username" placeholder="name@example.com"></div>
          <div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password"></div>
          <div></div><div></div>
          <button class="btn navy" type="submit">Sign in</button>
        </form>
        <div style="margin-top:10px"><button class="btn ghost compact" id="kudos-forgot-password" type="button">Forgot password</button></div>
        <div id="kudos-password-login-status" class="rep-tool-status"></div>
      </div>
    `;
    main.appendChild(root);

    const form = root.querySelector('#kudos-password-login-form');
    const status = root.querySelector('#kudos-password-login-status');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const fd = new FormData(e.target);
      try {
        if (btn) btn.disabled = true;
        const { error } = await db.auth.signInWithPassword({
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || '')
        });
        if (error) throw error;
        window.location.reload();
      } catch (err) {
        if (status) status.innerHTML = `<div class="notice">${esc(err.message || err)}</div>`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    root.querySelector('#kudos-forgot-password')?.addEventListener('click', async () => {
      const email = String(new FormData(form).get('email') || '').trim();
      if (!email) {
        if (status) status.innerHTML = '<div class="notice">Enter your email address first, then choose Forgot password.</div>';
        return;
      }
      try {
        await sendPasswordReset(email);
        if (status) status.innerHTML = '<div class="notice success">Password reset email requested. Check your inbox.</div>';
      } catch (err) {
        if (status) status.innerHTML = `<div class="notice">${esc(err.message || err)}</div>`;
      }
    });
  }

  async function renderTools(main, ctx, teams, teamId, mode, profile, repTeamId) {
    const existing = document.getElementById('kudos-rep-tools');
    if (existing) existing.remove();

    hideCoreRepPage(main);

    const root = document.createElement('section');
    root.id = 'kudos-rep-tools';

    if (mode === 'individual') {
      root.innerHTML = `
        ${actingModeBar(ctx, profile, teams, mode, repTeamId)}
        <div class="card">
          <h3 style="margin-top:0">Individual mode</h3>
          <p class="challenge-desc">Elevated Rep and Admin controls are hidden. KUDOS now behaves as your normal team-member profile.</p>
          <button class="btn primary" data-kudos-go-home>Go to My KUDOS</button>
        </div>
      `;
      main.appendChild(root);
    } else {
      if (!teamId) {
        root.innerHTML = `
          ${actingModeBar(ctx, profile, teams, mode, repTeamId)}
          <div class="notice">A Rep team is required for Rep mode. Switch to Admin mode and assign a Rep team to this account, or select an individual profile attached to a team.</div>
        `;
        main.appendChild(root);
      } else {
        const data = await loadTeamData(teamId);
        const isGlobalAdmin = mode === 'admin' && ctx.appUser?.role === 'admin';
        const [adminData, contributionData, globalProfileData] = isGlobalAdmin
          ? await Promise.all([loadAccessAdminData(), loadGlobalContributionData(), loadGlobalProfileData()])
          : [null, data, null];
        const selectedTeam = teams.find(t => t.id === teamId);

        root.innerHTML = `
          ${actingModeBar(ctx, profile, teams, mode, repTeamId)}
          <div class="section-title rep-tools-head">
            <div>
              <h2>${mode === 'admin' ? 'Administrator controls' : 'Performance Rep controls'}</h2>
              <p>${mode === 'admin'
                ? `<span class="admin-global-badge">GLOBAL ADMIN</span> • selected management view: ${esc(selectedTeam?.name || 'Team')}`
                : `${esc(selectedTeam?.name || 'Team')} • team-scoped`}</p>
            </div>
            ${mode === 'admin' ? `
              <div class="field">
                <label>View / manage team</label>
                <select id="kudos-rep-tools-team">
                  ${teams.map(t => `<option value="${esc(t.id)}" ${t.id === teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
                </select>
              </div>` : ''}
          </div>
          ${renderChallengeSection(data, mode === 'admin')}
          ${renderEntrySection(data, false)}
          ${renderContributionQueues(contributionData, teams, isGlobalAdmin)}
          ${renderPointsSection(data, mode === 'admin')}
          ${mode === 'admin' ? renderProfileManagementSection(globalProfileData || data, teams) : ''}
          ${adminData ? renderAccessAdminSection(ctx, teams, adminData) : ''}
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
              setStatus(`Could not delete challenge: ${err.message || err}`, true);
            }
          });
        });

        root.querySelectorAll('[data-admin-remove-challenge-group]').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              btn.disabled = true;
              await removeChallengeGroup(btn.dataset.adminRemoveChallengeGroup, btn.dataset.title || 'challenge');
            } catch (err) {
              btn.disabled = false;
              setStatus(`Could not delete challenge from all teams: ${err.message || err}`, true);
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


        const profileSearch = root.querySelector('#kudos-admin-profile-search');
        if (profileSearch) {
          const profileRows = [...root.querySelectorAll('[data-admin-profile-row]')];
          const countEl = root.querySelector('#kudos-admin-profile-search-count');
          const noResults = root.querySelector('#kudos-admin-profile-no-results');
          const applyProfileSearch = () => {
            const query = String(profileSearch.value || '').trim().toLowerCase();
            let visible = 0;
            profileRows.forEach(row => {
              const show = !query || String(row.dataset.searchText || '').includes(query);
              row.style.display = show ? '' : 'none';
              if (show) visible++;
            });
            if (countEl) countEl.textContent = query
              ? `${visible} of ${profileRows.length} profiles`
              : `${profileRows.length} profiles`;
            if (noResults) noResults.style.display = visible === 0 ? '' : 'none';
          };
          profileSearch.addEventListener('input', applyProfileSearch);
        }

        root.querySelectorAll('[data-admin-delete-profile]').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              btn.disabled = true;
              await deleteProfile(btn.dataset.adminDeleteProfile, btn.dataset.profileName || 'profile');
            } catch (err) {
              btn.disabled = false;
              setStatus(`Could not delete profile: ${err.message || err}`, true);
            }
          });
        });

        document.getElementById('kudos-point-adjustment-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const button = e.target.querySelector('button[type="submit"]');
          try {
            if (button) button.disabled = true;
            setStatus('Saving adjustment…');
            await submitPointAdjustment(e.target, ctx, teamId, data);
          } catch (err) {
            if (button) button.disabled = false;
            setStatus(`Could not save adjustment: ${err.message || err}`, true);
          }
        });

        if (adminData) bindAccessAdmin(ctx, teams, adminData, root);
      }
    }

    root.querySelectorAll('[data-kudos-acting-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        localStorage.setItem('kudos_acting_mode', btn.dataset.kudosActingMode);
        document.getElementById('kudos-rep-tools')?.remove();
        schedule();
      });
    });

    root.querySelector('[data-kudos-go-home]')?.addEventListener('click', () => {
      document.querySelector('[data-view="home"]')?.click();
    });

    root.querySelector('[data-kudos-signout]')?.addEventListener('click', async () => {
      await db.auth.signOut();
      localStorage.removeItem('kudos_acting_mode');
      window.location.reload();
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
      if (!ctx.user) {
        renderPasswordSignin(main);
        return;
      }
      if (!ctx.appUser || !['rep', 'admin'].includes(ctx.appUser.role)) return;

      const [teams, profile] = await Promise.all([getTeams(), getSelectedProfileContext()]);
      const mode = getActingMode(ctx);
      const repTeamId = resolvedRepTeamId(ctx, profile, teams);

      let teamId = '';
      if (mode === 'rep') {
        teamId = repTeamId;
      } else if (mode === 'admin') {
        teamId = localStorage.getItem('kudos_rep_tools_team') || teams[0]?.id || '';
        if (!teams.some(t => t.id === teamId)) teamId = teams[0]?.id || '';
      } else {
        teamId = profile?.team_id || '';
      }

      await renderTools(main, ctx, teams, teamId, mode, profile, repTeamId);
    } catch (err) {
      console.error('KUDOS Rep Tools', err);
      const root = document.getElementById('kudos-rep-tools') || document.createElement('section');
      root.id = 'kudos-rep-tools';
      root.innerHTML = `<div class="notice">Rep/Admin controls could not be loaded: ${esc(err.message || err)}</div>`;
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
