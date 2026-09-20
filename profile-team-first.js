const KUDOS_TEAM_FIRST_PROFILE_VERSION = '2026-09-20.1';

const CFG = window.KUDOS_CONFIG || {};
const KEY = CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_ANON_KEY || '';
const READY = !!(CFG.SUPABASE_URL && KEY && window.supabase);

if (READY) {
  const db = window.supabase.createClient(CFG.SUPABASE_URL, KEY);
  let timer = null;
  let running = false;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[c]));

  async function loadDirectory() {
    const [teamsRes, profilesRes] = await Promise.all([
      db.from('teams').select('id,name,display_order,active').eq('active', true).order('display_order').order('name'),
      db.from('profiles').select('id,name,team_id,active').eq('active', true).order('name')
    ]);
    const error = teamsRes.error || profilesRes.error;
    if (error) throw error;

    const teams = [...(teamsRes.data || [])]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en-GB', { sensitivity: 'base' }));
    const profiles = [...(profilesRes.data || [])]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en-GB', { sensitivity: 'base' }));

    return { teams, profiles };
  }

  function ensureStyles() {
    if (document.getElementById('kudos-team-first-profile-styles')) return;
    const style = document.createElement('style');
    style.id = 'kudos-team-first-profile-styles';
    style.textContent = `
      .profile-team-first .field + .field{margin-top:12px}
      .profile-team-first .profile-count{margin-top:6px;font-size:.84rem;opacity:.72}
      .profile-team-first select:disabled{opacity:.62;cursor:not-allowed}
    `;
    document.head.appendChild(style);
  }

  function profileOptions(profiles, teamId, selectedId = '') {
    const rows = profiles
      .filter(p => p.team_id === teamId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en-GB', { sensitivity: 'base' }));

    return {
      count: rows.length,
      html: [
        `<option value="" ${selectedId ? '' : 'selected'} disabled>${rows.length ? 'Choose your name…' : 'No profiles in this team'}</option>`,
        ...rows.map(p => `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)}</option>`)
      ].join('')
    };
  }

  async function enhanceProfilePicker() {
    const modal = document.getElementById('modal');
    const existingSelect = document.getElementById('profileSelect');
    if (!modal || !existingSelect || existingSelect.dataset.teamFirstReady === 'true') return;

    const { teams, profiles } = await loadDirectory();
    if (!teams.length) return;
    ensureStyles();

    const rememberedId = localStorage.getItem('kudos_profile') || '';
    const remembered = profiles.find(p => p.id === rememberedId);
    const initialTeamId = remembered?.team_id || '';

    const oldField = existingSelect.closest('.field');
    if (!oldField) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'profile-team-first';
    wrapper.innerHTML = `
      <div class="field">
        <label>Team</label>
        <select id="profileTeamSelect">
          <option value="" ${initialTeamId ? '' : 'selected'} disabled>Choose your team…</option>
          ${teams.map(t => `<option value="${esc(t.id)}" ${t.id === initialTeamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Name</label>
        <select id="profileSelect" ${initialTeamId ? '' : 'disabled'}></select>
        <div class="profile-count" id="profileCount">${initialTeamId ? '' : 'Select a team first.'}</div>
      </div>
    `;
    oldField.replaceWith(wrapper);

    const teamSelect = wrapper.querySelector('#profileTeamSelect');
    const personSelect = wrapper.querySelector('#profileSelect');
    const count = wrapper.querySelector('#profileCount');
    personSelect.dataset.teamFirstReady = 'true';

    const populate = (teamId, preferred = '') => {
      const result = profileOptions(profiles, teamId, preferred);
      personSelect.innerHTML = result.html;
      personSelect.disabled = !teamId || result.count === 0;
      count.textContent = teamId
        ? `${result.count} ${result.count === 1 ? 'person' : 'people'} in this team • A–Z`
        : 'Select a team first.';
    };

    if (initialTeamId) populate(initialTeamId, rememberedId);
    teamSelect.addEventListener('change', () => populate(teamSelect.value, ''));
  }

  function enhanceNewProfileForm() {
    const form = document.getElementById('profileForm');
    if (!form || form.dataset.teamFirstReady === 'true') return;

    const nameInput = form.querySelector('input[name="name"]');
    const teamSelect = form.querySelector('select[name="team_id"]');
    if (!nameInput || !teamSelect) return;

    const nameField = nameInput.closest('.field');
    const teamField = teamSelect.closest('.field');
    if (!nameField || !teamField) return;

    form.insertBefore(teamField, nameField);

    if (![...teamSelect.options].some(o => o.value === '')) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose your team…';
      placeholder.disabled = true;
      placeholder.selected = true;
      teamSelect.insertBefore(placeholder, teamSelect.firstChild);
      teamSelect.value = '';
    }

    const options = [...teamSelect.options].filter(o => o.value);
    options.sort((a, b) => a.textContent.localeCompare(b.textContent, 'en-GB', { sensitivity: 'base' }));
    options.forEach(o => teamSelect.appendChild(o));

    form.dataset.teamFirstReady = 'true';
  }

  async function enhance() {
    if (running) return;
    running = true;
    try {
      await enhanceProfilePicker();
      enhanceNewProfileForm();
    } catch (err) {
      console.error('KUDOS Team First Profile', err);
    } finally {
      running = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(enhance, 60);
  }

  const app = document.getElementById('app');
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  window.addEventListener('load', schedule);
  schedule();
}
