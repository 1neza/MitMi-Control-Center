const AGENT_URL='./data/agents.json';
const PROJECT_URL='./data/project.json';

const state={agents:[],events:[],project:{},filter:'all',charts:[]};
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

function parseDate(value){
  if(!value)return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date;
}

function relativeTime(value){
  const date=parseDate(value);
  if(!date)return '—';
  const diff=Math.max(0,Date.now()-date.getTime());
  const minutes=Math.floor(diff/60000);
  if(minutes<1)return 'just now';
  if(minutes<60)return minutes+'m ago';
  const hours=Math.floor(minutes/60);
  if(hours<24)return hours+'h ago';
  const days=Math.floor(hours/24);
  if(days<7)return days+'d ago';
  return date.toLocaleDateString();
}

function initials(name='Agent'){
  return name.replace(/^MitMi\s+/,'').split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'A';
}

function statusClass(status){
  return ['working','success','blocked','idle'].includes(status)?status:'idle';
}

function eventClass(type){
  return ['working','success','blocked'].includes(type)?type:'idle';
}

function collectEvents(agents){
  return agents.flatMap(agent=>(agent.activity||[]).map(event=>({
    ...event,
    agent:agent.name,
    agentId:agent.id,
    role:agent.role
  }))).sort((a,b)=>(parseDate(b.at)?.getTime()||0)-(parseDate(a.at)?.getTime()||0));
}

function agentIsBlocked(agent){
  return agent.status==='blocked'||Boolean(agent.blocker);
}

function showToast(message){
  const toast=$('#toast');
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600);
}

async function copyText(text){
  if(!text)return false;
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch{
    const box=document.createElement('textarea');
    box.value=text;
    box.style.position='fixed';
    box.style.opacity='0';
    document.body.appendChild(box);
    box.select();
    const ok=document.execCommand('copy');
    box.remove();
    return ok;
  }
}

function metricCard(title,value,foot,tone=''){
  return '<article class="metric-card">'+
    '<span class="metric-title">'+esc(title)+'</span>'+
    '<strong class="metric-value">'+esc(value)+'</strong>'+
    '<span class="metric-foot '+tone+'">'+esc(foot)+'</span>'+
  '</article>';
}

function renderProject(){
  const project=state.project||{};
  const ci=project.ci||{};
  const latest=ci.latestConclusion||'unknown';
  const health=$('#projectHealthBadge');
  health.textContent=latest==='success'?'Healthy':latest==='failure'?'CI failing':'Monitoring';
  health.className='health-badge '+(latest==='success'?'good':latest==='failure'?'bad':'neutral');

  $('#branchBadge').textContent=project.branch||'agent-dev';
  $('#projectTitle').textContent=project.milestone||'MitMi development pulse';

  const head=(project.head||'').slice(0,8)||'unknown';
  const run=ci.latestRun?'CI #'+ci.latestRun:'CI status unknown';
  $('#projectMeta').textContent='Private source · '+(project.branch||'agent-dev')+' · head '+head+' · '+run+' '+(latest||'');
  $('#projectLatestCommit').textContent=project.latestCommit||'No commit snapshot available';

  const blocker=ci.latestFailure||(
    state.agents.find(agent=>agentIsBlocked(agent))?.blocker
  )||'No active project-level blocker reported.';
  $('#projectBlocker').textContent=blocker;
  $('#projectBlockerWrap').style.display=blocker?'block':'none';

  const synced=parseDate(project.syncedAt);
  const stale=synced?Date.now()-synced.getTime()>20*60*1000:true;
  const sync=$('#syncStatus');
  sync.classList.toggle('stale',stale);
  sync.classList.remove('error');
  $('#syncLabel').textContent=(stale?'Snapshot ':'Synced ')+relativeTime(project.syncedAt);
  $('#footerSync').textContent='Source snapshot '+relativeTime(project.syncedAt)+' · sanitized telemetry only';
}

