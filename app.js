const CFG = window.KUDOS_CONFIG || {};
const SUPABASE_KEY = CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_ANON_KEY || '';
const SUPABASE_READY = !!(CFG.SUPABASE_URL && SUPABASE_KEY && window.supabase);
const supabase = SUPABASE_READY ? window.supabase.createClient(CFG.SUPABASE_URL, SUPABASE_KEY) : null;

const PSFS = [
  'Fatigue','Stress','Time Pressure','Cognitive Workload','Physical Conditioning',
  'Environment','Tooling & Equipment','Motivation','Personal Resilience'
];

const state = {
  view: 'home',
  mode: SUPABASE_READY ? 'supabase' : 'demo',
  profileId: localStorage.getItem('kudos_profile') || '',
  teamFilter: '',
  profileFilter: '',
  challengeFilter: 'all',
  progressMode: 'team',
  reportChallengeKey: '',
  data: null,
  notice: '',
  authUser: null,
  appUser: null
};

const uid = (prefix='ID') => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
const today = () => new Date().toISOString().slice(0,10);
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-GB', {maximumFractionDigits:2});
const pct = n => `${(Number(n || 0) * 100).toFixed(Number(n||0) < .01 ? 2 : 1)}%`;
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

function seedDemo(){
  const end = '2026-12-11', start='2026-09-01';
  return {
    teams: Array.from({length:8},(_,i)=>({id:`team-${i+1}`,name:`Team ${i+1}`})),
    profiles: [
      {id:'PROF-00001',name:'Paul Rendle',team_id:'team-1',role:'user',active:true},
      {id:'PROF-00002',name:'Jay Partington',team_id:'team-5',role:'user',active:true},
      {id:'PROF-00003',name:'Performance Rep',team_id:'team-1',role:'rep',active:true}
    ],
    challenges: [
      {id:'CH-00001',code:'CH-00001',team_id:'team-1',title:'Lift Together',description:'Bench, squat or lift the combined weight as a team.',target:105000,unit:'kg',source_type:'progress',start_date:start,end_date:end,active:true,psfs:['Physical Conditioning','Motivation','Personal Resilience']},
      {id:'CH-00002',code:'CH-00002',team_id:'team-1',title:'Cycle Together',description:'Collectively cycle the length of the equator.',target:40075,unit:'km',source_type:'progress',start_date:start,end_date:end,active:true,psfs:['Physical Conditioning','Stress','Motivation','Personal Resilience']},
      {id:'CH-00003',code:'CH-00003',team_id:'team-1',title:'Recovery Nights',description:'Record nights where you achieved your personal recovery target.',target:900,unit:'nights',source_type:'progress',start_date:start,end_date:end,active:true,psfs:['Fatigue','Cognitive Workload','Personal Resilience']},
      {id:'CH-00004',code:'CH-00004',team_id:'team-1',title:'Pause to Perform',description:'Record deliberate pauses before demanding or safety-critical activity.',target:900,unit:'pauses',source_type:'progress',start_date:start,end_date:end,active:true,psfs:['Time Pressure','Cognitive Workload','Fatigue']},
      {id:'CH-00005',code:'CH-00005',team_id:'team-1',title:'Fix the Friction',description:'Make small improvements that make the workplace or way of working easier.',target:30,unit:'improvements',source_type:'progress',start_date:start,end_date:end,active:true,psfs:['Environment','Tooling & Equipment','Time Pressure']},
      {id:'CH-00006',code:'CH-00006',team_id:'team-1',title:'Recognise Someone',description:'Recognise useful contribution and CHF Performance behaviours.',target:60,unit:'recognitions',source_type:'recognition',start_date:start,end_date:end,active:true,psfs:['Motivation','Personal Resilience']},
      {id:'CH-00007',code:'CH-00007',team_id:'team-1',title:'Innovation',description:'Submit ideas that could make the team safer, simpler or more effective.',target:20,unit:'ideas',source_type:'innovation',start_date:start,end_date:end,active:true,psfs:['Environment','Tooling & Equipment','Motivation']},
      {id:'CH-00008',code:'CH-00008',team_id:'team-1',title:'Flight Safety',description:'Contribute to the safety learning system through valid safety submissions.',target:20,unit:'submissions',source_type:'safety',start_date:start,end_date:end,active:true,psfs:['Time Pressure','Cognitive Workload','Environment']},
      {id:'CH-00009',code:'CH-00009',team_id:'team-5',title:'Learn & Share',description:'Stand up and brief, share knowledge and learn together.',target:30,unit:'shares',source_type:'progress',start_date:start,end_date:end,active:true,psfs:['Cognitive Workload','Motivation','Personal Resilience']}
    ],
    progress: [
      {id:'PU-001',profile_id:'PROF-00001',challenge_id:'CH-00001',value:5,date:'2026-08-26',note:''},
      {id:'PU-002',profile_id:'PROF-00001',challenge_id:'CH-00002',value:5,date:'2026-08-26',note:''},
      {id:'PU-003',profile_id:'PROF-00002',challenge_id:'CH-00009',value:1,date:'2026-08-30',note:''}
    ],
    recognition: [], innovation: [], safety: []
  };
}

function loadDemo(){
  let raw = localStorage.getItem('kudos_demo_data');
  if(!raw){ const d=seedDemo(); localStorage.setItem('kudos_demo_data',JSON.stringify(d)); return d; }
  try{return JSON.parse(raw)}catch{const d=seedDemo(); localStorage.setItem('kudos_demo_data',JSON.stringify(d)); return d;}
}
function saveDemo(){ if(state.mode==='demo') localStorage.setItem('kudos_demo_data',JSON.stringify(state.data)); }

async function loadSupabase(){
  const [teams,profiles,challenges,psfs,challengePsfs,challengeProgress,profileTotals,profileScores,teamScores,progressHistory] = await Promise.all([
    supabase.from('teams').select('*').order('name'),
    supabase.from('profiles').select('*').eq('active',true).order('name'),
    supabase.from('challenges').select('*').eq('active',true).order('start_date'),
    supabase.from('psfs').select('*').order('display_order'),
    supabase.from('challenge_psfs').select('*'),
    supabase.from('challenge_progress').select('*'),
    supabase.from('profile_challenge_totals').select('*'),
    supabase.from('profile_scores').select('*'),
    supabase.from('team_scores').select('*'),
    supabase.from('progress_history').select('*').order('entry_date')
  ]);
  const err=[teams,profiles,challenges,psfs,challengePsfs,challengeProgress,profileTotals,profileScores,teamScores,progressHistory].find(x=>x.error);
  if(err?.error) throw err.error;
  const psfMap = Object.fromEntries(psfs.data.map(x=>[x.id,x.name]));
  const cPsfs = {};
  challengePsfs.data.forEach(x => (cPsfs[x.challenge_id] ||= []).push(psfMap[x.psf_id]));
  return {
    teams:teams.data, profiles:profiles.data,
    challenges:challenges.data.map(c=>({...c,psfs:cPsfs[c.id]||[]})),
    challengeProgress:challengeProgress.data,
    profileTotals:profileTotals.data,
    profileScores:profileScores.data,
    teamScores:teamScores.data,
    progressHistory:progressHistory.data,
    progress:[], recognition:[], innovation:[], safety:[]
  };
}


async function loadAdminEntries(){
  if(state.mode!=='supabase' || !isFullAdmin()) return {progress:[],recognition:[],innovation:[],safety:[]};
  const [progress,recognition,innovation,safety] = await Promise.all([
    supabase.from('progress_entries').select('*').order('created_at',{ascending:false}).limit(100),
    supabase.from('recognition_entries').select('*').order('created_at',{ascending:false}).limit(100),
    supabase.from('innovation_entries').select('*').order('created_at',{ascending:false}).limit(100),
    supabase.from('safety_entries').select('*').order('created_at',{ascending:false}).limit(100)
  ]);
  const err=[progress,recognition,innovation,safety].find(x=>x.error);
  if(err?.error) throw err.error;
  return {
    progress:progress.data||[],
    recognition:recognition.data||[],
    innovation:innovation.data||[],
    safety:safety.data||[]
  };
}


