const AGENT_URL='./data/agents.json', PROJECT_URL='./data/project.json';
let charts=[];const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=v=>{if(!v)return'—';const d=new Date(v);if(Number.isNaN(d.getTime()))return v;const diff=Math.max(0,Date.now()-d.getTime()),m=Math.floor(diff/60000);if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';return d.toLocaleDateString()};
const statusClass=s=>['working','success','blocked','idle'].includes(s)?s:'idle';
function initials(name='Agent'){return name.replace('MitMi ','').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function metric(label,value,delta='',tone=''){return '<div class="metric"><div class="metric-label">'+esc(label)+'</div><div class="metric-value">'+esc(value)+'</div><div class="metric-delta '+tone+'">'+esc(delta||'Live telemetry')+'</div></div>'}
function collectEvents(agents){return agents.flatMap(a=>(a.activity||[]).map(e=>({...e,agent:a.name,id:a.id}))).sort((a,b)=>new Date(b.at)-new Date(a.at))}
function renderAgents(agents,events){
  const filter=$('#agentFilter').value||'all';
  const query=($('#searchBox').value||'').trim().toLowerCase();
  let visible=filter==='all'?agents:agents.filter(a=>a.id===filter);
  if(query)visible=visible.filter(a=>[a.name,a.role,a.currentTask,a.latestReport,a.blocker].join(' ').toLowerCase().includes(query));
  $('#agentRows').innerHTML=visible.map(a=>'<div class="agent-row">'+
    '<div class="agent-name"><div class="agent-avatar">'+esc(initials(a.name))+'</div><div><strong>'+esc(a.name)+'</strong><span>'+esc(a.role||'Agent')+'</span></div></div>'+
    '<div><span class="status-badge"><i class="status-dot '+statusClass(a.status)+'"></i>'+esc(a.status||'idle')+'</span></div>'+
    '<div class="cell-text" title="'+esc(a.currentTask||'')+'">'+esc(a.currentTask||'No task reported')+'</div>'+
    '<div class="cell-text" title="'+esc(a.latestReport||'')+'">'+esc(a.latestReport||'No report yet')+'</div>'+
    '<div class="updated">'+esc(fmtTime(a.updatedAt))+'</div></div>').join('')||'<div class="agent-row"><div class="cell-text">No agents match the current filter.</div></div>';
}
function renderBlockers(agents){
  const blockers=agents.filter(a=>a.status==='blocked'||a.blocker);
  $('#blockerCount').textContent=blockers.length;
  $('#blockerList').innerHTML=blockers.map((a,i)=>'<div class="blocker-item"><div class="blocker-top"><span class="severity '+(i===0?'critical':'high')+'">'+(i===0?'critical':'high')+'</span><span class="updated">'+esc(fmtTime(a.updatedAt))+'</span></div><strong>'+esc(a.name)+'</strong><p>'+esc(a.blocker||a.currentTask||'Blocked')+'</p></div>').join('')||'<div class="blocker-item"><strong>No active blockers</strong><p>All currently reporting lanes are unblocked.</p></div>';
}
function renderReports(events){
  $('#reportList').innerHTML=events.slice(0,16).map(e=>'<div class="timeline-item"><span class="timeline-mark '+statusClass(e.type)+'"></span><div><strong>'+esc(e.agent)+' · '+esc(e.title||'Update')+'</strong><p>'+esc(e.detail||'')+' · '+esc(fmtTime(e.at))+'</p></div></div>').join('')||'<div class="timeline-item"><span class="timeline-mark"></span><div><strong>No reports yet</strong></div></div>';
  const recent=events.slice(0,6);
  $('#builderThread').innerHTML='<div class="chat-message system"><div class="msg-avatar">✦</div><div class="bubble"><strong>Builder</strong><p>Connected to the private MitMi development workflow through sanitized telemetry.</p></div></div>'+recent.map(e=>'<div class="chat-message system"><div class="msg-avatar">'+esc(initials(e.agent))+'</div><div class="bubble"><strong>'+esc(e.agent)+'</strong><p>'+esc(e.title||'Update')+': '+esc(e.detail||'')+'</p></div></div>').join('');
}
function renderActivity(events){
  const days=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10)});
  $('#activityCount').textContent=events.length+' events';
  $('#activityMap').innerHTML=days.map(day=>{const ev=events.filter(e=>(e.at||'').slice(0,10)===day),n=ev.length;const levels=[0,1,2,3].map(i=>{const v=Math.max(0,n-i*2);const l=v>=6?'l4':v>=4?'l3':v>=2?'l2':v>=1?'l1':'';return '<span class="activity-cell '+l+'" title="'+n+' events on '+day+'"></span>'}).join('');return '<div class="activity-day"><div class="activity-cells">'+levels+'</div><div class="activity-day-label">'+day.slice(5)+'</div></div>'}).join('');
}
function renderProject(project,agents,events){
  const active=agents.filter(a=>a.status==='working').length;
  const blockers=agents.filter(a=>a.status==='blocked'||a.blocker).length;
  const successes=events.filter(e=>e.type==='success').length;
  const rate=project.ci?.successRate??0;
  $('#metrics').innerHTML=metric('Active Agents',active,'Live execution lanes')+metric('Tasks Completed',successes,events.length+' recorded events')+metric('Build Success Rate',rate+'%',(project.ci?.history?.length||0)+' recent CI runs',rate>=80?'good':'bad')+metric('Open Blockers',blockers,blockers?'Needs attention':'No active blockers',blockers?'bad':'good');
  $('#repoConnectionTitle').textContent='MitMi private repository · '+(project.branch||'agent-dev');
  $('#repoConnectionMeta').textContent='Head '+(project.head||'').slice(0,8)+' · '+(project.latestCommit||'No commit data')+' · CI #'+(project.ci?.latestRun||'—')+' '+(project.ci?.latestConclusion||'unknown');
  $('#branchBadge').textContent=project.branch||'agent-dev';
  $('#syncLabel').textContent='Synced '+fmtTime(project.syncedAt);
  $('#footerSync').textContent='Last source sync '+fmtTime(project.syncedAt)+' · sanitized telemetry only';
  $('#ciRatePill').textContent=rate+'% success';
  const history=project.ci?.history||[];
  $('#ciList').innerHTML=history.slice(0,7).map(x=>'<div class="build-item"><div class="build-top"><span class="build-status '+(x.conclusion==='success'?'success':x.status==='in_progress'?'running':'failure')+'">'+esc(x.conclusion||x.status||'unknown')+'</span><span class="updated">#'+esc(x.number)+' · '+esc(fmtTime(x.updatedAt))+'</span></div><strong>'+esc(x.title||'CI run')+'</strong><p>'+esc((x.sha||'').slice(0,8))+'</p></div>').join('')||'<div class="build-item"><strong>No CI snapshot available.</strong></div>';
  drawCharts(agents,events,project);
}
function drawCharts(agents,events,project){
  charts.forEach(c=>c.destroy());charts=[];Chart.defaults.color='#7e8996';Chart.defaults.borderColor='#20262e';Chart.defaults.font.family='Inter, system-ui, sans-serif';
  const days=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d.toISOString().slice(0,10)});
  const counts=days.map(d=>events.filter(e=>(e.at||'').slice(0,10)===d).length);
  charts.push(new Chart($('#throughputChart'),{type:'bar',data:{labels:days.map(d=>d.slice(5)),datasets:[{label:'Agent events',data:counts,backgroundColor:'#607fb8',borderRadius:5,maxBarThickness:34}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{beginAtZero:true,ticks:{precision:0,font:{size:9}}}}}}));
  const working=agents.filter(a=>a.status==='working').length,success=agents.filter(a=>a.status==='success').length,waiting=agents.filter(a=>a.status==='idle').length,blocked=agents.filter(a=>a.status==='blocked').length;
  charts.push(new Chart($('#utilizationChart'),{type:'doughnut',data:{labels:['Running','Reviewing','Waiting','Blocked'],datasets:[{data:[working,success,waiting,blocked],backgroundColor:['#73a2ff','#57d68d','#697581','#ff6e78'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false}}}}));
  const util=[['Running',working,'#73a2ff'],['Reviewing',success,'#57d68d'],['Waiting',waiting,'#697581'],['Blocked',blocked,'#ff6e78']];
  $('#utilizationLegend').innerHTML=util.map(x=>'<div class="legend-item"><i class="legend-swatch" style="background:'+x[2]+'"></i>'+x[0]+' · '+x[1]+'</div>').join('');
  const hist=(project.ci?.history||[]).slice(0,10).reverse();
  charts.push(new Chart($('#buildChart'),{type:'line',data:{labels:hist.map(x=>'#'+x.number),datasets:[{label:'Build health',data:hist.map(x=>x.conclusion==='success'?100:x.conclusion==='failure'?0:50),borderColor:'#57d68d',backgroundColor:'rgba(87,214,141,.08)',fill:true,tension:.28,pointRadius:2,pointBackgroundColor:hist.map(x=>x.conclusion==='success'?'#57d68d':x.conclusion==='failure'?'#ff6e78':'#73a2ff')}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:8}}},y:{min:0,max:100,ticks:{callback:v=>v===100?'pass':v===0?'fail':'',font:{size:8}}}}}}));
}
function hydrateSelectors(agents){
  const f=$('#agentFilter'),t=$('#commandTarget');
  if(f.options.length===1)agents.forEach(a=>f.add(new Option(a.name,a.id)));
  const val=t.value;t.innerHTML='';t.add(new Option('Builder / Master','master'));agents.forEach(a=>{if(a.id!=='master')t.add(new Option(a.name,a.id))});if(val)t.value=val;
}
let state={agents:[],events:[],project:{}};
async function load(){
  try{
    const [ar,pr]=await Promise.all([fetch(AGENT_URL+'?t='+Date.now(),{cache:'no-store'}),fetch(PROJECT_URL+'?t='+Date.now(),{cache:'no-store'})]);
    if(!ar.ok)throw new Error('Agent telemetry unavailable');
    const ad=await ar.json();const project=pr.ok?await pr.json():{};
    const agents=ad.agents||[],events=collectEvents(agents);state={agents,events,project};
    hydrateSelectors(agents);renderAgents(agents,events);renderBlockers(agents);renderReports(events);renderActivity(events);renderProject(project,agents,events);
  }catch(e){
    $('#syncLabel').textContent='Telemetry unavailable';
    $('#repoConnectionMeta').textContent=e.message;
  }
}
$('#refreshBtn').addEventListener('click',load);
$('#agentFilter').addEventListener('change',()=>renderAgents(state.agents,state.events));
$('#searchBox').addEventListener('input',()=>renderAgents(state.agents,state.events));
$('#sendCommandBtn').addEventListener('click',()=>{
  const body=$('#commandText').value.trim();if(!body){$('#commandHint').textContent='Write a command first.';return}
  const target=$('#commandTarget').value||'master';
  const title='[Agent Command] '+target+': '+body.slice(0,72);
  const issueBody='Target agent: '+target+'\n\nCommand:\n'+body+'\n\nSubmitted from MitMi Agent Control Center.';
  const url='https://github.com/1neza/MitMi/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(issueBody);
  $('#builderThread').insertAdjacentHTML('beforeend','<div class="chat-message user"><div class="msg-avatar">You</div><div class="bubble"><strong>You → '+esc(target)+'</strong><p>'+esc(body)+'</p></div></div>');
  $('#commandHint').textContent='Opening the private repo to submit securely…';
  window.open(url,'_blank','noopener,noreferrer');
});
load();setInterval(load,60000);