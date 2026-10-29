(function engagementApp(){
  'use strict';
  const root=document.getElementById('engagement-root');
  const cfg=window.KUDOS_CONFIG||{};
  const key=cfg.SUPABASE_PUBLISHABLE_KEY||cfg.SUPABASE_ANON_KEY;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n||0).toLocaleString('en-GB',{maximumFractionDigits:1});
  const count=n=>Math.round(Number(n||0)).toLocaleString('en-GB');
  const pct=v=>Number.isFinite(v)?`${(v*100).toFixed(1)}%`:'N/A';
  const pp=n=>`${n>0?'+':''}${n.toFixed(1)} pp`;
  const utc=s=>new Date(`${s}T12:00:00Z`);
  const iso=d=>d.toISOString().slice(0,10);
  const move=(date,n)=>{const d=utc(date);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
  const short=s=>utc(s).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  const windowLabel=s=>`${short(s)} – ${short(move(s,6))}`;
  function endThursday(){
    const ps=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date());
    const p=Object.fromEntries(ps.map(x=>[x.type,x.value]));
    const d=new Date(Date.UTC(+p.year,+p.month-1,+p.day,12));
    const since=(d.getUTCDay()+3)%7;
    d.setUTCDate(d.getUTCDate()-since);
    if(since===0&&+p.hour<6)d.setUTCDate(d.getUTCDate()-7);
    return iso(d);
  }
  let db,data,reportEndValue='',selectedWeek='',fetchedAt=0,busy=false;
  const weeks=()=>[...(data?.weeks||[])].sort((a,b)=>a.week_start.localeCompare(b.week_start));
  const weekly=(week)=>(data?.team_weeks||[]).filter(r=>r.week_start===week);
  const challengeWeekly=(week)=>(data?.challenge_weeks||[]).filter(r=>r.week_start===week);
  const add=(rows,field)=>rows.reduce((n,r)=>n+Number(r[field]||0),0);
  const reach=t=>t&&Number(t.members)>0?Number(t.contributors)/Number(t.members):NaN;
  function ranking(week){
    return weekly(week).map(t=>({...t,rate:reach(t)})).sort((a,b)=>
      (Number.isFinite(b.rate)?b.rate:-1)-(Number.isFinite(a.rate)?a.rate:-1)
      || Number(b.actions)-Number(a.actions)
      || String(a.team_name).localeCompare(String(b.team_name))
    );
  }
  function challengesFor(week,prev){
    const map=new Map();
    for(const [rows,field] of [[challengeWeekly(week),'actions'],[challengeWeekly(prev),'previous']]){
      for(const r of rows){
        const k=r.challenge_key;
        if(!map.has(k))map.set(k,{key:k,title:r.title,unit:r.unit,kind:r.source_type,actions:0,previous:0,people:0,teamRows:[]});
        const c=map.get(k);c[field]+=Number(r.actions||0);
        if(field==='actions'){
          c.people+=Number(r.contributors||0);
          if(Number(r.actions)>0)c.teamRows.push(r);
        }
      }
    }
    return [...map.values()].sort((a,b)=>b.people-a.people||b.actions-a.actions||a.title.localeCompare(b.title));
  }
  function insightsAndAdvice(teamList,challengeList,week,prev){
    const now=weekly(week),before=weekly(prev);
    const oldTeam=new Map(before.map(t=>[t.team_id,t]));
    const movement=teamList.filter(t=>t.members>0).map(t=>({...t,change:(Number.isFinite(t.rate)?t.rate:0)-(Number.isFinite(reach(oldTeam.get(t.team_id)))?reach(oldTeam.get(t.team_id)):0)})).sort((a,b)=>b.change-a.change);
    const top=teamList.find(t=>t.contributors>0&&t.members>0);
    const most=challengeList.find(c=>c.actions>0);
    const panels=[];
    if(top)panels.push({heading:'Highest team reach',body:`${top.team_name}: ${count(top.contributors)} of ${count(top.members)} members engaged (${pct(top.rate)}).`});
    if(movement[0]?.change>0)panels.push({heading:'Strongest improvement',body:`${movement[0].team_name} increased participation by ${pp(movement[0].change*100)}.`});
    if(most)panels.push({heading:'Most popular challenge',body:`${most.title}: ${count(most.people)} people and ${count(most.actions)} logged actions across ${most.teamRows.length} teams.`});
    panels.push({heading:'The activity mix',body:`${count(add(now,'progress_actions'))} challenge logs · ${count(add(now,'recognition_actions'))} recognition · ${count(add(now,'innovation_actions'))} ideas · ${count(add(now,'safety_actions'))} safety submissions.`});
    const suggestions=[];
    const suggest=(heading,body)=>{if(suggestions.length<3)suggestions.push({heading,body});};
    const falling=[...movement].reverse().find(t=>t.change<-.08);
    if(falling)suggest('Rebuild participation',`${falling.team_name} participation fell ${Math.abs(falling.change*100).toFixed(1)} percentage points. Ask its Rep to run a brief team check-in and invite someone new to log an action.`);
    const quiet=[...teamList].filter(t=>t.members>0&&t.rate<.25).sort((a,b)=>a.rate-b.rate)[0];
    if(quiet)suggest('Widen involvement',`${quiet.team_name} engaged ${quiet.contributors} of ${quiet.members} members. Set a simple one-action goal and demonstrate how to record it.`);
    const dormant=challengeList.find(c=>c.actions===0&&c.previous>0);
    if(dormant)suggest('Restart a dormant challenge',`${dormant.title} had ${dormant.previous} actions last week but none this week. Give Reps a concrete example of a qualifying entry.`);
    const recognition=add(now,'recognition_actions');
    if(recognition<Math.max(2,Math.ceil((data?.teams||[]).length/2)))
      suggest('Make recognition routine',`Only ${recognition} recognition entries were recorded. Invite each team to recognise someone during its weekly brief.`);
    const innovation=add(now,'innovation_actions');
    if(innovation<Math.max(2,Math.ceil((data?.teams||[]).length/2)))
      suggest('Prompt improvement ideas',`Only ${innovation} innovation submissions were recorded. Ask each team for one small way to remove friction.`);
    if(suggestions.length<3&&add(now,'actions')<add(before,'actions'))
      suggest('Recover logging momentum',`Logged activity fell from ${add(before,'actions')} to ${add(now,'actions')} actions. Send Reps a midweek reminder and share a simple example.`);
    if(top&&suggestions.length<3)suggest('Copy the strongest habit',`${top.team_name} leads on participation. Ask its Rep to share one practice that other teams could trial.`);
    if(suggestions.length<3)suggest('Grow challenge variety',`${challengeList.filter(c=>c.actions>0).length} challenges recorded activity. Encourage teams to try one additional challenge type next week.`);
    return {panels:panels.slice(0,4),suggestions:suggestions.slice(0,3)};
  }
  function failure(message){
    root.innerHTML=`<section class="error-box"><h1>Weekly engagement</h1><p>${esc(message)}</p><a class="btn primary" href="./">Back to KUDOS</a></section>`;
  }
  function display(){
    if(!data)return;
    const list=weeks();
    if(!list.some(x=>x.week_start===selectedWeek))selectedWeek=list.at(-1)?.week_start;
    const previous=move(selectedWeek,-7),now=weekly(selectedWeek),before=weekly(previous);
    const teamList=ranking(selectedWeek),challengeList=challengesFor(selectedWeek,previous);
    const active=add(now,'members'),people=add(now,'contributors'),actions=add(now,'actions');
    const prevPeople=add(before,'contributors'),prevActions=add(before,'actions');
    const activeTeams=now.filter(x=>x.actions>0).length,activeChallenges=challengeList.filter(x=>x.actions>0).length;
    const {panels,suggestions}=insightsAndAdvice(teamList,challengeList,selectedWeek,previous);
    const maxActions=Math.max(1,...list.map(w=>add(weekly(w.week_start),'actions')));
    const trend=list.map(w=>{
      const rows=weekly(w.week_start),people=add(rows,'contributors'),eligible=add(rows,'members'),acts=add(rows,'actions');
      const rate=eligible?people/eligible:0;
      return `<div class="pulse-week ${selectedWeek===w.week_start?'chosen':''}" title="${esc(windowLabel(w.week_start))}: ${people} people, ${acts} actions">
        <strong>${pct(rate)}</strong><div class="bars"><i style="height:${Math.max(2,rate*100)}%"></i><i class="actions" style="height:${Math.max(2,acts/maxActions*100)}%"></i></div><small>${short(w.week_start)}</small></div>`;
    }).join('');
    const prevTeam=new Map(before.map(t=>[t.team_id,t]));
    const teams=teamList.map((t,i)=>{
      const old=reach(prevTeam.get(t.team_id));
      const change=Number.isFinite(t.rate)&&Number.isFinite(old)?pp((t.rate-old)*100):'n/a';
      return `<div class="team ${i===0&&t.contributors?'winner':''}">
        <b class="rank">${i+1}</b><div><strong>${esc(t.team_name)}</strong>
          <small>${count(t.contributors)}/${count(t.members)} people · ${count(t.actions)} actions · ${esc(change)} WoW</small>
          <div class="track"><span style="width:${Math.max(0,Math.min(100,(t.rate||0)*100))}%"></span></div>
        </div><b class="team-rate">${pct(t.rate)}</b></div>`;
    }).join('');
    const maxPeople=Math.max(1,...challengeList.map(c=>c.people));
    const challenges=challengeList.map(c=>{
      const lead=[...c.teamRows].sort((a,b)=>b.contributors-a.contributors||b.actions-a.actions)[0];
      const leadName=(data.teams||[]).find(t=>t.team_id===lead?.team_id)?.team_name||'—';
      const change=c.actions-c.previous;
      return `<tr><td><strong>${esc(c.title)}</strong><small>${esc(c.kind)} · ${esc(c.unit||'submissions')}</small></td>
        <td class="numeric">${count(c.people)}<div class="subtrack"><span style="width:${c.people/maxPeople*100}%"></span></div></td>
        <td class="numeric">${count(c.actions)}</td><td class="numeric">${change>0?'+':''}${count(change)}</td><td>${esc(leadName)}</td></tr>`;
    }).join('');
    const story=panels.map(p=>`<div class="insight"><b>${esc(p.heading)}</b><span>${esc(p.body)}</span></div>`).join('');
    const actionsHtml=suggestions.map((s,i)=>`<div class="suggestion"><b>${i+1}. ${esc(s.heading)}</b><p>${esc(s.body)}</p></div>`).join('');
    const checked=new Date(data.generated_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'});
    root.innerHTML=`<main class="wall">
      <header class="top">
        <div><div class="brand">KUDOS / HUMAN PERFORMANCE</div><h1>Weekly engagement</h1>
          <p class="muted">${esc(windowLabel(selectedWeek))} · Thursday–Wednesday · Weekly leadership brief</p></div>
        <div class="controls"><label>Report week <select id="week">${[...list].reverse().map(w=>`<option value="${w.week_start}" ${selectedWeek===w.week_start?'selected':''}>${esc(windowLabel(w.week_start))}</option>`).join('')}</select></label>
          <button id="refresh" class="btn">↻ Refresh</button><button id="present" class="btn primary">⛶ Present</button>
          <a class="btn back" href="./">Back to KUDOS</a></div>
      </header><p class="checked" id="report-status">Checked ${esc(checked)} UK · Latest report is the last complete Thu–Wed week</p>
      <div class="kpis">
        <section class="kpi"><span>People engaged</span><b>${count(people)} <small>/ ${count(active)}</small></b><p>${pct(active?people/active:NaN)} of active profiles · ${people-prevPeople>0?'+':''}${count(people-prevPeople)} people WoW</p></section>
        <section class="kpi"><span>Logged actions</span><b>${count(actions)}</b><p>${actions-prevActions>0?'+':''}${count(actions-prevActions)} vs previous week</p></section>
        <section class="kpi"><span>Teams taking part</span><b>${count(activeTeams)} <small>/ ${data.teams.length}</small></b><p>At least one recorded action</p></section>
        <section class="kpi"><span>Challenges activated</span><b>${count(activeChallenges)}</b><p>Challenges with contributions</p></section>
      </div>
      <div class="upper">
        <section class="panel"><header><div><label>MOMENTUM</label><h2>Week-on-week participation</h2></div><small>Eight completed reporting weeks</small></header>
          <div class="pulse">${trend}</div><p class="legend"><span>■ Participation % of active profiles</span><span>■ Logged actions (relative scale)</span></p></section>
        <section class="panel"><header><div><label>LEADERBOARD</label><h2>Top performing teams</h2></div><small>Ranked by participation rate</small></header>
          <div class="teams">${teams||'<p>No activity recorded.</p>'}</div></section>
      </div>
      <div class="lower">
        <section class="panel"><header><div><label>CHALLENGE ENGAGEMENT</label><h2>Where people contributed</h2></div><small>All challenges · vs previous week</small></header>
          <div class="scroll"><table><thead><tr><th>Challenge</th><th class="numeric">People</th><th class="numeric">Actions</th><th class="numeric">WoW actions</th><th>Leading team</th></tr></thead>
            <tbody>${challenges||'<tr><td colspan="5">No challenge records.</td></tr>'}</tbody></table></div></section>
        <section class="panel"><header><div><label>WORTH NOTICING</label><h2>The story behind the numbers</h2></div></header>
          <div class="insights">${story}</div></section>
      </div>
      <section class="panel next"><header><div><label>NEXT WEEK</label><h2>Three actions to improve engagement</h2></div><small>Based on this week’s figures</small></header>
        <div class="suggestions">${actionsHtml}</div></section>
      <footer>Participation = distinct active profiles logging ≥1 action ÷ current active profiles. Each progress log, Recognition, Innovation or Safety submission counts as one action; kg/km totals are not combined. No individual names are shown.
      <span>Weeks close Wednesday 23:59 UK · New report available Thursday at 06:00 UK · Rechecks automatically while displayed</span></footer>
      </main>`;
    document.getElementById('week').onchange=e=>{selectedWeek=e.target.value;display()};
    document.getElementById('refresh').onclick=()=>refresh(true);
    document.getElementById('present').onclick=async()=>{
      try{
        if(document.fullscreenElement)await document.exitFullscreen();
        else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      }catch(e){console.warn('Fullscreen unavailable',e);}
    };
  }
  async function refresh(manual=false){
    if(busy)return;busy=true;
    const button=document.getElementById('refresh');if(button)button.disabled=true;
    try{
      const period=endThursday();
      const {data:result,error}=await db.rpc('kudos_engagement_report',{p_report_end:period,p_weeks:8});
      if(error)throw error;
      if(!result?.teams||!result?.weeks||!result?.team_weeks||!result?.challenge_weeks)throw Error('No report data returned');
      if(reportEndValue!==period)selectedWeek='';
      reportEndValue=period;data=result;fetchedAt=Date.now();
      display();
      if(manual){const s=document.getElementById('report-status');if(s)s.textContent+=' · Refreshed';}
    }catch(error){
      if(!data)failure(`Unable to load the administrator report: ${error.message||error}`);
      else{
        const s=document.getElementById('report-status');
        if(s){s.classList.add('error');s.textContent=`Refresh failed: ${error.message||error}`;}
      }
    }finally{busy=false;if(button)button.disabled=false;}
  }
  async function start(){
    if(!cfg.SUPABASE_URL||!key||!window.supabase?.createClient){failure('Live KUDOS connection unavailable.');return;}
    db=window.supabase.createClient(cfg.SUPABASE_URL,key);
    try{
      const {data:auth,error}=await db.auth.getUser();
      if(error||!auth?.user){failure('Sign in as a Workspace Admin from the main KUDOS app first.');return;}
      await refresh();
      const check=()=>{
        if(!document.hidden&&(reportEndValue!==endThursday()||Date.now()-fetchedAt>30*60*1000))refresh();
      };
      document.addEventListener('visibilitychange',check);
      setInterval(check,60000);
      document.addEventListener('fullscreenchange',()=>{
        document.documentElement.classList.toggle('is-presenting',!!document.fullscreenElement);
        const b=document.getElementById('present');
        if(b)b.textContent=document.fullscreenElement?'Exit full screen':'⛶ Present';
      });
    }catch(e){failure(`Unable to verify administrator access: ${e.message||e}`);}
  }
  start();
})();