async function loadAdminSession(){
  if(state.mode!=='supabase' || !supabase) return;
  const {data:{session}} = await supabase.auth.getSession();
  state.authUser = session?.user || null;
  state.appUser = null;
  if(state.authUser){
    const {data,error} = await supabase.from('app_users').select('*').eq('auth_user_id',state.authUser.id).maybeSingle();
    if(!error) state.appUser = data || null;
  }
}
function isAdmin(){ return ['rep','admin'].includes(state.appUser?.role); }
function isFullAdmin(){ return state.appUser?.role==='admin'; }
function adminTeamId(){
  if(state.appUser?.role==='rep') return state.appUser.team_id;
  return state.teamFilter || currentProfile()?.team_id || state.data?.teams?.[0]?.id || '';
}

async function refresh(){
  try{
    if(state.mode==='supabase') await loadAdminSession();
    state.data = state.mode==='demo' ? loadDemo() : await loadSupabase();
    if(state.mode==='supabase' && isFullAdmin()) state.data.adminEntries = await loadAdminEntries();
    if(!state.profileId && state.data.profiles.length) state.profileId=state.data.profiles[0].id;
    if(!state.profileFilter) state.profileFilter=state.profileId;
    if(!state.teamFilter) state.teamFilter=currentProfile()?.team_id || state.data.teams[0]?.id || '';
    render();
  }catch(e){
    console.error(e); state.notice=`Could not load data: ${e.message||e}`; render();
  }
}

function currentProfile(){ return state.data?.profiles.find(p=>p.id===state.profileId); }
function teamName(id){return state.data?.teams.find(t=>t.id===id)?.name || 'Team';}
function challengeById(id){return state.data?.challenges.find(c=>c.id===id);}
function profileById(id){return state.data?.profiles.find(p=>p.id===id);}

function demoChallengeStats(challenge){
  const teamProfiles = state.data.profiles.filter(p=>p.team_id===challenge.team_id).map(p=>p.id);
  let entries=[], actual=0;
  if(challenge.source_type==='progress'){
    entries=state.data.progress.filter(x=>x.challenge_id===challenge.id); actual=entries.reduce((a,x)=>a+Number(x.value||0),0);
  } else if(challenge.source_type==='recognition'){
    entries=state.data.recognition.filter(x=>teamProfiles.includes(x.submitter_profile_id)); actual=entries.length;
  } else if(challenge.source_type==='innovation'){
    entries=state.data.innovation.filter(x=>teamProfiles.includes(x.profile_id)); actual=entries.length;
  } else if(challenge.source_type==='safety'){
    entries=state.data.safety.filter(x=>teamProfiles.includes(x.profile_id)); actual=entries.length;
  }
  const contributors=new Set(entries.map(x=>x.profile_id||x.submitter_profile_id)).size;
  return {challenge_id:challenge.id,actual,target:Number(challenge.target),completion:Number(challenge.target)?actual/Number(challenge.target):0,remaining:Math.max(Number(challenge.target)-actual,0),contributors};
}
function challengeStats(challenge){
  if(state.mode==='demo') return demoChallengeStats(challenge);
  const s=state.data.challengeProgress.find(x=>x.challenge_id===challenge.id);
  return s ? {challenge_id:challenge.id,actual:Number(s.actual_progress||0),target:Number(s.target||challenge.target),completion:Number(s.completion||0),remaining:Number(s.remaining||0),contributors:Number(s.contributors||0)} : {actual:0,target:Number(challenge.target),completion:0,remaining:Number(challenge.target),contributors:0};
}
function personalContribution(profileId, challenge){
  if(state.mode==='supabase'){
    const r=state.data.profileTotals.find(x=>x.profile_id===profileId && x.challenge_id===challenge.id); return Number(r?.contribution||0);
  }
  if(challenge.source_type==='progress') return state.data.progress.filter(x=>x.profile_id===profileId&&x.challenge_id===challenge.id).reduce((a,x)=>a+Number(x.value||0),0);
  if(challenge.source_type==='recognition') return state.data.recognition.filter(x=>x.submitter_profile_id===profileId).length;
  if(challenge.source_type==='innovation') return state.data.innovation.filter(x=>x.profile_id===profileId).length;
  if(challenge.source_type==='safety') return state.data.safety.filter(x=>x.profile_id===profileId).length;
  return 0;
}
function demoChallengeKudos(profileId){
  return state.data.challenges
    .filter(c=>c.active!==false && c.source_type==='progress' && Number(c.target||0)>0)
    .reduce((sum,c)=>sum + Math.min((personalContribution(profileId,c) / Number(c.target)) * 1000, 100), 0);
}
function profileScore(profileId){
  if(state.mode==='supabase') return Number(state.data.profileScores.find(x=>x.profile_id===profileId)?.kudos_score||0);
  const progress=demoChallengeKudos(profileId);
  const special=20*(state.data.recognition.filter(x=>x.submitter_profile_id===profileId).length+state.data.innovation.filter(x=>x.profile_id===profileId).length+state.data.safety.filter(x=>x.profile_id===profileId).length);
  return progress+special;
}
function scoreBreakdown(profileId){
  if(state.mode==='supabase'){
    const s=state.data.profileScores.find(x=>x.profile_id===profileId)||{};
    return {progress:Number(s.challenge_points||0),recognition:Number(s.recognition_points||0),innovation:Number(s.innovation_points||0),safety:Number(s.safety_points||0),total:Number(s.kudos_score||0)};
  }
  const progress=demoChallengeKudos(profileId);
  const recognition=state.data.recognition.filter(x=>x.submitter_profile_id===profileId).length*20;
  const innovation=state.data.innovation.filter(x=>x.profile_id===profileId).length*20;
  const safety=state.data.safety.filter(x=>x.profile_id===profileId).length*20;
  return {progress,recognition,innovation,safety,total:progress+recognition+innovation+safety};
}
function teamScore(teamId){
  if(state.mode==='supabase') return Number(state.data.teamScores.find(x=>x.team_id===teamId)?.kudos_score||0);
  return state.data.profiles.filter(p=>p.team_id===teamId).reduce((a,p)=>a+profileScore(p.id),0);
}
function activeTeamChallenges(teamId){return state.data.challenges.filter(c=>c.team_id===teamId&&c.active!==false);}
function teamAverage(teamId){const cs=activeTeamChallenges(teamId); return cs.length?cs.reduce((a,c)=>a+Math.min(challengeStats(c).completion,1),0)/cs.length:0;}
function psfCoverage(teamId){
  const covered=new Set(); activeTeamChallenges(teamId).forEach(c=>(c.psfs||[]).forEach(p=>covered.add(p)));
  return {count:covered.size,covered};
}

function header(){
  const p=currentProfile();
  return `<header class="topbar"><div class="brand"><img src="chf-crest.png" alt="CHF crest"><div><strong>KUDOS</strong><small>CHF Human Performance</small></div></div>
  <button class="profile-chip" data-action="profile"><div>${esc(p?.name||'Select profile')}</div><span>${esc(p?teamName(p.team_id):'')}</span></button></header>`;
}
function nav(){
  const items=[['home','⌂','Home'],['challenges','◎','Challenges'],['log','＋','Log'],['progress','↗','Progress'],['reports','▥','Reports'],['contribute','★','Contribute'],['rep','⚙','Rep']];
  return `<nav class="bottom-nav">${items.map(([v,i,l])=>`<button class="nav-btn ${state.view===v?'active':''}" data-view="${v}"><b>${i}</b>${l}</button>`).join('')}</nav>`;
}
function crests(){return `<div class="crest-row">${[['chf-crest.png','CHF'],['845-crest.png','845 NAS'],['846-crest.png','846 NAS'],['847-crest.png','847 NAS']].map(([f,l])=>`<div><img src="${f}" alt="${l}"><div class="crest-label">${l}</div></div>`).join('')}</div>`}
function progressCard(c,profileId=state.profileId){
  const s=challengeStats(c), mine=personalContribution(profileId,c), pc=clamp(s.completion*100,0,100);
  return `<article class="card challenge-card"><div class="challenge-head"><div><h3>${esc(c.title)}</h3><div class="score-badge">${esc(teamName(c.team_id))}</div></div><span class="unit-badge">${esc(c.unit)}</span></div>
  <div class="challenge-desc">${esc(c.description||'')}</div><div class="progress-track"><div class="progress-fill" style="width:${pc}%"></div></div>
  <div class="progress-line"><span><strong>${fmt(s.actual)}</strong> / ${fmt(s.target)} ${esc(c.unit)}</span><span><strong>${pct(s.completion)}</strong></span></div>
  <div class="progress-line"><span>My contribution: <strong>${fmt(mine)} ${esc(c.unit)}</strong></span><span>${s.contributors} contributor${s.contributors===1?'':'s'}</span></div>
  <div class="tags">${(c.psfs||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>
  <div class="actions"><button class="btn primary small" data-log="${c.id}">Add progress</button><button class="btn ghost small" data-detail="${c.id}">View progress</button></div></article>`;
}


