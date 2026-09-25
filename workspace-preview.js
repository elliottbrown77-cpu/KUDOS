async function loadWorkspace(slug){
  const cfg=window.KUDOS_CONFIG||{};
  const key=cfg.SUPABASE_PUBLISHABLE_KEY||cfg.SUPABASE_ANON_KEY||'';
  if(!window.supabase||!cfg.SUPABASE_URL||!key) throw new Error('KUDOS data connection is unavailable.');
  const client=window.supabase.createClient(cfg.SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client
    .from('workspaces')
    .select('id,slug,name,description,branding,terminology,features,scoring_config,active,preview_enabled')
    .eq('slug',slug)
    .maybeSingle();
  if(error) throw error;
  return data;
}

const esc=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-GB',{maximumFractionDigits:1});
const pct=n=>`${(Number(n||0)*100).toFixed(0)}%`;

function previewData(){
  return {
    group:'NSN Preview Group',
    member:'Preview Member',
    score:122,
    groupScore:680,
    activities:[
      {title:'Walk Together',description:'Support each other to build more movement into everyday life through a shared steps challenge.',actual:185000,target:500000,unit:'steps',mine:32000},
      {title:'Move for Wellbeing',description:'Count purposeful activity sessions such as walking, running, cycling, swimming or strength work.',actual:42,target:100,unit:'sessions',mine:8},
      {title:'Recovery Nights',description:'Encourage healthy recovery habits by logging nights when personal rest goals are achieved.',actual:58,target:120,unit:'nights',mine:11}
    ],
    people:[
      {name:'Preview Member',group:'NSN Preview Group',score:122},
      {name:'Example Member 2',group:'NSN Preview Group',score:108},
      {name:'Example Member 3',group:'NSN Preview Group',score:94}
    ]
  };
}

function injectStyle(ws){
  const b=ws.branding||{};
  const primary=b.primary_colour||'#00163B';
  const bg=b.background_colour||'#F6F8FA';
  const surface=b.surface_colour||'#FFFFFF';
  const soft=b.muted_surface||'#EEF2F5';
  const accent=b.accent_colour||'#DCE6EE';
  const style=document.createElement('style');
  style.id='kudos-workspace-preview-style';
  style.textContent=`
    :root{--nsn-primary:${primary};--nsn-bg:${bg};--nsn-surface:${surface};--nsn-soft:${soft};--nsn-accent:${accent}}
    html,body{background:var(--nsn-bg);color:var(--nsn-primary)}
    #app{min-height:100vh}
    .nsn-shell{min-height:100vh;padding-bottom:96px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
    .nsn-topbar{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #dbe2e8;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px}
    .nsn-brand{display:flex;align-items:center;gap:12px;min-width:0}.nsn-brand img{width:min(410px,48vw);height:54px;object-fit:contain;object-position:left center}.nsn-powered{font-size:10px;font-weight:800;letter-spacing:.09em;white-space:nowrap}
    .nsn-chip{border:1px solid #d3dde5;background:var(--nsn-soft);color:var(--nsn-primary);border-radius:999px;padding:8px 12px;font-weight:700;font-size:12px}
    .nsn-main{max-width:1120px;margin:0 auto;padding:18px 16px 42px}
    .nsn-preview-banner{background:#eef5fa;border:1px solid #cfdce7;color:var(--nsn-primary);padding:11px 14px;border-radius:13px;margin-bottom:16px;font-size:13px}
    .nsn-hero{background:#fff;border:1px solid #dbe2e8;border-radius:26px;padding:28px;min-height:280px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:30px;align-items:center;box-shadow:0 12px 30px rgba(0,22,59,.08)}
    .nsn-hero-copy small{font-weight:900;letter-spacing:.13em}.nsn-hero h1{font-size:clamp(38px,7vw,68px);line-height:.96;letter-spacing:-.045em;margin:12px 0;color:var(--nsn-primary)}.nsn-hero p{max-width:650px;color:#506174;font-size:16px;line-height:1.55}.nsn-hero-mark{width:100%;max-height:250px;object-fit:contain}
    .nsn-strap{display:inline-flex;background:var(--nsn-primary);color:#fff;border-radius:999px;padding:9px 13px;font-weight:800;font-size:11px;letter-spacing:.08em;margin-top:8px}
    .nsn-section{display:flex;align-items:end;justify-content:space-between;margin:28px 0 12px;gap:12px}.nsn-section h2{margin:0;font-size:24px}.nsn-section p{margin:0;color:#667789;font-size:13px}
    .nsn-grid{display:grid;gap:14px}.nsn-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.nsn-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
    .nsn-card{background:#fff;border:1px solid #dbe2e8;border-radius:18px;padding:18px;box-shadow:0 7px 22px rgba(0,22,59,.045)}.nsn-card h3{margin:0 0 7px}.nsn-label{font-size:11px;color:#68798a;text-transform:uppercase;letter-spacing:.06em;font-weight:800}.nsn-value{font-size:32px;font-weight:900;margin-top:5px}.nsn-sub{font-size:12px;color:#68798a;margin-top:3px}
    .nsn-progress{height:11px;border-radius:99px;background:#e7edf2;overflow:hidden;margin:15px 0 8px}.nsn-progress span{display:block;height:100%;background:var(--nsn-primary);border-radius:99px}.nsn-line{display:flex;justify-content:space-between;gap:12px;color:#657687;font-size:12px}.nsn-line strong{color:var(--nsn-primary)}
    .nsn-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.nsn-action{display:flex;flex-direction:column;min-height:190px}.nsn-action-icon{width:42px;height:42px;border-radius:13px;background:var(--nsn-soft);display:grid;place-items:center;font-size:20px;font-weight:900}.nsn-btn{border:0;background:var(--nsn-primary);color:#fff;border-radius:12px;padding:11px 14px;font-weight:800;margin-top:auto;cursor:pointer}.nsn-btn.secondary{background:var(--nsn-soft);color:var(--nsn-primary)}
    .nsn-nav{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(760px,calc(100% - 20px));display:grid;grid-template-columns:repeat(7,1fr);gap:5px;background:var(--nsn-primary);padding:8px;border-radius:22px;box-shadow:0 12px 30px rgba(0,22,59,.24);z-index:50}.nsn-nav button{border:0;background:transparent;color:#b9c6d1;border-radius:14px;padding:9px 4px;font-size:10px;font-weight:800}.nsn-nav button b{display:block;font-size:18px}.nsn-nav button.active{background:#fff;color:var(--nsn-primary)}
    .nsn-table{overflow:auto;border:1px solid #dbe2e8;border-radius:16px;background:#fff}.nsn-table table{border-collapse:collapse;width:100%;min-width:600px}.nsn-table th,.nsn-table td{padding:12px;border-bottom:1px solid #e8edf1;text-align:left;font-size:12px}.nsn-table th{background:var(--nsn-primary);color:#fff}.nsn-table tr:last-child td{border-bottom:0}
    .nsn-form{display:grid;gap:12px}.nsn-field label{display:block;font-size:12px;font-weight:800;margin-bottom:6px}.nsn-field input,.nsn-field select,.nsn-field textarea{width:100%;border:1px solid #ccd7e0;background:#fff;border-radius:12px;padding:12px;color:var(--nsn-primary)}.nsn-field textarea{min-height:105px}
    @media(max-width:800px){.nsn-hero{grid-template-columns:1fr}.nsn-hero-mark{display:none}.nsn-grid.four,.nsn-grid.two{grid-template-columns:1fr 1fr}.nsn-brand img{width:min(310px,60vw)}}
    @media(max-width:520px){.nsn-grid.four,.nsn-grid.two,.nsn-actions{grid-template-columns:1fr}.nsn-main{padding-left:10px;padding-right:10px}.nsn-brand img{content:url('nsn-mark.svg?v=1');width:46px;height:46px}.nsn-powered{display:none}.nsn-nav button{font-size:8px;padding:7px 1px}.nsn-nav button b{font-size:16px}.nsn-hero{padding:22px}.nsn-hero h1{font-size:42px}}
  `;
  document.head.appendChild(style);
}

function cardActivity(a){
  const completion=Math.min(a.actual/a.target,1);
  return `<article class="nsn-card"><h3>${esc(a.title)}</h3><div class="nsn-sub">${esc(a.description)}</div><div class="nsn-progress"><span style="width:${completion*100}%"></span></div><div class="nsn-line"><span>Group: <strong>${fmt(a.actual)} / ${fmt(a.target)} ${esc(a.unit)}</strong></span><span>${pct(completion)}</span></div></article>`;
}

function screenHome(ws,d){
  return `<section class="nsn-hero"><div class="nsn-hero-copy"><small>POWERED BY KUDOS</small><h1>Support. Move.<br>Thrive.</h1><p>A shared space for women across the Naval Service to support each other, take part in healthy lifestyle challenges and celebrate progress together.</p><span class="nsn-strap">SUPPORT • CHALLENGE • THRIVE</span></div><img class="nsn-hero-mark" src="nsn-mark.svg?v=1" alt="NSN mark"></section>
  <div class="nsn-section"><h2>${esc(d.group)} overview</h2><p>Illustrative NSN workspace data</p></div>
  <div class="nsn-grid four"><div class="nsn-card"><div class="nsn-label">My KUDOS score</div><div class="nsn-value">${d.score}</div><div class="nsn-sub">Recognition, ideas and challenge contribution</div></div><div class="nsn-card"><div class="nsn-label">Group KUDOS score</div><div class="nsn-value">${d.groupScore}</div><div class="nsn-sub">Combined member contribution</div></div><div class="nsn-card"><div class="nsn-label">Challenge completion</div><div class="nsn-value">36%</div><div class="nsn-sub">Average progress across activities</div></div><div class="nsn-card"><div class="nsn-label">Active challenges</div><div class="nsn-value">${d.activities.length}</div><div class="nsn-sub">Current network activity portfolio</div></div></div>
  <div class="nsn-section"><h2>Make a contribution</h2><p>Recognition • Ideas</p></div>
  <div class="nsn-actions"><div class="nsn-card nsn-action"><div class="nsn-action-icon">★</div><h3>Recognise someone</h3><p class="nsn-sub">Celebrate someone who has supported, encouraged or inspired others.</p><button class="nsn-btn" data-preview-action>Submit recognition</button></div><div class="nsn-card nsn-action"><div class="nsn-action-icon">↗</div><h3>Share an idea</h3><p class="nsn-sub">Suggest a new wellbeing challenge, support idea or improvement for the network.</p><button class="nsn-btn" data-preview-action>Submit idea</button></div></div>
  <div class="nsn-section"><h2>Current challenges</h2><p>${d.activities.length} active</p></div><div class="nsn-grid two">${d.activities.map(cardActivity).join('')}</div>`;
}

function screenActivities(ws,d){
  return `<div class="nsn-section"><h2>Group challenges</h2><p>Current challenges and measurable network goals</p></div><div class="nsn-card"><div class="nsn-field"><label>Group</label><select disabled><option>${esc(d.group)}</option></select></div></div><div class="nsn-section"><h2>${esc(d.group)}</h2><p>${d.activities.length} active challenges</p></div><div class="nsn-grid two">${d.activities.map(cardActivity).join('')}</div>`;
}

function screenProgress(ws,d){
  return `<div class="nsn-section"><h2>Progress</h2><p>Group targets and individual contribution</p></div><div class="nsn-card"><div class="nsn-grid two"><div class="nsn-field"><label>Group</label><select disabled><option>${esc(d.group)}</option></select></div><div class="nsn-field"><label>Person</label><select disabled><option>${esc(d.member)}</option></select></div></div></div><div class="nsn-section"><h2>All challenges</h2><p>Comparable by percentage complete</p></div><div class="nsn-grid two">${d.activities.map(a=>`<div class="nsn-card"><h3>${esc(a.title)}</h3><div class="nsn-progress"><span style="width:${Math.min(a.actual/a.target,1)*100}%"></span></div><div class="nsn-line"><span>Group: <strong>${fmt(a.actual)} / ${fmt(a.target)} ${esc(a.unit)}</strong></span><span>Selected person: <strong>${fmt(a.mine)}</strong></span></div></div>`).join('')}</div>`;
}

function screenReports(ws,d){
  const rows=d.people.map((p,i)=>`<tr><td><strong>${i+1}</strong></td><td><strong>${esc(p.name)}</strong><div class="nsn-sub">${esc(p.group)}</div></td><td><strong>${fmt(p.score)}</strong></td></tr>`).join('');
  return `<div class="nsn-section"><h2>Reports</h2><p>Participation, recognition, ideas and challenge participation</p></div><div class="nsn-grid two"><div class="nsn-card"><h3>Network reporting</h3><p class="nsn-sub">NSN reporting can focus on healthy lifestyle challenge participation, recognition, ideas and group engagement without CHF-specific measures.</p></div><div class="nsn-card"><h3>Current challenge portfolio</h3><div class="nsn-value">${d.activities.length}</div><div class="nsn-sub">Illustrative active challenges</div></div></div><div class="nsn-section"><h2>Top KUDOS contributions</h2><p>Illustrative preview</p></div><div class="nsn-table"><table><thead><tr><th>Rank</th><th>Member</th><th>KUDOS</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function screenContribute(ws,d){
  return `<div class="nsn-section"><h2>Contribute</h2><p>Recognition and ideas</p></div><div class="nsn-actions"><div class="nsn-card nsn-action"><div class="nsn-action-icon">★</div><h3>Recognition</h3><p class="nsn-sub">Recognise someone for their contribution to the network, its members or its activities.</p><button class="nsn-btn" data-preview-action>Submit recognition</button></div><div class="nsn-card nsn-action"><div class="nsn-action-icon">↗</div><h3>Ideas</h3><p class="nsn-sub">Ideas could include new healthy lifestyle challenges, peer support, wellbeing events, communications or ways to make participation easier.</p><button class="nsn-btn" data-preview-action>Submit idea</button></div></div><div class="nsn-preview-banner" style="margin-top:16px">Flight Safety and CHF Performance Shaping Factors are disabled for the NSN workspace by configuration.</div>`;
}

function screenLead(ws,d){
  return `<div class="nsn-section"><h2>Group Lead / NSN Admin</h2><p>Scoped workspace administration</p></div><div class="nsn-grid two"><div class="nsn-card"><h3>Group Lead</h3><p class="nsn-sub">Manage your group, moderate entries, create permitted healthy lifestyle challenges and view group reporting.</p><button class="nsn-btn secondary" data-preview-action>Preview controls</button></div><div class="nsn-card"><h3>NSN Admin</h3><p class="nsn-sub">Manage groups, Group Leads, activity definitions, contribution categories, workspace branding and network-wide reporting.</p><button class="nsn-btn secondary" data-preview-action>Preview controls</button></div></div>`;
}

function renderPreview(ws){
  const d=previewData();
  let view='home';
  const app=document.getElementById('app');
  const t=ws.terminology||{};
  const nav=[['home','⌂','Home'],['activities','◎',t.challenges||'Activities'],['progress','↗','Progress'],['reports','▥','Reports'],['contribute','★','Contribute'],['lead','⚙',t.rep||'Group Lead']];
  const draw=()=>{
    const body=view==='home'?screenHome(ws,d):view==='activities'?screenActivities(ws,d):view==='progress'?screenProgress(ws,d):view==='reports'?screenReports(ws,d):view==='contribute'?screenContribute(ws,d):screenLead(ws,d);
    app.innerHTML=`<div class="nsn-shell"><header class="nsn-topbar"><div class="nsn-brand"><img src="nsn-logo.svg?v=1" alt="Naval Servicewomen's Network"><span class="nsn-powered">POWERED BY KUDOS</span></div><div class="nsn-chip">${esc(d.member)}</div></header><main class="nsn-main"><div class="nsn-preview-banner"><strong>NSN workspace preview</strong> — branding, terminology and enabled modules are loaded from the draft NSN configuration. The data shown here is illustrative and no CHF records are loaded.</div>${body}</main><nav class="nsn-nav">${nav.map(([id,icon,label])=>`<button data-nsn-view="${id}" class="${view===id?'active':''}"><b>${icon}</b>${esc(label)}</button>`).join('')}</nav></div>`;
    app.querySelectorAll('[data-nsn-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.nsnView;draw();window.scrollTo({top:0,behavior:'smooth'});}));
    app.querySelectorAll('[data-preview-action]').forEach(btn=>btn.addEventListener('click',()=>alert('NSN preview only — no data will be submitted.')));
  };
  draw();
}

window.KUDOS_WORKSPACE_PREVIEW = async function(){
  const params=new URLSearchParams(window.location.search);
  const slug=params.get('workspace')||'';
  const preview=params.get('preview')==='1';
  if(!slug || slug==='chf-performance' || !preview) return false;
  if(slug!=='naval-servicewomens-network') return false;
  try{
    const ws=await loadWorkspace(slug);
    if(!ws || !ws.preview_enabled) return false;
    injectStyle(ws);
    document.documentElement.dataset.workspace=ws.slug;
    document.title=`KUDOS | ${ws.name} Preview`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',ws.branding?.primary_colour||'#00163B');
    renderPreview(ws);
    return true;
  }catch(err){
    console.error('KUDOS workspace preview failed',err);
    return false;
  }
};