function renderMetrics(){
  const agents=state.agents;
  const events=state.events;
  const ci=state.project.ci||{};
  const active=agents.filter(agent=>agent.status==='working').length;
  const blockers=agents.filter(agentIsBlocked).length;
  const rate=Number(ci.successRate||0);
  const since=Date.now()-24*60*60*1000;
  const dayEvents=events.filter(event=>(parseDate(event.at)?.getTime()||0)>=since).length;

  $('#metricGrid').innerHTML=[
    metricCard('Agents working',active,active===1?'1 lane currently executing':active+' lanes currently executing',active?'good':''),
    metricCard('Open blockers',blockers,blockers?'Requires attention':'No explicit blockers',blockers?'bad':'good'),
    metricCard('CI success rate',rate?rate.toFixed(1)+'%':'—',(ci.history?.length||0)+' recent builds',rate>=80?'good':rate?'bad':''),
    metricCard('Activity · 24h',dayEvents,events.length+' total recorded events')
  ].join('');
}

function agentMatchesFilter(agent){
  if(state.filter==='all')return true;
  if(state.filter==='blocked')return agentIsBlocked(agent);
  return agent.status===state.filter;
}

function renderAgents(){
  const visible=state.agents.filter(agentMatchesFilter);
  $('#agentGrid').innerHTML=visible.length?visible.map(agent=>{
    const status=agentIsBlocked(agent)?'blocked':statusClass(agent.status);
    const label=agentIsBlocked(agent)&&agent.status!=='blocked'?'working · blocked':status;
    return '<button class="agent-card" type="button" data-agent-id="'+esc(agent.id)+'" aria-label="Open '+esc(agent.name)+' details">'+
      '<div class="agent-card-head">'+
        '<div class="agent-identity">'+
          '<span class="agent-avatar">'+esc(initials(agent.name))+'</span>'+
          '<div><strong>'+esc(agent.name)+'</strong><span>'+esc(agent.role||'Agent')+'</span></div>'+
        '</div>'+
        '<span class="agent-status"><i class="agent-status-dot '+status+'"></i>'+esc(label)+'</span>'+
      '</div>'+
      '<p class="agent-task">'+esc(agent.currentTask||'No current task reported.')+'</p>'+
      '<div class="agent-card-foot"><span>Updated '+esc(relativeTime(agent.updatedAt))+'</span><strong>View details →</strong></div>'+
    '</button>';
  }).join(''):'<div class="empty-card">No agents match this filter.</div>';

  $$('.agent-card').forEach(card=>card.addEventListener('click',()=>openAgentDrawer(card.dataset.agentId)));
}

function renderBlockers(){
  const blockers=state.agents.filter(agentIsBlocked);
  $('#blockerCount').textContent=blockers.length;
  $('#blockerList').innerHTML=blockers.length?blockers.map((agent,index)=>{
    const severity=index===0?'critical':'high';
    return '<div class="list-item">'+
      '<div class="list-item-top"><span class="severity '+severity+'">'+severity+'</span><span class="list-meta">'+esc(relativeTime(agent.updatedAt))+'</span></div>'+
      '<strong>'+esc(agent.name)+'</strong>'+
      '<p>'+esc(agent.blocker||agent.currentTask||'Blocked without a detailed reason.')+'</p>'+
    '</div>';
  }).join(''):'<div class="list-item"><div class="list-item-top"><span class="build-state success">clear</span></div><strong>No active blockers</strong><p>All reporting lanes are currently unblocked.</p></div>';
}

function renderBuilds(){
  const history=state.project.ci?.history||[];
  $('#ciList').innerHTML=history.length?history.slice(0,8).map(run=>{
    const kind=run.conclusion==='success'?'success':run.status==='in_progress'?'running':'failure';
    const label=run.conclusion||run.status||'unknown';
    return '<div class="list-item">'+
      '<div class="list-item-top"><span class="build-state '+kind+'">'+esc(label)+'</span><span class="list-meta">#'+esc(run.number)+' · '+esc(relativeTime(run.updatedAt))+'</span></div>'+
      '<strong>'+esc(run.title||'CI run')+'</strong>'+
      '<p>Commit '+esc((run.sha||'unknown').slice(0,8))+'</p>'+
    '</div>';
  }).join(''):'<div class="list-item"><strong>No CI history in the current snapshot.</strong></div>';
}