function contributionQuickActions(home=false){
  return `<div class="contribution-actions ${home?'home-contributions':''}">
    <div class="card contribution-card safety-priority">
      <div class="contribution-icon">!</div>
      <div>
        <div class="eyebrow">FLIGHT SAFETY</div>
        <h3>Report a safety issue</h3>
        <p class="challenge-desc">Record a safety concern or good catch with a short description. The submission is attributed to your selected KUDOS profile.</p>
        <div class="score-badge">1 safety contribution • +20 KUDOS</div>
      </div>
      <button class="btn safety-btn" data-special="safety">Report safety issue</button>
    </div>
    <div class="card contribution-card">
      <div class="contribution-icon">★</div>
      <div>
        <div class="eyebrow">RECOGNITION</div>
        <h3>Recognise someone</h3>
        <p class="challenge-desc">Nominate anyone by name — they do not need to have a KUDOS profile.</p>
        <div class="score-badge">1 recognition • +20 KUDOS</div>
      </div>
      <button class="btn primary" data-special="recognition">Submit recognition</button>
    </div>
    <div class="card contribution-card">
      <div class="contribution-icon">↗</div>
      <div>
        <div class="eyebrow">INNOVATION</div>
        <h3>Submit an idea</h3>
        <p class="challenge-desc">Suggest something that makes the team safer, simpler or more effective.</p>
        <div class="score-badge">1 idea • +20 KUDOS</div>
      </div>
      <button class="btn primary" data-special="innovation">Submit innovation</button>
    </div>
  </div>`;
}

function homeView(){
  const p=currentProfile(), team=p?.team_id || state.teamFilter, challenges=activeTeamChallenges(team), avg=teamAverage(team), cov=psfCoverage(team);
  return `<section class="hero"><div><div class="gold" style="font-weight:900;letter-spacing:.12em">KUDOS</div><h1>CHF HUMAN<br><span class="gold">PERFORMANCE</span></h1><p>Team challenges built around the factors that shape performance. Small actions. Better performance. Challenge progress tracks the real measure, while KUDOS points reward the value of the contribution.</p><span class="strap">READY TO LEAD • READY TO FIGHT • READY TO WIN</span></div></section>
  <div class="section-title"><h2>${esc(teamName(team))} overview</h2><p>${state.mode==='demo'?'Demo mode – ready for Supabase':'Live shared data'}</p></div>
  <div class="grid four"><div class="card metric"><div class="label">My KUDOS score</div><div class="value">${fmt(profileScore(p?.id))}</div><div class="sub">Challenge score from % of target + 20 KUDOS contributions</div></div>
  <div class="card metric"><div class="label">Team KUDOS score</div><div class="value">${fmt(teamScore(team))}</div><div class="sub">Combined individual contribution</div></div>
  <div class="card metric"><div class="label">Challenge completion</div><div class="value">${pct(avg)}</div><div class="sub">Average capped at 100% per challenge</div></div>
  <div class="card metric"><div class="label">PSF coverage</div><div class="value">${cov.count}/9</div><div class="sub">Across the current challenge portfolio</div></div></div>
  <div class="section-title contribution-title"><h2>Make a contribution</h2><p>Safety • Recognition • Innovation</p></div>
  <div class="card scoring-explainer"><strong>How KUDOS scoring works</strong><div class="help">Challenge progress still tracks the real measure, such as kg or km. Your KUDOS score comes from the share of the team target you contribute: <strong>1% of target = 10 KUDOS</strong>, up to a maximum of <strong>100 KUDOS per person per challenge</strong>. Each <strong>Recognition</strong>, <strong>Innovation</strong> and <strong>Flight Safety</strong> submission is worth <strong>20 KUDOS</strong>.</div></div>
  ${contributionQuickActions(true)}
  <div class="section-title"><h2>Current challenges</h2><p>${challenges.length} active</p></div><div class="grid two">${challenges.slice(0,6).map(c=>progressCard(c)).join('')||'<div class="empty">No active challenges for this team.</div>'}</div>${crests()}`;
}

function challengesView(){
  const p=currentProfile(), team=state.teamFilter||p?.team_id;
  const teamsOpts=state.data.teams.map(t=>`<option value="${t.id}" ${t.id===team?'selected':''}>${esc(t.name)}</option>`).join('');
  const cs=activeTeamChallenges(team), cov=psfCoverage(team);
  return `<div class="section-title"><h2>Team challenges</h2><p>5–7 challenges • all 9 PSFs across the portfolio</p></div>
  <div class="card"><div class="field"><label>Team</label><select id="teamFilter">${teamsOpts}</select></div><div class="coverage"><span style="width:${cov.count/9*100}%"></span></div><div class="help" style="margin-top:7px">${cov.count}/9 Performance Shaping Factors covered</div></div>
  <div class="section-title"><h2>${esc(teamName(team))}</h2><p>${cs.length} active challenges</p></div><div class="grid two">${cs.map(c=>progressCard(c)).join('')||'<div class="empty">No active challenges.</div>'}</div>`;
}

function logView(challengeId=''){
  const p=currentProfile(), cs=activeTeamChallenges(p?.team_id).filter(c=>c.source_type==='progress');
  const selected=challengeId||state.challengeFilter!=='all'?challengeId||state.challengeFilter:'';
  return `<div class="section-title"><h2>Log KUDOS progress</h2><p>One action • one measure • one team target</p></div><div class="card form-card">
  <form id="progressForm"><div class="field"><label>Profile</label><input value="${esc(p?.name||'')}" disabled><div class="help">Profile is remembered on this device.</div></div>
  <div class="field"><label>Challenge</label><select name="challenge_id" required><option value="">Choose challenge</option>${cs.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.title)} — ${esc(c.unit)}</option>`).join('')}</select></div>
  <div class="field"><label>Value</label><input name="value" type="number" step="any" min="0" required placeholder="Enter your contribution"></div>
  <div class="field"><label>Date</label><input name="date" type="date" value="${today()}" required></div>
  <div class="field"><label>Note <span class="help">optional</span></label><textarea name="note" placeholder="Short context if useful"></textarea></div>
  <button class="btn primary" type="submit">Add to team progress</button></form></div>`;
}

function cumulativePoints(challenge,profileId=null){
  if(state.mode==='supabase'){
    const rows=(state.data.progressHistory||[])
      .filter(x=>x.challenge_id===challenge.id && (!profileId||x.profile_id===profileId))
      .map(x=>({date:x.entry_date,value:Number(x.daily_value||0)}))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const daily=[];
    rows.forEach(r=>{
      const last=daily.at(-1);
      if(last&&last.date===r.date) last.value+=r.value;
      else daily.push({...r});
    });
    let total=0;
    const pts=daily.map(r=>({date:r.date,value:total+=r.value}));
    if(pts.length===1) pts.unshift({date:challenge.start_date||pts[0].date,value:0});
    else if(pts.length && challenge.start_date && challenge.start_date<pts[0].date) pts.unshift({date:challenge.start_date,value:0});
    return pts;
  }
  const teamProfiles = new Set(state.data.profiles.filter(p=>p.team_id===challenge.team_id).map(p=>p.id));
  let rows=[];
  if(challenge.source_type==='progress') rows=state.data.progress.filter(x=>x.challenge_id===challenge.id && (!profileId||x.profile_id===profileId)).map(x=>({date:x.date,value:Number(x.value)}));
  else if(challenge.source_type==='recognition') rows=state.data.recognition.filter(x=>teamProfiles.has(x.submitter_profile_id) && (!profileId||x.submitter_profile_id===profileId)).map(x=>({date:x.date,value:1}));
  else if(challenge.source_type==='innovation') rows=state.data.innovation.filter(x=>teamProfiles.has(x.profile_id) && (!profileId||x.profile_id===profileId)).map(x=>({date:x.date,value:1}));
  else rows=state.data.safety.filter(x=>teamProfiles.has(x.profile_id) && (!profileId||x.profile_id===profileId)).map(x=>({date:x.date,value:1}));
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  let total=0;
  const pts=rows.map(r=>({date:r.date,value:total+=r.value}));
  if(pts.length===1) pts.unshift({date:challenge.start_date||pts[0].date,value:0});
  else if(pts.length && challenge.start_date && challenge.start_date<pts[0].date) pts.unshift({date:challenge.start_date,value:0});
  return pts;
}
function svgChart(challenge,profileId=null){
  const pts=cumulativePoints(challenge,profileId); const target=Number(challenge.target||1);
  if(!pts.length) return `<div class="empty">Progress over time will appear after contributions are logged.</div>`;
  const W=700,H=170,pad=28,max=Math.max(target,...pts.map(p=>p.value),1); const step=pts.length>1?(W-pad*2)/(pts.length-1):0;
  const coords=pts.map((p,i)=>({x:pad+i*step,y:H-pad-(p.value/max)*(H-pad*2),...p}));
  const d=coords.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '); const gy=H-pad-(target/max)*(H-pad*2);
  const dots=coords.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#435F46"/>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line class="axis" x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}"/><line class="goal" x1="${pad}" y1="${gy}" x2="${W-pad}" y2="${gy}"/><path class="series" d="${d}"/>${dots}<text x="${pad}" y="15">Target ${fmt(target)} ${esc(challenge.unit)}</text><text x="${pad}" y="${H-7}">${esc(pts[0].date)}</text><text x="${W-pad-70}" y="${H-7}">${esc(pts.at(-1).date)}</text></svg>`;
}

function progressView(){
  const p=currentProfile(); const team=state.teamFilter||p?.team_id;
  const selectedProfile=state.profileFilter||p?.id;
  const teamOpts=state.data.teams.map(t=>`<option value="${t.id}" ${t.id===team?'selected':''}>${esc(t.name)}</option>`).join('');
  const profiles=state.data.profiles.filter(x=>x.team_id===team); const profileOpts=profiles.map(x=>`<option value="${x.id}" ${x.id===selectedProfile?'selected':''}>${esc(x.name)}</option>`).join('');
  const cs=activeTeamChallenges(team); const selected=state.challengeFilter==='all'?cs[0]:cs.find(c=>c.id===state.challengeFilter)||cs[0];
  return `<div class="section-title"><h2>Progress</h2><p>Team targets and individual contribution</p></div><div class="card">
  <div class="segmented"><button data-mode="team" class="${state.progressMode==='team'?'active':''}">Team</button><button data-mode="individual" class="${state.progressMode==='individual'?'active':''}">Individual</button></div>
  <div class="grid two" style="margin-top:14px"><div class="field"><label>Team</label><select id="progressTeam">${teamOpts}</select></div>${state.progressMode==='individual'?`<div class="field"><label>Person</label><select id="progressProfile">${profileOpts}</select></div>`:'<div></div>'}</div>
  <div class="field"><label>Challenge</label><select id="progressChallenge"><option value="all">All challenges</option>${cs.map(c=>`<option value="${c.id}" ${state.challengeFilter===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></div></div>
  ${state.challengeFilter==='all'?allChallengesProgress(cs, selectedProfile):singleChallengeProgress(selected, selectedProfile)}`;
}
function allChallengesProgress(cs,profileId){
  return `<div class="section-title"><h2>All challenges</h2><p>Comparable by percentage complete</p></div><div class="grid two">${cs.map(c=>{
    const s=challengeStats(c), mine=personalContribution(profileId,c);return `<div class="card"><div class="challenge-head"><h3>${esc(c.title)}</h3><span class="unit-badge">${pct(s.completion)}</span></div><div class="progress-track" style="margin:14px 0"><div class="progress-fill" style="width:${clamp(s.completion*100,0,100)}%"></div></div><div class="progress-line"><span>Team: <strong>${fmt(s.actual)} / ${fmt(s.target)} ${esc(c.unit)}</strong></span>${state.progressMode==='individual'?`<span>Selected person: <strong>${fmt(mine)}</strong></span>`:''}</div></div>`}).join('')}</div>`;
}
function singleChallengeProgress(c,profileId){
  if(!c) return '<div class="empty">No challenge selected.</div>'; const s=challengeStats(c), mine=personalContribution(profileId,c);
  return `<div class="section-title"><h2>${esc(c.title)}</h2><p>${esc(teamName(c.team_id))}</p></div><div class="grid two"><div class="card"><div class="kpi-list"><div class="kpi"><b>${fmt(s.actual)}</b><span>Team progress (${esc(c.unit)})</span></div><div class="kpi"><b>${pct(s.completion)}</b><span>Complete</span></div><div class="kpi"><b>${fmt(s.remaining)}</b><span>Remaining</span></div><div class="kpi"><b>${s.contributors}</b><span>Contributors</span></div></div>${state.progressMode==='individual'?`<div class="notice success" style="margin-top:14px">Selected person contribution: <strong>${fmt(mine)} ${esc(c.unit)}</strong>. The target remains collective.</div>`:''}</div><div class="card"><h3 style="margin-top:0">Progress over time</h3>${svgChart(c,state.progressMode==='individual'?profileId:null)}</div></div>`;
}


function challengeGroupKey(c){
  return [String(c.title||'').trim().toLowerCase(),String(c.unit||'').trim().toLowerCase(),String(c.source_type||'progress').trim().toLowerCase()].join('|');
}
function challengeGroups(){
  const map=new Map();
  (state.data.challenges||[]).filter(c=>c.active!==false).forEach(c=>{
    const key=challengeGroupKey(c);
    if(!map.has(key)) map.set(key,{key,title:c.title,unit:c.unit,source_type:c.source_type,challenges:[]});
    map.get(key).challenges.push(c);
  });
  return [...map.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title)));
}
function overallTeamReportRows(){
  const rows=(state.data.teams||[]).map(t=>{
    const cs=activeTeamChallenges(t.id);
    const avg=cs.length?cs.reduce((sum,c)=>sum+Math.min(challengeStats(c).completion,1),0)/cs.length:0;
    const completed=cs.filter(c=>challengeStats(c).completion>=1).length;
    const people=(state.data.profiles||[]).filter(p=>p.team_id===t.id&&p.active!==false).length;
    return {team_id:t.id,name:t.name,challengeCount:cs.length,avg,completed,kudos:teamScore(t.id),people};
  });
  rows.sort((a,b)=>{
    if(Boolean(a.challengeCount)!==Boolean(b.challengeCount)) return b.challengeCount-a.challengeCount;
    return b.avg-a.avg || b.kudos-a.kudos || a.name.localeCompare(b.name);
  });
  let rank=0;
  rows.forEach(r=>{r.rank=r.challengeCount?++rank:null});
  return rows;
}
function kudosTeamReportRows(){
  const rows=(state.data.teams||[]).map(t=>({
    team_id:t.id,name:t.name,kudos:teamScore(t.id),
    people:(state.data.profiles||[]).filter(p=>p.team_id===t.id&&p.active!==false).length
  })).sort((a,b)=>b.kudos-a.kudos||a.name.localeCompare(b.name));
  let rank=0, last=null, seen=0;
  rows.forEach(r=>{seen++; if(last===null||r.kudos!==last) rank=seen; r.rank=rank; last=r.kudos;});
  return rows;
}
function groupTeamRows(group){
  const rows=(state.data.teams||[]).map(t=>{
    const matches=group.challenges.filter(c=>c.team_id===t.id);
    if(!matches.length) return {team_id:t.id,name:t.name,has:false,actual:0,target:0,completion:0,contributors:0,rank:null};
    let actual=0,target=0,contributors=0;
    matches.forEach(c=>{
      const s=challengeStats(c); actual+=Number(s.actual||0); target+=Number(s.target||0); contributors+=Number(s.contributors||0);
    });
    return {team_id:t.id,name:t.name,has:true,actual,target,completion:target?Math.min(actual/target,1):0,contributors};
  });
  const ranked=rows.filter(r=>r.has).sort((a,b)=>b.completion-a.completion||b.actual-a.actual||a.name.localeCompare(b.name));
  let lastComp=null, rank=0;
  ranked.forEach((r,i)=>{if(lastComp===null||r.completion!==lastComp)rank=i+1;r.rank=rank;lastComp=r.completion});
  const ranks=Object.fromEntries(ranked.map(r=>[r.team_id,r.rank]));
  rows.forEach(r=>r.rank=ranks[r.team_id]||null);
  return rows.sort((a,b)=>(a.rank??999)-(b.rank??999)||a.name.localeCompare(b.name));
}
function groupTopIndividuals(group,limit=5){
  const ids=new Set(group.challenges.map(c=>c.id));
  const totals=new Map();
  (state.data.profileTotals||[]).filter(x=>ids.has(x.challenge_id)).forEach(x=>{
    const n=Number(x.contribution||0);
    if(n<=0) return;
    totals.set(x.profile_id,(totals.get(x.profile_id)||0)+n);
  });
  if(state.mode==='demo'){
    group.challenges.forEach(c=>{
      (state.data.profiles||[]).filter(p=>p.team_id===c.team_id).forEach(p=>{
        const n=personalContribution(p.id,c);
        if(n>0) totals.set(p.id,(totals.get(p.id)||0)+n);
      });
    });
  }
  return [...totals.entries()].map(([profile_id,contribution])=>{
    const p=profileById(profile_id);
    return {profile_id,name:p?.name||'Profile',team_id:p?.team_id||'',team:teamName(p?.team_id),contribution};
  }).sort((a,b)=>b.contribution-a.contribution||a.name.localeCompare(b.name)).slice(0,limit);
}
function topKudosIndividuals(limit=5){
  if(state.mode==='supabase'){
    return [...(state.data.profileScores||[])].map(x=>({
      profile_id:x.profile_id,name:x.name||profileById(x.profile_id)?.name||'Profile',
      team_id:x.team_id,team:teamName(x.team_id),score:Number(x.kudos_score||0)
    })).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit);
  }
  return (state.data.profiles||[]).map(p=>({profile_id:p.id,name:p.name,team_id:p.team_id,team:teamName(p.team_id),score:profileScore(p.id)}))
    .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit);
}
function rankPill(rank){
  if(!rank) return '<span class="rank-pill muted-rank">—</span>';
  return `<span class="rank-pill ${rank===1?'winner':''}">${rank}</span>`;
}
function reportProgressBar(value){
  return `<div class="report-track"><span style="width:${clamp(Number(value||0)*100,0,100)}%"></span></div>`;
}
function reportsView(){
  const groups=challengeGroups();
  if(!state.reportChallengeKey && groups.length) state.reportChallengeKey=groups[0].key;
  const selected=groups.find(g=>g.key===state.reportChallengeKey)||groups[0];
  const overall=overallTeamReportRows();
  const kudosTeams=kudosTeamReportRows();
  const challengeRows=selected?groupTeamRows(selected):[];
  const topOverall=topKudosIndividuals(5);
  const groupOptions=groups.map(g=>`<option value="${esc(g.key)}" ${g.key===selected?.key?'selected':''}>${esc(g.title)} — ${esc(g.unit)}</option>`).join('');

  const overallRows=overall.map(r=>`<tr><td>${rankPill(r.rank)}</td><td><strong>${esc(r.name)}</strong></td><td>${r.challengeCount?pct(r.avg):'—'}${r.challengeCount?reportProgressBar(r.avg):''}</td><td>${r.completed}/${r.challengeCount}</td><td>${fmt(r.kudos)}</td><td>${r.people}</td></tr>`).join('');
  const kudosRows=kudosTeams.map(r=>`<tr><td>${rankPill(r.rank)}</td><td><strong>${esc(r.name)}</strong></td><td><strong>${fmt(r.kudos)}</strong></td><td>${r.people}</td></tr>`).join('');
  const challengeCards=challengeRows.map(r=>`<div class="card team-rank-card ${r.rank===1?'leader-card':''}"><div class="team-rank-head"><div>${rankPill(r.rank)}<strong>${esc(r.name)}</strong></div><span>${r.has?pct(r.completion):'Not set'}</span></div>${r.has?`${reportProgressBar(r.completion)}<div class="progress-line"><span><strong>${fmt(r.actual)}</strong> / ${fmt(r.target)} ${esc(selected.unit)}</span><span>${r.contributors} contributor${r.contributors===1?'':'s'}</span></div>`:`<div class="help">This team does not currently have a matching challenge.</div>`}</div>`).join('');

  const topByChallenge=groups.map(g=>{
    const top=groupTopIndividuals(g,5);
    const rows=top.map((r,i)=>`<tr><td>${rankPill(i+1)}</td><td><strong>${esc(r.name)}</strong><div class="help">${esc(r.team)}</div></td><td class="num"><strong>${fmt(r.contribution)}</strong> ${esc(g.unit)}</td></tr>`).join('');
    return `<div class="card leaderboard-card"><div class="challenge-head"><div><h3>${esc(g.title)}</h3><div class="help">${esc(g.unit)} • ${g.challenges.length} team challenge${g.challenges.length===1?'':'s'}</div></div><span class="unit-badge">Top 5</span></div>${top.length?`<div class="mini-table"><table><thead><tr><th>Rank</th><th>Individual</th><th>Contribution</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty compact-empty">No contributions yet.</div>'}</div>`;
  }).join('');

  const topOverallRows=topOverall.map((r,i)=>`<tr><td>${rankPill(i+1)}</td><td><strong>${esc(r.name)}</strong><div class="help">${esc(r.team)}</div></td><td class="num"><strong>${fmt(r.score)}</strong></td></tr>`).join('');

  return `<div class="section-title"><h2>Reports</h2><p>Individual contribution and team standings</p></div>
  <div class="report-intro card"><div><strong>How the overall lead is calculated</strong><div class="help">Overall challenge position uses each team's average percentage completion across its active challenges, capped at 100% per challenge. KUDOS points are shown separately.</div></div></div>

  <div class="section-title"><h2>Overall team standings</h2><p>Challenge performance and KUDOS score</p></div>
  <div class="grid two">
    <div class="card"><h3 class="report-card-title">Overall challenge lead</h3><div class="table-wrap report-table"><table><thead><tr><th>Rank</th><th>Team</th><th>Avg completion</th><th>Completed</th><th>KUDOS</th><th>People</th></tr></thead><tbody>${overallRows}</tbody></table></div></div>
    <div class="card"><h3 class="report-card-title">Overall KUDOS score</h3><div class="table-wrap report-table"><table><thead><tr><th>Rank</th><th>Team</th><th>KUDOS score</th><th>People</th></tr></thead><tbody>${kudosRows}</tbody></table></div></div>
  </div>

  <div class="section-title"><h2>Challenge team standings</h2><p>Teams alongside each other</p></div>
  <div class="card"><div class="field" style="margin-bottom:0"><label>Challenge</label><select id="reportChallenge">${groupOptions}</select></div></div>
  ${selected?`<div class="section-title"><h2>${esc(selected.title)}</h2><p>${esc(selected.unit)} • ranked by percentage complete</p></div><div class="grid four report-team-grid">${challengeCards}</div>`:'<div class="empty">No active challenges yet.</div>'}

  <div class="section-title"><h2>Top 5 individuals by challenge</h2><p>Largest contribution to each team target</p></div>
  <div class="grid two">${topByChallenge||'<div class="empty">No challenge contribution data yet.</div>'}</div>

  <div class="section-title"><h2>Top 5 overall KUDOS scores</h2><p>Across challenge activity, recognition, innovation and safety contributions</p></div>
  <div class="card leaderboard-card">${topOverallRows?`<div class="mini-table"><table><thead><tr><th>Rank</th><th>Individual</th><th>KUDOS score</th></tr></thead><tbody>${topOverallRows}</tbody></table></div>`:'<div class="empty compact-empty">No scores yet.</div>'}</div>
  <div class="notice" style="margin-top:14px">Challenge team comparisons currently group challenges when the <strong>challenge name, unit and contribution type match</strong>. If teams use different names for the same intended challenge, they will appear as separate challenge groups.</div>`;
}