function renderActivity(){
  $('#activityCount').textContent=state.events.length+' events';
  $('#activityFeed').innerHTML=state.events.length?state.events.slice(0,24).map(event=>{
    const type=eventClass(event.type);
    return '<div class="activity-row">'+
      '<span class="activity-icon '+type+'">'+esc(initials(event.agent))+'</span>'+
      '<div class="activity-body"><strong>'+esc(event.agent)+' · '+esc(event.title||'Update')+'</strong><p>'+esc(event.detail||'No additional detail.')+'</p></div>'+
      '<span class="activity-time">'+esc(relativeTime(event.at))+'</span>'+
    '</div>';
  }).join(''):'<div class="activity-row"><span class="activity-icon">—</span><div class="activity-body"><strong>No activity yet</strong><p>Agent events will appear here as telemetry arrives.</p></div></div>';
}

function renderBuilder(){
  const recent=state.events.slice(0,8);
  const intro='<div class="message"><span class="message-avatar">M</span><div class="message-bubble"><strong>MitMi Builder</strong><p>This panel mirrors sanitized agent reports. Commands are handed to the private MitMi repository through GitHub, so no private token is exposed here.</p><span class="message-meta">Control channel ready</span></div></div>';
  $('#builderThread').innerHTML=intro+recent.map(event=>
    '<div class="message"><span class="message-avatar">'+esc(initials(event.agent))+'</span><div class="message-bubble"><strong>'+esc(event.agent)+'</strong><p>'+esc(event.title||'Update')+': '+esc(event.detail||'')+'</p><span class="message-meta">'+esc(relativeTime(event.at))+'</span></div></div>'
  ).join('');

  const select=$('#commandTarget');
  const previous=select.value;
  select.innerHTML='<option value="master">Builder / Master</option>'+state.agents.filter(agent=>agent.id!=='master').map(agent=>'<option value="'+esc(agent.id)+'">'+esc(agent.name)+'</option>').join('');
  if(previous&&[...select.options].some(option=>option.value===previous))select.value=previous;
  updateCommandLink();
}

function updateCommandLink(){
  const body=$('#commandText').value.trim();
  const target=$('#commandTarget').value||'master';
  const title='[Agent Command] '+target+': '+(body?body.slice(0,72):'New command');
  const issueBody='Target agent: '+target+'\n\nCommand:\n'+(body||'')+'\n\nSubmitted from MitMi Agent Control Center.';
  const url='https://github.com/1neza/MitMi/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(issueBody);
  $('#commandLink').href=url;
  $('#commandHint').textContent=body?'Ready to queue securely in the private repo.':'Write a command, then queue it in the private repo.';
}

function renderCharts(){
  state.charts.forEach(chart=>chart.destroy());
  state.charts=[];
  if(!window.Chart){
    $$('.chart-area').forEach(area=>area.innerHTML='<div class="empty-card">Charts could not load. Refresh the page to retry.</div>');
    return;
  }

  Chart.defaults.color='#7d8996';
  Chart.defaults.borderColor='#202832';
  Chart.defaults.font.family='Inter, system-ui, sans-serif';

  const days=[...Array(7)].map((_,index)=>{
    const date=new Date();
    date.setDate(date.getDate()-(6-index));
    return date.toISOString().slice(0,10);
  });
  const counts=days.map(day=>state.events.filter(event=>(event.at||'').slice(0,10)===day).length);

  state.charts.push(new Chart($('#throughputChart'),{
    type:'bar',
    data:{labels:days.map(day=>day.slice(5)),datasets:[{data:counts,label:'Events',backgroundColor:'#6686c5',hoverBackgroundColor:'#7aa7ff',borderRadius:7,maxBarThickness:42}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{displayColors:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,ticks:{precision:0,font:{size:10}}}}}
  }));

  const working=state.agents.filter(agent=>agent.status==='working'&&!agentIsBlocked(agent)).length;
  const blocked=state.agents.filter(agentIsBlocked).length;
  const idle=state.agents.filter(agent=>agent.status==='idle').length;
  const other=Math.max(0,state.agents.length-working-blocked-idle);
  const utilization=[['Working',working,'#7aa7ff'],['Blocked',blocked,'#ff777f'],['Idle',idle,'#697583'],['Other',other,'#9a8cff']];

  state.charts.push(new Chart($('#utilizationChart'),{
    type:'doughnut',
    data:{labels:utilization.map(item=>item[0]),datasets:[{data:utilization.map(item=>item[1]),backgroundColor:utilization.map(item=>item[2]),borderWidth:0,hoverOffset:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'74%',plugins:{legend:{display:false}}}
  }));
  $('#utilizationLegend').innerHTML=utilization.map(item=>'<span class="legend-item"><i class="legend-dot" style="background:'+item[2]+'"></i>'+item[0]+' · '+item[1]+'</span>').join('');

  const history=(state.project.ci?.history||[]).slice(0,10).reverse();
  const rate=Number(state.project.ci?.successRate||0);
  $('#ciRatePill').textContent=rate?rate.toFixed(1)+'% success':'No rate';

  state.charts.push(new Chart($('#buildChart'),{
    type:'line',
    data:{labels:history.map(run=>'#'+run.number),datasets:[{
      data:history.map(run=>run.conclusion==='success'?1:run.conclusion==='failure'?0:.5),
      label:'Build',
      borderColor:'#63d79a',
      backgroundColor:'rgba(99,215,154,.08)',
      pointBackgroundColor:history.map(run=>run.conclusion==='success'?'#63d79a':run.conclusion==='failure'?'#ff777f':'#7aa7ff'),
      pointBorderWidth:0,pointRadius:4,pointHoverRadius:5,tension:.25,fill:true
    }]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.raw===1?'Passed':ctx.raw===0?'Failed':'Running'}}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{min:0,max:1,ticks:{stepSize:1,callback:value=>value===1?'Pass':value===0?'Fail':'',font:{size:9}}}}}
  }));
}