function contributeView(){
  return `<div class="section-title"><h2>Contribute</h2><p>Safety, recognition and innovation</p></div>${contributionQuickActions(false)}
  <div class="notice" style="margin-top:14px">Every submission records the selected KUDOS profile as the creator and is also sent through the site notification form for administrator email notification. Recognition, Innovation and Flight Safety are each worth 20 KUDOS.</div>`;
}


function entryCreator(profileId){
  const p=profileById(profileId);
  return p ? `${p.name} • ${teamName(p.team_id)}` : 'Unknown profile';
}
function shortText(value,max=120){
  const s=String(value||'').trim();
  return s.length>max ? `${s.slice(0,max-1)}…` : s;
}
function adminEntryRows(){
  const a=state.data?.adminEntries||{progress:[],recognition:[],innovation:[],safety:[]};
  const rows=[];
  (a.progress||[]).forEach(x=>rows.push({
    id:x.id,type:'progress',label:'Progress',
    creator:entryCreator(x.profile_id),
    date:x.entry_date||x.created_at?.slice(0,10)||'',
    headline:challengeById(x.challenge_id)?.title||'Challenge progress',
    detail:`${fmt(x.value)} ${challengeById(x.challenge_id)?.unit||''}${x.note?` • ${shortText(x.note)}`:''}`
  }));
  (a.recognition||[]).forEach(x=>rows.push({
    id:x.id,type:'recognition',label:'Recognition',
    creator:entryCreator(x.submitter_profile_id),
    date:x.entry_date||x.created_at?.slice(0,10)||'',
    headline:`Nominee: ${x.nominated_person||'Not recorded'}`,
    detail:shortText(x.reason,180)
  }));
  (a.innovation||[]).forEach(x=>rows.push({
    id:x.id,type:'innovation',label:'Innovation',
    creator:entryCreator(x.profile_id),
    date:x.entry_date||x.created_at?.slice(0,10)||'',
    headline:x.title||'Innovation',
    detail:shortText(x.description,180)
  }));
  (a.safety||[]).forEach(x=>rows.push({
    id:x.id,type:'safety',label:'Flight Safety',
    creator:entryCreator(x.profile_id),
    date:x.entry_date||x.created_at?.slice(0,10)||'',
    headline:x.category||'Flight Safety',
    detail:shortText(x.description,180)
  }));
  return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,200);
}
function adminModerationView(){
  if(!isFullAdmin()) return '';
  const rows=adminEntryRows();
  return `<div class="section-title"><h2>Entry moderation</h2><p>Admin only • remove invalid or erroneous contributions</p></div>
  <div class="notice moderation-note">Removing an entry immediately recalculates challenge progress and KUDOS scores. Any email notification already sent cannot be recalled.</div>
  <div class="table-wrap moderation-table"><table>
    <thead><tr><th>Type</th><th>Submitted by</th><th>Date</th><th>Entry</th><th>Detail</th><th></th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td><span class="entry-type ${r.type}">${esc(r.label)}</span></td>
      <td>${esc(r.creator)}</td>
      <td>${esc(r.date)}</td>
      <td><strong>${esc(r.headline)}</strong></td>
      <td class="moderation-detail">${esc(r.detail)}</td>
      <td><button class="btn danger compact" data-delete-entry="${esc(r.id)}" data-entry-type="${esc(r.type)}">Remove</button></td>
    </tr>`).join('') || '<tr><td colspan="6"><div class="empty compact-empty">No entries to moderate yet.</div></td></tr>'}
    </tbody></table></div>`;
}

function repView(){
  const team=state.mode==='demo' ? (currentProfile()?.team_id||state.teamFilter) : adminTeamId(); const cs=activeTeamChallenges(team); const cov=psfCoverage(team);
  if(state.mode==='supabase' && !state.authUser) return `<div class="section-title"><h2>Performance Representative / Admin</h2></div><div class="card"><h3>Administrator sign in</h3><p class="challenge-desc">Ordinary users do not need an account. Performance Representatives and KUDOS administrators sign in here.</p><button class="btn navy" data-action="adminLogin">Sign in</button></div>`;
  if(state.mode==='supabase' && state.authUser && !state.appUser) return `<div class="section-title"><h2>Performance Representative / Admin</h2></div><div class="notice">You are signed in, but this account has not yet been granted a KUDOS administrator or Performance Representative role.</div><div class="actions"><button class="btn ghost" data-action="adminLogout">Sign out</button></div>`;
  if(state.mode==='demo' && !['rep','admin'].includes(currentProfile()?.role)) return `<div class="section-title"><h2>Performance Representative</h2></div><div class="notice">This screen is reserved for Performance Representatives and KUDOS administrators.</div>`;
  return `<div class="section-title"><h2>Performance Representative / Admin</h2><p>${esc(teamName(team))}${state.mode==='supabase'&&state.appUser?` • ${esc(state.appUser.role.toUpperCase())}`:''}</p></div>${state.mode==='supabase'?`<div class="actions" style="margin-bottom:14px"><button class="btn ghost" data-action="adminLogout">Sign out admin</button></div>`:''}<div class="grid two"><div class="card"><h3 style="margin-top:0">Portfolio health</h3><div class="kpi-list"><div class="kpi"><b>${cs.length}</b><span>Active challenges</span></div><div class="kpi"><b>${cov.count}/9</b><span>PSFs covered</span></div><div class="kpi"><b>${pct(teamAverage(team))}</b><span>Average complete</span></div><div class="kpi"><b>${fmt(teamScore(team))}</b><span>Team KUDOS</span></div></div><div class="coverage" style="margin-top:14px"><span style="width:${cov.count/9*100}%"></span></div></div><div class="card"><h3 style="margin-top:0">Term challenge portfolio</h3><p class="challenge-desc">Create 5–7 simple, measurable challenges. Across the portfolio cover all nine Performance Shaping Factors.</p><button class="btn navy" data-action="newChallenge">Create challenge</button></div></div>
  <div class="section-title"><h2>PSF coverage</h2><p>${cov.count===9?'All nine covered':'Close the remaining gaps before launch'}</p></div><div class="psf-grid">${PSFS.map(x=>`<div class="psf ${cov.covered.has(x)?'on':''}"><span>${cov.covered.has(x)?'✓':'○'}</span>${esc(x)}</div>`).join('')}</div>
  <div class="section-title"><h2>Challenges</h2></div><div class="table-wrap"><table><thead><tr><th>Challenge</th><th>Target</th><th>Actual</th><th>Complete</th><th>PSFs</th></tr></thead><tbody>${cs.map(c=>{const s=challengeStats(c);return `<tr><td>${esc(c.title)}</td><td>${fmt(c.target)} ${esc(c.unit)}</td><td>${fmt(s.actual)}</td><td>${pct(s.completion)}</td><td>${(c.psfs||[]).map(esc).join(', ')}</td></tr>`}).join('')}</tbody></table></div>
  ${adminModerationView()}`;
}

function profileModal(){
  return `<div class="modal-backdrop" id="modal"><div class="modal"><h2>Select your profile</h2><p class="challenge-desc">KUDOS remembers this selection on this device. Ordinary users do not need an account.</p><div class="field"><label>Profile</label><select id="profileSelect">${state.data.profiles.map(p=>`<option value="${p.id}" ${p.id===state.profileId?'selected':''}>${esc(p.name)} — ${esc(teamName(p.team_id))}</option>`).join('')}</select></div><div class="actions"><button class="btn primary" data-action="saveProfile">Use this profile</button><button class="btn ghost" data-action="newProfile">Create profile</button><button class="btn ghost" data-action="closeModal">Cancel</button></div><div class="notice" style="margin-top:14px">Performance Rep/Admin controls should use protected login in production. The ordinary profile selector is intentionally low-friction.</div></div></div>`;
}

function newProfileModal(){
  return `<div class="modal-backdrop" id="modal"><div class="modal"><h2>Create your KUDOS profile</h2><form id="profileForm"><div class="field"><label>Name</label><input name="name" required placeholder="Full name"></div><div class="field"><label>Team</label><select name="team_id" required>${state.data.teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><div class="notice">Profiles are deliberately simple. Do not put sensitive personal data into KUDOS.</div><div class="actions" style="margin-top:14px"><button class="btn primary" type="submit">Create profile</button><button class="btn ghost" type="button" data-action="closeModal">Cancel</button></div></form></div></div>`;
}

function specialModal(type){
  const p=currentProfile();
  const creator=`${esc(p?.name||'No profile selected')} • ${esc(teamName(p?.team_id))}`;
  if(type==='recognition') return `<div class="modal-backdrop" id="modal"><div class="modal"><h2>Recognise someone</h2>
    <div class="creator-strip"><strong>Submitted by:</strong> ${creator}</div>
    <form id="specialForm" data-type="recognition">
      <div class="field"><label>Who are you nominating?</label><input name="nominated_person" required maxlength="160" placeholder="Enter their name"></div>
      <div class="help" style="margin-top:-8px;margin-bottom:12px">They do not need to be registered in KUDOS.</div>
      <div class="field"><label>Why are you recognising them?</label><textarea name="reason" required maxlength="3000" placeholder="Describe what they did and why it deserves recognition"></textarea></div>
      <button class="btn primary" type="submit">Submit recognition (+20 KUDOS)</button>
    </form></div></div>`;
  if(type==='innovation') return `<div class="modal-backdrop" id="modal"><div class="modal"><h2>Submit an innovation</h2>
    <div class="creator-strip"><strong>Submitted by:</strong> ${creator}</div>
    <form id="specialForm" data-type="innovation">
      <div class="field"><label>Title</label><input name="title" required maxlength="180" placeholder="Short, clear idea"></div>
      <div class="field"><label>Description</label><textarea name="description" required maxlength="4000" placeholder="What could be better and what do you suggest?"></textarea></div>
      <button class="btn primary" type="submit">Submit idea (+20 KUDOS)</button>
    </form></div></div>`;
  return `<div class="modal-backdrop" id="modal"><div class="modal safety-modal"><h2>Report a Flight Safety issue</h2>
    <div class="creator-strip"><strong>Submitted by:</strong> ${creator}</div>
    <div class="safety-warning">Give enough detail for the issue to be understood, but do not enter classified, protectively marked or otherwise security-sensitive information. Use the authorised Flight Safety reporting system where formal occurrence reporting is required.</div>
    <form id="specialForm" data-type="safety">
      <div class="field" style="margin-top:14px"><label>Category</label><input name="category" required maxlength="160" placeholder="e.g. Hazard / good catch / equipment / process"></div>
      <div class="field"><label>Description of the issue</label><textarea name="description" required maxlength="4000" placeholder="Briefly describe what you observed, why it matters and any immediate action taken"></textarea></div>
      <div class="field"><label>External reference <span class="help">optional</span></label><input name="external_reference" maxlength="200" placeholder="Reference from an authorised reporting system, if available"></div>
      <button class="btn safety-btn" type="submit">Submit Flight Safety report (+20 KUDOS)</button>
    </form></div></div>`;
}

function adminLoginModal(){
  return `<div class="modal-backdrop" id="modal"><div class="modal"><h2>Admin / Performance Rep sign in</h2><form id="adminLoginForm"><div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div><button class="btn primary" type="submit">Sign in</button></form></div></div>`;
}
async function submitAdminLogin(fd){
  const email=String(fd.get('email')||'').trim();
  const password=String(fd.get('password')||'');
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) throw error;
  await loadAdminSession();
  if(!state.appUser){
    state.notice='Signed in, but this account has not yet been granted KUDOS admin access.';
  } else {
    state.notice=`Signed in as ${state.appUser.role}.`;
    if(state.appUser.team_id) state.teamFilter=state.appUser.team_id;
  }
  closeModal();
}
async function adminLogout(){
  await supabase.auth.signOut(); state.authUser=null; state.appUser=null; state.notice='Administrator signed out.'; render();
}

function challengeModal(){
  const p=currentProfile(); const teamSelect=(state.mode==='supabase'&&state.appUser?.role==='admin')?`<div class="field"><label>Team</label><select name="team_id" required>${state.data.teams.map(t=>`<option value="${t.id}" ${t.id===adminTeamId()?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>`:''; return `<div class="modal-backdrop" id="modal"><div class="modal"><h2>Create a team challenge</h2><form id="challengeForm">${teamSelect}<div class="grid two"><div class="field"><label>Challenge name</label><input name="title" required placeholder="e.g. Move Together"></div><div class="field"><label>Measure</label><input name="unit" required placeholder="km, pauses, shares..."></div></div><div class="field"><label>Objective</label><textarea name="description" required placeholder="One sentence. If it cannot be explained in one sentence, simplify it."></textarea></div><div class="grid two"><div class="field"><label>Team target</label><input name="target" type="number" min="0" step="any" required></div><div class="field"><label>Source type</label><select name="source_type"><option value="progress">Normal progress</option><option value="recognition">Recognition count</option><option value="innovation">Innovation count</option><option value="safety">Flight Safety count</option></select></div></div><div class="grid two"><div class="field"><label>Start date</label><input name="start_date" type="date" value="${today()}" required></div><div class="field"><label>End date</label><input name="end_date" type="date" required></div></div><div class="field"><label>Performance Shaping Factors</label><div class="psf-grid">${PSFS.map(x=>`<label class="psf"><input type="checkbox" name="psfs" value="${esc(x)}">${esc(x)}</label>`).join('')}</div></div><button class="btn primary" type="submit">Create challenge</button></form></div></div>`;
}

function page(){
  const views={home:homeView,challenges:challengesView,log:()=>logView(),progress:progressView,reports:reportsView,contribute:contributeView,rep:repView};
  return `<div class="app-shell">${header()}<main>${state.notice?`<div class="notice ${state.notice.startsWith('Saved')?'success':''}">${esc(state.notice)}</div>`:''}${views[state.view]()}</main>${nav()}</div>`;
}
function render(extra=''){
  if(!state.data){ document.getElementById('app').innerHTML='<div class="empty">Loading KUDOS…</div>'; return; }
  document.getElementById('app').innerHTML=page()+extra;
  bind();
}
function showModal(html){render(html)}
function closeModal(){render()}


async function submitProfile(fd){
  const name=String(fd.get('name')||'').trim(), team_id=fd.get('team_id');
  if(!name||!team_id) return;
  if(state.mode==='demo'){
    const rec={id:uid('PROF'),name,team_id,role:'user',active:true}; state.data.profiles.push(rec); saveDemo(); state.profileId=rec.id; state.profileFilter=rec.id; state.teamFilter=team_id; localStorage.setItem('kudos_profile',rec.id); state.notice='Saved. Your profile is ready.'; closeModal(); return;
  }
  const {data,error}=await supabase.from('profiles').insert({name,team_id,role:'user',active:true}).select().single(); if(error) throw error; state.profileId=data.id; state.profileFilter=data.id; state.teamFilter=data.team_id; localStorage.setItem('kudos_profile',data.id); state.notice='Saved. Your profile is ready.'; await refresh();
}

async function submitProgress(fd){
  const p=currentProfile(); const record={id:uid('PU'),profile_id:p.id,challenge_id:fd.get('challenge_id'),value:Number(fd.get('value')),date:fd.get('date'),note:fd.get('note')||''};
  if(state.mode==='demo'){state.data.progress.push(record);saveDemo();state.notice='Saved. Your contribution has been added to the team total.';state.view='progress';state.challengeFilter=record.challenge_id;render();return;}
  const {error}=await supabase.from('progress_entries').insert({profile_id:record.profile_id,challenge_id:record.challenge_id,value:record.value,entry_date:record.date,note:record.note}); if(error) throw error; state.notice='Saved. Your contribution has been added to the team total.'; await refresh();
}

async function postDetectedNetlifyForm(formName, values){
  const form=document.querySelector(`form[name="${formName}"]`);
  if(!form) throw new Error(`Netlify form ${formName} was not found in the deployed HTML.`);

  const formData=new FormData(form);
  formData.set('form-name',formName);
  formData.set('bot-field','');
  Object.entries(values||{}).forEach(([key,value])=>formData.set(key,String(value??'')));

  const response=await fetch('/',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(formData).toString()
  });
  if(!response.ok) throw new Error(`${formName} returned HTTP ${response.status}`);
}

async function sendContributionNotification(type,fd,p){
  const common={
    submitted_by:p?.name||'Unknown profile',
    submitter_profile_code:p?.profile_code||'',
    submitter_profile_id:p?.id||'',
    submitter_team:teamName(p?.team_id),
    submission_date:today(),
    site_url:window.location.href
  };

  let specificForm='';
  let specific={...common};
  let subject='';
  let details='';

  if(type==='safety'){
    specificForm='kudos-safety';
    const category=String(fd.get('category')||'');
    const description=String(fd.get('description')||'');
    const ref=String(fd.get('external_reference')||'');
    specific={...specific,category,description,external_reference:ref};
    subject=`Flight Safety — ${category||'Submission'}`;
    details=`Category: ${category}\nDescription: ${description}${ref?`\nExternal reference: ${ref}`:''}`;
  } else if(type==='recognition'){
    specificForm='kudos-recognition';
    const nominee=String(fd.get('nominated_person')||'');
    const reason=String(fd.get('reason')||'');
    specific={...specific,nominated_person:nominee,reason};
    subject=`Recognition — ${nominee||'Nomination'}`;
    details=`Nominated person: ${nominee}\nReason: ${reason}`;
  } else if(type==='innovation'){
    specificForm='kudos-innovation';
    const title=String(fd.get('title')||'');
    const description=String(fd.get('description')||'');
    specific={...specific,title,description};
    subject=`Innovation — ${title||'Idea'}`;
    details=`Title: ${title}\nDescription: ${description}`;
  } else {
    throw new Error('Unknown contribution type.');
  }

  // Keep the structured type-specific record.
  await postDetectedNetlifyForm(specificForm,specific);

  // Also maintain one clean combined feed for all contributions.
  await postDetectedNetlifyForm('kudos-contributions',{
    ...common,
    report_type:type==='safety'?'Flight Safety':type==='recognition'?'Recognition':'Innovation',
    subject,
    details
  });
}

async function submitSpecial(type,fd){
  const p=currentProfile();
  if(!p) throw new Error('Select your KUDOS profile before submitting.');

  if(state.mode==='demo'){
    if(type==='recognition') state.data.recognition.push({id:uid('REC'),submitter_profile_id:p.id,recognised_profile_id:null,nominated_person:fd.get('nominated_person'),reason:fd.get('reason'),date:today(),status:'submitted'});
    if(type==='innovation') state.data.innovation.push({id:uid('INN'),profile_id:p.id,title:fd.get('title'),description:fd.get('description'),date:today(),status:'submitted'});
    if(type==='safety') state.data.safety.push({id:uid('SAFE'),profile_id:p.id,category:fd.get('category'),description:fd.get('description'),external_reference:fd.get('external_reference'),date:today(),status:'submitted'});
    saveDemo();
    try{
      await sendContributionNotification(type,fd,p);
      state.notice='Saved. This contribution is worth 20 KUDOS points and the contribution was submitted to the Netlify contribution feed for email delivery.';
    }catch(err){
      console.error(err);
      state.notice='Saved in KUDOS, but the Netlify contribution record could not be submitted. Please tell a KUDOS administrator.';
    }
    closeModal();return;
  }

  let q;
  if(type==='recognition') q=supabase.from('recognition_entries').insert({
    submitter_profile_id:p.id,
    recognised_profile_id:null,
    nominated_person:String(fd.get('nominated_person')||'').trim(),
    reason:String(fd.get('reason')||'').trim()
  });
  if(type==='innovation') q=supabase.from('innovation_entries').insert({
    profile_id:p.id,
    title:String(fd.get('title')||'').trim(),
    description:String(fd.get('description')||'').trim()
  });
  if(type==='safety') q=supabase.from('safety_entries').insert({
    profile_id:p.id,
    category:String(fd.get('category')||'').trim(),
    description:String(fd.get('description')||'').trim(),
    external_reference:String(fd.get('external_reference')||'').trim()
  });

  const {error}=await q;
  if(error) throw error;

  let emailSubmitted=true;
  try{
    await sendContributionNotification(type,fd,p);
  }catch(err){
    console.error('Contribution saved but Netlify notification failed',err);
    emailSubmitted=false;
  }

  state.notice=emailSubmitted
    ? 'Saved. This contribution is worth 20 KUDOS points and the contribution was submitted to the Netlify contribution feed for email delivery.'
    : 'Saved in KUDOS, but the Netlify contribution record could not be submitted. Please tell a KUDOS administrator.';
  await refresh();
}

async function submitChallenge(fd){
  const p=currentProfile(); const challengeTeam=(state.mode==='supabase'?(state.appUser?.role==='admin'?(fd.get('team_id')||adminTeamId()):state.appUser?.team_id):p.team_id); const rec={id:uid('CH'),code:uid('CH'),team_id:challengeTeam,title:fd.get('title'),description:fd.get('description'),target:Number(fd.get('target')),unit:fd.get('unit'),source_type:fd.get('source_type'),start_date:fd.get('start_date'),end_date:fd.get('end_date'),active:true,psfs:fd.getAll('psfs')};
  if(state.mode==='demo'){state.data.challenges.push(rec);saveDemo();state.notice='Saved. The new challenge is active for your team.';closeModal();return;}
  const {data,error}=await supabase.from('challenges').insert({team_id:rec.team_id,title:rec.title,description:rec.description,target:rec.target,unit:rec.unit,source_type:rec.source_type,start_date:rec.start_date,end_date:rec.end_date,active:true}).select().single(); if(error)throw error;
  if(rec.psfs.length){const {data:psfRows,error:pe}=await supabase.from('psfs').select('id,name').in('name',rec.psfs);if(pe)throw pe;const {error:ce}=await supabase.from('challenge_psfs').insert(psfRows.map(x=>({challenge_id:data.id,psf_id:x.id})));if(ce)throw ce;}
  state.notice='Saved. The new challenge is active for your team.';await refresh();
}


async function deleteAdminEntry(type,id){
  if(state.mode!=='supabase' || !isFullAdmin()) throw new Error('Administrator permission is required.');
  const tables={
    progress:'progress_entries',
    recognition:'recognition_entries',
    innovation:'innovation_entries',
    safety:'safety_entries'
  };
  const table=tables[type];
  if(!table) throw new Error('Unknown entry type.');
  const ok=window.confirm('Remove this entry from KUDOS? This immediately changes challenge totals and scores. Any email already sent cannot be recalled.');
  if(!ok) return;
  const {error}=await supabase.from(table).delete().eq('id',id);
  if(error) throw error;
  state.notice='Entry removed. Challenge progress and KUDOS scores have been recalculated.';
  await refresh();
}

function bind(){
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.notice='';render()});
  document.querySelector('[data-action="profile"]')?.addEventListener('click',()=>showModal(profileModal()));
  document.querySelector('[data-action="closeModal"]')?.addEventListener('click',closeModal);
  document.querySelector('[data-action="newProfile"]')?.addEventListener('click',()=>showModal(newProfileModal()));
  document.querySelector('[data-action="saveProfile"]')?.addEventListener('click',()=>{const v=document.getElementById('profileSelect').value;state.profileId=v;state.profileFilter=v;localStorage.setItem('kudos_profile',v);state.teamFilter=profileById(v)?.team_id||state.teamFilter;closeModal()});
  document.querySelector('[data-action="adminLogin"]')?.addEventListener('click',()=>showModal(adminLoginModal()));
  document.querySelector('[data-action="adminLogout"]')?.addEventListener('click',()=>adminLogout());
  document.querySelector('[data-action="newChallenge"]')?.addEventListener('click',()=>showModal(challengeModal()));
  document.querySelectorAll('[data-log]').forEach(b=>b.onclick=()=>{state.view='log';state.challengeFilter=b.dataset.log;render()});
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{state.view='progress';state.challengeFilter=b.dataset.detail;render()});
  document.querySelectorAll('[data-special]').forEach(b=>b.onclick=()=>showModal(specialModal(b.dataset.special)));
  document.querySelectorAll('[data-delete-entry]').forEach(b=>b.onclick=async()=>{try{await deleteAdminEntry(b.dataset.entryType,b.dataset.deleteEntry)}catch(err){state.notice=`Could not remove entry: ${err.message||err}`;render()}});
  document.getElementById('teamFilter')?.addEventListener('change',e=>{state.teamFilter=e.target.value;render()});
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.progressMode=b.dataset.mode;render()});
  document.getElementById('progressTeam')?.addEventListener('change',e=>{state.teamFilter=e.target.value;const first=state.data.profiles.find(p=>p.team_id===e.target.value);if(first)state.profileFilter=first.id;render()});
  document.getElementById('progressProfile')?.addEventListener('change',e=>{state.profileFilter=e.target.value;render()});
  document.getElementById('progressChallenge')?.addEventListener('change',e=>{state.challengeFilter=e.target.value;render()});
  document.getElementById('reportChallenge')?.addEventListener('change',e=>{state.reportChallengeKey=e.target.value;render()});
  document.getElementById('adminLoginForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await submitAdminLogin(new FormData(e.target))}catch(err){state.notice=`Could not sign in: ${err.message||err}`;render()}});
  document.getElementById('profileForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await submitProfile(new FormData(e.target))}catch(err){state.notice=`Could not save: ${err.message||err}`;render()}});
  document.getElementById('progressForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await submitProgress(new FormData(e.target))}catch(err){state.notice=`Could not save: ${err.message||err}`;render()}});
  document.getElementById('specialForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await submitSpecial(e.target.dataset.type,new FormData(e.target))}catch(err){state.notice=`Could not save: ${err.message||err}`;render()}});
  document.getElementById('challengeForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await submitChallenge(new FormData(e.target))}catch(err){state.notice=`Could not save: ${err.message||err}`;render()}});
  document.getElementById('modal')?.addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
}

if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
refresh();