function openAgentDrawer(agentId){
  const agent=state.agents.find(item=>item.id===agentId);
  if(!agent)return;
  $('#drawerAgentName').textContent=agent.name;
  const events=(agent.activity||[]).slice().sort((a,b)=>(parseDate(b.at)?.getTime()||0)-(parseDate(a.at)?.getTime()||0));
  $('#drawerContent').innerHTML=
    '<div class="drawer-block"><span>Status</span><p><strong>'+esc(agentIsBlocked(agent)?'Working with blocker':agent.status||'idle')+'</strong> · updated '+esc(relativeTime(agent.updatedAt))+'</p></div>'+
    '<div class="drawer-block"><span>Role</span><p>'+esc(agent.role||'Agent')+'</p></div>'+
    '<div class="drawer-block"><span>Current task</span><p>'+esc(agent.currentTask||'No current task reported.')+'</p></div>'+
    '<div class="drawer-block"><span>Latest report</span><p>'+esc(agent.latestReport||'No report yet.')+'</p></div>'+
    '<div class="drawer-block"><span>Blocker</span><p>'+esc(agent.blocker||'No explicit blocker.')+'</p></div>'+
    '<div class="drawer-block"><span>Recent activity</span>'+
      (events.length?events.slice(0,12).map(event=>'<div class="drawer-event"><i class="drawer-event-dot '+eventClass(event.type)+'"></i><div><strong>'+esc(event.title||'Update')+'</strong><p>'+esc(event.detail||'')+' · '+esc(relativeTime(event.at))+'</p></div></div>').join(''):'<p>No agent activity recorded yet.</p>')+
    '</div>';

  $('#agentDrawer').classList.add('open');
  $('#agentDrawer').setAttribute('aria-hidden','false');
  $('#drawerBackdrop').hidden=false;
  document.body.style.overflow='hidden';
}

function closeAgentDrawer(){
  $('#agentDrawer').classList.remove('open');
  $('#agentDrawer').setAttribute('aria-hidden','true');
  $('#drawerBackdrop').hidden=true;
  document.body.style.overflow='';
}

function openSidebar(){
  $('#sidebar').classList.add('open');
  $('#sidebarBackdrop').hidden=false;
  document.body.style.overflow='hidden';
}

function closeSidebar(){
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').hidden=true;
  if(!$('#agentDrawer').classList.contains('open'))document.body.style.overflow='';
}

function updateNavigation(sectionId){
  $$('.side-link').forEach(link=>link.classList.toggle('active',link.dataset.nav===sectionId));
  $$('[data-mobile-nav]').forEach(link=>link.classList.toggle('active',link.dataset.mobileNav===sectionId));
}

function setupNavigation(){
  const sections=$$('.anchor-section');
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible)updateNavigation(visible.target.id);
    },{rootMargin:'-20% 0px -65% 0px',threshold:[0,.1,.25]});
    sections.forEach(section=>observer.observe(section));
  }
  $$('.side-link,[data-mobile-nav]').forEach(link=>link.addEventListener('click',()=>closeSidebar()));
}

function statusSummary(){
  const ci=state.project.ci||{};
  const active=state.agents.filter(agent=>agent.status==='working').length;
  const blockers=state.agents.filter(agentIsBlocked).length;
  return [
    'MitMi status',
    'Branch: '+(state.project.branch||'agent-dev'),
    'Head: '+(state.project.head||'unknown').slice(0,8),
    'CI: #'+(ci.latestRun||'—')+' '+(ci.latestConclusion||'unknown'),
    'Agents working: '+active,
    'Open blockers: '+blockers,
    ci.latestFailure?'Latest CI issue: '+ci.latestFailure:null
  ].filter(Boolean).join('\n');
}

function renderAll(){
  renderProject();
  renderMetrics();
  renderAgents();
  renderBlockers();
  renderBuilds();
  renderActivity();
  renderBuilder();
  renderCharts();
}

async function load(){
  const refresh=$('#refreshBtn');
  refresh.classList.add('loading');
  try{
    const [agentResponse,projectResponse]=await Promise.all([
      fetch(AGENT_URL+'?t='+Date.now(),{cache:'no-store'}),
      fetch(PROJECT_URL+'?t='+Date.now(),{cache:'no-store'})
    ]);
    if(!agentResponse.ok)throw new Error('Agent telemetry is unavailable.');
    const agentData=await agentResponse.json();
    const projectData=projectResponse.ok?await projectResponse.json():{};
    state.agents=agentData.agents||[];
    state.events=collectEvents(state.agents);
    state.project=projectData;
    renderAll();
  }catch(error){
    $('#syncStatus').classList.add('error');
    $('#syncLabel').textContent='Telemetry unavailable';
    $('#projectMeta').textContent=error.message||'Could not load control-center data.';
    showToast('Could not refresh telemetry.');
  }finally{
    refresh.classList.remove('loading');
  }
}

$('#refreshBtn').addEventListener('click',async()=>{
  await load();
  showToast('Telemetry refreshed.');
});

$('#copySummaryBtn').addEventListener('click',async()=>{
  const ok=await copyText(statusSummary());
  showToast(ok?'Project status copied.':'Could not copy project status.');
});

$('#agentFilters').addEventListener('click',event=>{
  const button=event.target.closest('[data-filter]');
  if(!button)return;
  state.filter=button.dataset.filter;
  $$('#agentFilters .segment').forEach(item=>item.classList.toggle('active',item===button));
  renderAgents();
});

$('#commandTarget').addEventListener('change',updateCommandLink);
$('#commandText').addEventListener('input',updateCommandLink);

$('#commandLink').addEventListener('click',event=>{
  const text=$('#commandText').value.trim();
  if(!text){
    event.preventDefault();
    $('#commandText').focus();
    $('#commandHint').textContent='Write a command before queueing it.';
    showToast('Write a command first.');
    return;
  }
  showToast('Opening the private MitMi command request…');
});

$('#copyCommandBtn').addEventListener('click',async()=>{
  const text=$('#commandText').value.trim();
  if(!text){
    $('#commandText').focus();
    showToast('Write a command first.');
    return;
  }
  const target=$('#commandTarget').selectedOptions[0]?.textContent||'Builder / Master';
  const ok=await copyText('Target: '+target+'\n\n'+text);
  showToast(ok?'Command copied.':'Could not copy command.');
});

$('#mobileMenuBtn').addEventListener('click',openSidebar);
$('#sidebarCloseBtn').addEventListener('click',closeSidebar);
$('#sidebarBackdrop').addEventListener('click',closeSidebar);
$('#drawerCloseBtn').addEventListener('click',closeAgentDrawer);
$('#drawerBackdrop').addEventListener('click',closeAgentDrawer);

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    closeAgentDrawer();
    closeSidebar();
  }
});

setupNavigation();
load();
setInterval(load,60000);
