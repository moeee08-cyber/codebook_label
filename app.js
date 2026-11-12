import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const state = { supabase: null, user: null, projects: [], project: null, runs: [], runId: null, view: 'label', assignments: [], sentences: {}, mine: {}, allLabels: [], channel: null, current: null, draft: {presence:null, high_low:null, reasoning:''} };
const toast = message => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };
const setConnection = (online, text = online ? 'Live sync on' : 'Not connected') => { const el = $('#connectionStatus'); el.classList.toggle('online', online); el.lastChild.textContent = ` ${text}`; };
const titleFor = view => ({label:'Independent coding',reliability:'Reliability',review:'Consensus review',data:'Data & sampling'}[view]);
const updateHeader = () => { $('#breadcrumb').innerHTML = `AI Annotation Lab <span>/</span> <b>${esc(titleFor(state.view))}</b>`; };

function storedConfig() { return {url:localStorage.getItem('lab:supabase-url')||'', key:localStorage.getItem('lab:supabase-key')||''}; }
function connect(url, key) {
  localStorage.setItem('lab:supabase-url', url.trim());
  localStorage.setItem('lab:supabase-key', key.trim());
  state.supabase = createClient(url.trim(), key.trim());
  state.supabase.auth.onAuthStateChange((_event, session) => { state.user = session?.user || null; syncAuth(); });
  state.supabase.auth.getSession().then(({data}) => { state.user = data.session?.user || null; syncAuth(); });
}
function syncAuth() {
  $('#signOut').classList.toggle('hidden', !state.user);
  $('#userBadge').textContent = state.user?.email || '';
  if (!state.user) { state.projects=[]; state.project=null; setConnection(false,'Sign in to connect'); renderAuth(); return; }
  loadProjects();
}
function renderAuth() {
  $('#projectPicker').innerHTML='';
  $('#content').innerHTML = `<div class="auth-wrap"><div class="eyebrow">A shared space for careful coding</div><div class="page-head"><div><h1>Welcome to Codebook</h1><p>Set up this workspace, then sign in as a coder.</p></div></div>
  <div class="panel"><h2>Connect the shared database</h2><p class="sub">Use the Supabase Project URL and anon/publishable key. These are public client keys; never paste a service-role key here.</p>
  <div class="field"><label>Supabase project URL</label><input id="sbUrl" placeholder="https://your-project.supabase.co" value="${esc(storedConfig().url)}"></div>
  <div class="field"><label>Anon / publishable key</label><input id="sbKey" type="password" placeholder="eyJ…" value="${esc(storedConfig().key)}"></div>
  <button class="button" id="connectBtn">Connect</button></div>
  ${state.supabase?`<div class="panel"><h2>Sign in or create an account</h2><p class="sub">Use the same email for each coding session. Blind labels stay private until discussion is opened.</p><div class="field"><label>Email</label><input id="email" type="email" autocomplete="username" placeholder="you@university.edu"></div><div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" placeholder="At least 8 characters"></div><div class="row"><button class="button" id="loginBtn">Sign in</button><button class="button secondary" id="signupBtn">Create account</button></div></div>`:''}
  <div class="notice">Setup checklist: create a Supabase project, run <code>schema.sql</code> from the repository, then paste its URL and anon key here. Configuration stays in this browser and is not written to GitHub.</div></div>`;
  $('#connectBtn').onclick=()=>{try{connect($('#sbUrl').value,$('#sbKey').value);toast('Database client configured');}catch(e){toast(e.message)}};
  $('#loginBtn')?.addEventListener('click', async()=>{const {error}=await state.supabase.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});if(error)toast(error.message)});
  $('#signupBtn')?.addEventListener('click', async()=>{const {error}=await state.supabase.auth.signUp({email:$('#email').value,password:$('#password').value});if(error)toast(error.message);else toast('Account created. Check email if confirmation is enabled.')});
}

async function loadProjects() {
  setConnection(false,'Loading workspace');
  const {data:members,error}=await state.supabase.from('project_members').select('project_id,role').eq('user_id',state.user.id);
  if(error){setConnection(false,'Database setup needed');renderSetupError(error);return;}
  const ids=(members||[]).map(m=>m.project_id);
  if(!ids.length){state.projects=[];state.project=null;setConnection(true);renderProjectGate();return;}
  const {data:projects,error:projectError}=await state.supabase.from('projects').select('*').in('id',ids).order('created_at');
  if(projectError){toast(projectError.message);return;}
  state.projects=projects||[];
  const selected=localStorage.getItem('lab:project');
  state.project=state.projects.find(p=>p.id===selected)||state.projects[0]||null;
  state.runId=null;
  setConnection(true);
  renderProjectPicker();
  if(state.project) { subscribeRealtime(); await renderView(); } else renderProjectGate();
}
function renderSetupError(error){$('#content').innerHTML=`<div class="empty"><div class="icon">⌁</div><h3>Database setup is incomplete</h3><p>${esc(error.message)}<br>Run <code>schema.sql</code> in Supabase SQL Editor, then refresh.</p><button class="button subtle" id="backConfig">Review connection settings</button></div>`;$('#backConfig').onclick=()=>{state.user=null;renderAuth()};}
function renderProjectPicker(){
  $('#projectPicker').innerHTML=`<select class="project-select" id="projectSelect">${state.projects.map(p=>`<option value="${p.id}" ${p.id===state.project?.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
  $('#projectSelect').onchange=()=>{state.project=state.projects.find(p=>p.id===$('#projectSelect').value);state.runId=null;localStorage.setItem('lab:project',state.project.id);subscribeRealtime();renderView()};
}
function renderProjectGate(){
  updateHeader();
  $('#content').innerHTML=`<div class="auth-wrap"><div class="eyebrow">Start a coding project</div><div class="page-head"><div><h1>Create or join a workspace</h1><p>Both coders need an account and the same project.</p></div></div><div class="panel"><h2>Create project</h2><div class="field"><label>Project name</label><input id="newProjectName" placeholder="AI Agency & Inevitability"></div><button class="button" id="createProject">Create workspace</button><div class="divider"></div><h2>Join with invite code</h2><div class="field"><label>Invite code</label><input id="joinCode" placeholder="Paste the project code"></div><button class="button secondary" id="joinProject">Join project</button></div></div>`;
  $('#createProject').onclick=createProject;$('#joinProject').onclick=joinProject;
}
async function createProject(){
  const name=$('#newProjectName').value.trim();if(!name)return toast('Enter a project name');
  const join_code=crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
  const {data,error}=await state.supabase.from('projects').insert({name,join_code,owner_id:state.user.id,phase:'blind'}).select().single();
  if(error)return toast(error.message);toast(`Project created. Invite code: ${join_code}`);await loadProjects();
}
async function joinProject(){const code=$('#joinCode').value.trim();if(!code)return toast('Enter an invite code');const {data,error}=await state.supabase.rpc('join_project_with_code',{p_code:code});if(error)return toast(error.message);toast('Joined project');await loadProjects();}
function subscribeRealtime(){if(state.channel)state.supabase.removeChannel(state.channel);if(!state.project)return;state.channel=state.supabase.channel(`project-${state.project.id}`).on('postgres_changes',{event:'*',schema:'public',table:'annotations',filter:`project_id=eq.${state.project.id}`},()=>refreshLiveData()).on('postgres_changes',{event:'*',schema:'public',table:'discussion_notes',filter:`project_id=eq.${state.project.id}`},()=>refreshLiveData()).on('postgres_changes',{event:'*',schema:'public',table:'consensus',filter:`project_id=eq.${state.project.id}`},()=>refreshLiveData()).on('postgres_changes',{event:'INSERT',schema:'public',table:'sample_runs',filter:`project_id=eq.${state.project.id}`},()=>renderView()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'projects',filter:`id=eq.${state.project.id}`},()=>loadProjects()).subscribe(status=>setConnection(status==='SUBSCRIBED',status==='SUBSCRIBED'?'Live sync on':'Connecting…'));}
let refreshTimer;
function refreshLiveData(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(state.view==='reliability'||state.view==='review')renderView();},350);}

async function renderView(){updateHeader();renderProjectPicker();await loadRuns();const renderers={label:renderLabel,reliability:renderReliability,review:renderReview,data:renderData};await renderers[state.view]();}
async function loadRuns(){if(!state.project)return;const {data,error}=await state.supabase.from('sample_runs').select('id,seed,count_per_stratum,created_at').eq('project_id',state.project.id).order('created_at',{ascending:false});if(error){state.runs=[];return;}state.runs=data||[];if(!state.runs.some(r=>r.id===state.runId))state.runId=state.runs[0]?.id||null;const picker=$('#runPicker');picker.classList.toggle('hidden',!state.runs.length);picker.innerHTML=state.runs.map(r=>`<option value="${r.id}" ${r.id===state.runId?'selected':''}>Seed ${r.seed} · a=${r.count_per_stratum}</option>`).join('');picker.onchange=()=>{state.runId=picker.value;renderView()};}
function pageHead(eyebrow,title,desc,action=''){return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;}
function cardSentence(sentence,meta='') {const box=document.createElement('div');box.className='sentence-card';box.innerHTML=`<div class="sentence-meta"><span>${esc(meta)}</span><span>Original wording</span></div><div class="sentence-text"></div>`;$('.sentence-text',box).textContent=sentence;return box;}
async function getAssignments(){
  let assignmentQuery=state.supabase.from('assignments').select('id,sentence_id,dimension,sample_run_id,created_at').eq('project_id',state.project.id).order('created_at');if(state.runId)assignmentQuery=assignmentQuery.eq('sample_run_id',state.runId);const {data:as,error}=await assignmentQuery;if(error)throw error;
  const ids=[...new Set((as||[]).map(a=>a.sentence_id))];let sentences=[];if(ids.length){const res=await state.supabase.from('sentences').select('id,external_id,sentence').in('id',ids);if(res.error)throw res.error;sentences=res.data||[];}
  state.assignments=as||[];state.sentences=Object.fromEntries(sentences.map(s=>[s.id,s]));
  const {data:mine,error:mineError}=await state.supabase.from('annotations').select('*').eq('project_id',state.project.id).eq('user_id',state.user.id);if(mineError)throw mineError;state.mine=Object.fromEntries((mine||[]).map(a=>[a.assignment_id,a]));
}
function renderError(target,error){target.innerHTML=`<div class="empty"><div class="icon">!</div><h3>Could not load this section</h3><p>${esc(error.message)}</p></div>`;}
async function renderLabel(){
  const root=$('#content');try{await getAssignments()}catch(e){return renderError(root,e)}
  const todo=state.assignments.filter(a=>!state.mine[a.id]);
  const done=state.assignments.length-todo.length;
  root.innerHTML=pageHead('BLIND CODING',`Good ${state.user.email.split('@')[0]}, ready to code?`,`Your partner's labels stay hidden. Submit each sentence once; your original labels are preserved.`)+`<div class="stat-grid"><div class="stat"><span>Assigned to you</span><b>${state.assignments.length}</b></div><div class="stat"><span>Submitted</span><b>${done}</b></div><div class="stat"><span>Remaining</span><b>${todo.length}</b></div><div class="stat"><span>Project phase</span><b style="font-size:17px">${state.project.phase==='blind'?'Blind':'Discussion'}</b></div></div>`;
  if(state.project.phase!=='blind'){root.insertAdjacentHTML('beforeend',`<div class="notice">Independent coding is closed. You can review disagreements in Consensus Review.</div>`);return;}
  if(!todo.length){root.insertAdjacentHTML('beforeend',`<div class="panel empty"><div class="icon">✓</div><h3>All assigned sentences submitted</h3><p>Your partner's original labels remain hidden until the project owner opens review.</p></div>`);return;}
  state.current=todo[0];state.draft={presence:null,high_low:null,reasoning:''};const sentence=state.sentences[state.current.sentence_id];
  root.appendChild(cardSentence(sentence?.sentence||'',`${state.current.dimension} · ${done+1} of ${state.assignments.length}`));
  root.insertAdjacentHTML('beforeend',`<section class="panel"><h2>${state.current.dimension==='Agency'?'Agency':'Inevitability'} presence</h2><p class="sub">${state.current.dimension==='Agency'?'Does this sentence describe human or institutional capacity to shape AI?':'Does this sentence present AI development or impact as a future trajectory?'}</p><div class="choice-row"><button class="choice" data-presence="1"><b>Present</b><small>Evidence is present in this sentence</small></button><button class="choice" data-presence="0"><b>Not present</b><small>No clear evidence for this construct</small></button></div><div id="highlow"></div><div class="field"><label>Reasoning (optional)</label><textarea id="reasoning" placeholder="Briefly note the evidence for your code…"></textarea></div><div class="row" style="justify-content:space-between"><span class="pill">Private until review opens</span><button class="button" id="submitLabel" disabled>Submit label</button></div></section>`);
  $$('[data-presence]').forEach(btn=>btn.onclick=()=>{state.draft.presence=btn.dataset.presence==='1';state.draft.high_low=null;$$('[data-presence]').forEach(x=>x.classList.toggle('selected',x===btn));if(state.draft.presence)$('#highlow').innerHTML=`<div class="divider"></div><h2>High / Low</h2><p class="sub">${state.current.dimension==='Agency'?'How much agency do humans or institutions have?':'How inevitable or contingent is the AI trajectory?'}</p><div class="choice-row"><button class="choice" data-highlow="1"><b>High</b><small>${state.current.dimension==='Agency'?'Meaningful capacity to shape the trajectory':'Trajectory appears difficult to avoid'}</small></button><button class="choice" data-highlow="0"><b>Low</b><small>${state.current.dimension==='Agency'?'Mainly reacting or adapting':'Trajectory remains contingent or uncertain'}</small></button></div>`;else $('#highlow').innerHTML=`<div class="notice">Presence is absent, so High / Low is not applicable.</div>`;$$('[data-highlow]').forEach(x=>x.onclick=()=>{state.draft.high_low=x.dataset.highlow==='1';$$('[data-highlow]').forEach(y=>y.classList.toggle('selected',x===y));checkDraft()});checkDraft()});
  $('#reasoning').oninput=()=>state.draft.reasoning=$('#reasoning').value;
  $('#submitLabel').onclick=submitLabel;
}
function checkDraft(){const applicable=state.draft.presence===false||state.draft.high_low!==null;$('#submitLabel').disabled=state.draft.presence===null||!applicable;}
async function submitLabel(){const a=state.current;if(!a)return;const row={project_id:state.project.id,assignment_id:a.id,user_id:state.user.id,presence:state.draft.presence,high_low:state.draft.presence?state.draft.high_low:null,reasoning:state.draft.reasoning||null};const {error}=await state.supabase.from('annotations').insert(row);if(error)return toast(error.message);toast('Label saved');await renderLabel();}

function kappaStats(pairs){const n=pairs.length;if(!n)return {n,agreement:null,kappa:null,matrix:[[0,0],[0,0]]};const m=[[0,0],[0,0]];pairs.forEach(([x,y])=>m[Number(x)][Number(y)]++);const po=(m[0][0]+m[1][1])/n;const p0=((m[0][0]+m[0][1])/n)*((m[0][0]+m[1][0])/n);const p1=((m[1][0]+m[1][1])/n)*((m[0][1]+m[1][1])/n);const pe=p0+p1;return {n,agreement:po,kappa:pe===1?null:(po-pe)/(1-pe),matrix:m};}
async function loadEvaluation(){const {data:members,error}=await state.supabase.from('project_members').select('user_id,role').eq('project_id',state.project.id);if(error)throw error;const {data:labels,error:le}=await state.supabase.from('annotations').select('*').eq('project_id',state.project.id);if(le)throw le;return {members:members||[],labels:labels||[]};}
function pairedFor(assignments,labels,coders,dimension,measure){const matches=[];for(const a of assignments.filter(x=>x.dimension===dimension)){const left=labels.find(x=>x.assignment_id===a.id&&x.user_id===coders[0]);const right=labels.find(x=>x.assignment_id===a.id&&x.user_id===coders[1]);if(!left||!right)continue;if(measure==='presence')matches.push([left.presence,right.presence]);else if(left.presence&&right.presence&&left.high_low!==null&&right.high_low!==null)matches.push([left.high_low,right.high_low]);}return matches;}
async function renderReliability(){const root=$('#content');try{await getAssignments()}catch(e){return renderError(root,e)}
  let data;try{data=await loadEvaluation()}catch(e){return renderError(root,e)}
  const coders=data.members.map(m=>m.user_id).slice(0,2);const blind=state.project.phase==='blind';
  root.innerHTML=pageHead('INTERCODER RELIABILITY','Measure agreement, not consensus','Cohen’s κ and raw agreement use only assignments labeled by both coders. Original labels are kept separate from consensus.')+(blind?`<div class="notice">Blind phase is active. You can see your own progress, but the other coder’s labels remain private. Open review after both coders finish to calculate reliability.</div>`:'')+`<div class="stat-grid"><div class="stat"><span>Assignments</span><b>${state.assignments.length}</b></div><div class="stat"><span>Coders</span><b>${data.members.length}</b></div><div class="stat"><span>Phase</span><b style="font-size:17px">${blind?'Blind':'Review'}</b></div><div class="stat"><span>Agreement basis</span><b style="font-size:17px">Independent</b></div></div>`;
  if(blind){const mine=state.assignments.filter(a=>state.mine[a.id]).length;root.insertAdjacentHTML('beforeend',`<div class="panel"><h2>Your coding progress</h2><div class="progress"><i style="width:${state.assignments.length?mine/state.assignments.length*100:0}%"></i></div><p class="sub">${mine} of ${state.assignments.length} assigned labels submitted.</p>${state.project.owner_id===state.user.id?'<button class="button" id="openReview">Both coders finished — open reliability & review</button>':''}</div>`);$('#openReview')?.addEventListener('click',openReview);return;}
  if(coders.length<2){root.insertAdjacentHTML('beforeend','<div class="notice">Invite the second coder before comparing reliability.</div>');return;}
  const rows=[];for(const dimension of ['Agency','Inevitability'])for(const measure of ['presence','high_low']){const pairs=pairedFor(state.assignments,data.labels,coders,dimension,measure);const stats=kappaStats(pairs);rows.push({dimension,measure,n:stats.n,agreement:stats.agreement,kappa:stats.kappa,matrix:stats.matrix});}
  root.insertAdjacentHTML('beforeend',`<div class="panel"><div class="row" style="justify-content:space-between"><div><h2>Independent label agreement</h2><p class="sub">High/Low is calculated only for items both coders marked Present.</p></div>${state.project.owner_id===state.user.id?'<button class="button subtle" id="closeReview">Return to blind coding</button>':''}</div><div class="table-wrap"><table><thead><tr><th>Construct</th><th>Measure</th><th>Paired N</th><th>Percent agreement</th><th>Cohen’s κ</th><th>Confusion matrix (coder 1 rows × coder 2 columns)</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.dimension}</td><td>${r.measure==='presence'?'Presence':'High / Low'}</td><td>${r.n}</td><td>${r.agreement===null?'—':`${(r.agreement*100).toFixed(1)}%`}</td><td class="metric">${r.kappa===null?'—':r.kappa.toFixed(3)}</td><td>${r.matrix[0].join(' · ')}<br>${r.matrix[1].join(' · ')}</td></tr>`).join('')}</tbody></table></div></div>`);
  $('#closeReview')?.addEventListener('click',async()=>{await state.supabase.from('projects').update({phase:'blind'}).eq('id',state.project.id);toast('Returned to blind coding');await loadProjects()});
}
async function openReview(){const {error}=await state.supabase.rpc('open_project_review',{p_project_id:state.project.id});if(error)return toast(error.message);state.project.phase='discussion';toast('Review opened; both coders can now compare labels');await loadProjects();}

async function renderReview(){const root=$('#content');if(state.project.phase==='blind'){root.innerHTML=pageHead('AFTER BLIND CODING','Consensus review','Once independent coding is complete, open the discussion phase to compare labels and resolve disagreements.')+`<div class="panel empty"><div class="icon">↔</div><h3>Blind coding is still active</h3><p>Original coder labels are hidden to protect independent reliability estimates.</p>${state.project.owner_id===state.user.id?'<button class="button" id="openReview">Open review phase</button>':''}</div>`;$('#openReview')?.addEventListener('click',openReview);return;}
  let evaluation;try{await getAssignments();evaluation=await loadEvaluation()}catch(e){return renderError(root,e)}
  const coderIds=evaluation.members.map(m=>m.user_id).slice(0,2);if(coderIds.length<2){root.innerHTML='<div class="empty"><h3>Waiting for the second coder</h3></div>';return;}
  const disag=[];for(const a of state.assignments){const x=evaluation.labels.find(l=>l.assignment_id===a.id&&l.user_id===coderIds[0]);const y=evaluation.labels.find(l=>l.assignment_id===a.id&&l.user_id===coderIds[1]);if(!x||!y)continue;const presenceDiff=x.presence!==y.presence;const highlowDiff=x.presence&&y.presence&&x.high_low!==y.high_low;if(presenceDiff||highlowDiff)disag.push({a,x,y,presenceDiff,highlowDiff});}
  root.innerHTML=pageHead('DISCUSS & RESOLVE',`Disagreement queue <span class="pill violet">${disag.length} open</span>`,'Original labels are read-only. Add notes, agree on a final label, then confirm with the second coder.')+`<div class="grid" style="grid-template-columns:minmax(220px,.75fr) 2fr"><div class="panel"><h2>Cases</h2><p class="sub">${disag.length} disagreements with two submitted labels</p><div id="caseList"></div></div><div id="caseDetail"></div></div>`;
  const list=$('#caseList');if(!disag.length)list.innerHTML='<div class="empty"><div class="icon">✓</div><h3>No disagreements</h3><p>All jointly labeled cases currently agree.</p></div>';else list.innerHTML=disag.map((d,i)=>`<button class="choice case-choice" data-case="${i}" style="width:100%;margin-bottom:7px"><b>${d.a.dimension} · #${i+1}</b><small>${d.presenceDiff?'Presence differs':'High / Low differs'}</small></button>`).join('');
  $$('.case-choice',root).forEach(b=>b.onclick=()=>showCase(disag[Number(b.dataset.case)],coderIds));if(disag.length)showCase(disag[0],coderIds);
}
async function showCase(item,coders){const root=$('#caseDetail');const sentence=state.sentences[item.a.sentence_id]?.sentence||'';root.innerHTML=`<div class="sentence-card"><div class="sentence-meta"><span>${item.a.dimension} · disagreement</span><span>Independent labels</span></div><div class="sentence-text"></div></div><div class="panel"><div class="review-columns"><div class="coder-card"><h3>CODER A · ORIGINAL</h3><b>Presence: ${item.x.presence?'Present':'Not present'}${item.x.presence?` · High/Low: ${item.x.high_low?'High':'Low'}`:''}</b>${item.x.reasoning?`<p>${esc(item.x.reasoning)}</p>`:''}</div><div class="coder-card"><h3>CODER B · ORIGINAL</h3><b>Presence: ${item.y.presence?'Present':'Not present'}${item.y.presence?` · High/Low: ${item.y.high_low?'High':'Low'}`:''}</b>${item.y.reasoning?`<p>${esc(item.y.reasoning)}</p>`:''}</div></div><div class="divider"></div><h2>Discussion</h2><div id="notes" class="notes"></div><div class="field"><textarea id="noteText" placeholder="Add a discussion note…"></textarea></div><button class="button secondary" id="sendNote">Add note</button><div class="divider"></div><h2>Final consensus label</h2><p class="sub">One coder proposes; the other confirms.</p><div class="row"><label><input type="checkbox" id="consPresence"> Presence</label><select id="consHigh"><option value="">High / Low — optional</option><option value="1">High</option><option value="0">Low</option></select><button class="button" id="saveConsensus">Propose / update</button></div><div id="consensusState" class="notice">No consensus decision yet.</div></div>`;
  $('.sentence-text',root).textContent=sentence;
  await loadNotes(item.a.id);
  $('#sendNote').onclick=async()=>{const body=$('#noteText').value.trim();if(!body)return;const {error}=await state.supabase.from('discussion_notes').insert({project_id:state.project.id,assignment_id:item.a.id,user_id:state.user.id,body});if(error)toast(error.message);else $('#noteText').value=''};
  const {data:cons}=await state.supabase.from('consensus').select('*').eq('assignment_id',item.a.id).maybeSingle();if(cons){$('#consPresence').checked=cons.presence;$('#consHigh').value=cons.high_low===null?'':String(Number(cons.high_low));$('#consensusState').textContent=cons.confirmed_by?`Confirmed by both coders · ${cons.presence?'Present':'Not present'}${cons.presence?` · ${cons.high_low?'High':'Low'}`:''}`:`Proposed by ${cons.proposed_by===state.user.id?'you':'the other coder'}${cons.presence?' · '+(cons.high_low?'High':'Low'):''}`;}
  $('#saveConsensus').onclick=async()=>{const presence=$('#consPresence').checked;const high=$('#consHigh').value===''?null:$('#consHigh').value==='1';if(presence&&high===null)return toast('Choose High or Low when Presence is selected');const existing=cons;let payload;if(existing&&existing.proposed_by!==state.user.id){payload={confirmed_by:state.user.id,confirmed_at:new Date().toISOString()};}else{payload={project_id:state.project.id,assignment_id:item.a.id,presence,high_low:presence?high:null,proposed_by:state.user.id,confirmed_by:null,confirmed_at:null};}const {error}=await state.supabase.from('consensus').upsert({...payload,project_id:state.project.id,assignment_id:item.a.id},{onConflict:'assignment_id'});if(error)return toast(error.message);toast(existing&&existing.proposed_by!==state.user.id?'Consensus confirmed':'Consensus proposed');showCase(item,coders);};
}
async function loadNotes(id){const {data,error}=await state.supabase.from('discussion_notes').select('body,user_id,created_at').eq('assignment_id',id).order('created_at');if(error)return toast(error.message);$('#notes').innerHTML=(data||[]).map(n=>`<div class="note">${esc(n.body)}<small>${n.user_id===state.user.id?'You':'Partner'} · ${new Date(n.created_at).toLocaleString()}</small></div>`).join('')||'<p class="sub">No discussion notes yet.</p>';}

function normRow(row){const out={};Object.entries(row).forEach(([k,v])=>out[String(k).trim()]=v);return out;}
function getGolden(row,key){const value=(row.__source||row)[key];return value===undefined||value===null?'':String(value).trim();}
function stratifiedPools(rows){const definitions=[['Agency','non_presence','golden_agency_presence','0'],['Agency','low','golden_agency_high_low','0'],['Agency','high','golden_agency_high_low','1'],['Inevitability','non_presence','golden_inevitability_presence','0'],['Inevitability','low','golden_inevitability_high_low','0'],['Inevitability','high','golden_inevitability_high_low','1']];return definitions.map(([dimension,category,labelColumn,label])=>({dimension,category,rows:rows.filter(r=>category==='non_presence'?getGolden(r,labelColumn)===label:getGolden(r,`golden_${dimension.toLowerCase()}_presence`)==='1'&&getGolden(r,labelColumn)===label)}));}
async function renderData(){const root=$('#content');if(state.project.owner_id!==state.user.id){root.innerHTML=pageHead('PROJECT DATA','Managed by the project owner','Your assignments and coding queue are ready in Independent coding.')+'<div class="panel empty"><div class="icon">⌁</div><h3>Data import and sampling are owner-only</h3><p>The owner uploads the golden-label workbook, draws the sample, and exports the final workbook. Your blind labels remain private.</p></div>';return;}root.innerHTML=pageHead('PROJECT SETUP','Import, sample, and manage data','Upload the golden-label Excel workbook, draw reproducible balanced samples, and invite your second coder.')+`<div class="grid"><section class="panel"><h2>1 · Import golden-label workbook</h2><p class="sub">Excel is parsed in your browser. Source labels are stored separately from coder-visible sentence text.</p><div class="field"><label>Workbook (.xlsx)</label><input id="xlsxFile" type="file" accept=".xlsx,.xls"></div><div class="notice">Expected columns include <code>sentence</code> and golden labels: <code>golden_agency_presence</code>, <code>golden_agency_high_low</code>, <code>golden_inevitability_presence</code>, <code>golden_inevitability_high_low</code>.</div><button class="button" id="importWorkbook">Import workbook</button><div id="importStatus" class="sub"></div></section><section class="panel"><h2>2 · Draw a balanced sample</h2><p class="sub">Each of six strata gets exactly a rows. Sampling is without replacement and uses the seed you provide.</p><div class="grid"><div class="field"><label>Seed number</label><input id="sampleSeed" type="number" value="2026"></div><div class="field"><label>Count per category (a)</label><input id="sampleCount" type="number" min="1" value="10"></div></div><div id="poolCounts" class="sub">Import a workbook to see eligible rows.</div><button class="button" id="drawSample">Draw & assign six strata</button></section></div><section class="panel"><div class="row" style="justify-content:space-between"><div><h2>3 · Invite your coding partner</h2><p class="sub">Share this code with the other coder. Both users sign in with separate accounts.</p></div><span class="pill violet">${esc(state.project.join_code)}</span></div><button class="button subtle" id="copyCode">Copy invite code</button></section><section class="panel"><div class="row" style="justify-content:space-between"><div><h2>Export results</h2><p class="sub">Download source labels, independent annotations, and confirmed consensus labels.</p></div><button id="exportWorkbook" class="button secondary">Export Excel</button></div></section>`;
  $('#copyCode').onclick=async()=>{await navigator.clipboard.writeText(state.project.join_code);toast('Invite code copied')};
  $('#importWorkbook').onclick=importWorkbook;
  $('#drawSample').onclick=drawSample;
  $('#exportWorkbook').onclick=exportWorkbook;
  try{const {data}=await state.supabase.from('gold_labels').select('golden_labels,sentence_id').eq('project_id',state.project.id);if(data?.length){const sentenceIds=data.map(x=>x.sentence_id);const {data:sentenceRows}=await state.supabase.from('sentences').select('id,external_id').in('id',sentenceIds);const ext=Object.fromEntries((sentenceRows||[]).map(x=>[x.id,x.external_id]));state.importRows=data.map(x=>({...x.golden_labels,__external_id:ext[x.sentence_id]}));renderPoolCounts(state.importRows)}}catch{}
}
function renderPoolCounts(rows){const pools=stratifiedPools(rows);$('#poolCounts').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Stratum</th><th>Eligible</th></tr></thead><tbody>${pools.map(p=>`<tr><td>${p.dimension}</td><td>${p.category}</td><td>${p.rows.length}</td></tr>`).join('')}</tbody></table></div>`;}
async function importWorkbook(){
  const file=$('#xlsxFile').files[0];
  if(!file)return toast('Choose the golden-label workbook');
  const status=$('#importStatus');status.textContent='Reading workbook…';
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}).map(normRow);
    if(!raw.length)throw Error('The first worksheet has no rows');
    const required=['sentence','golden_agency_presence','golden_agency_high_low','golden_inevitability_presence','golden_inevitability_high_low'];
    const missing=required.filter(k=>!(k in raw[0]));
    if(missing.length)throw Error(`Missing required columns: ${missing.join(', ')}`);
    state.importRows=raw.map((r,i)=>({...r,__external_id:String(i+2)}));
    renderPoolCounts(state.importRows);
    let imported=0;
    for(let start=0;start<state.importRows.length;start+=100){
      const chunk=state.importRows.slice(start,start+100);
      const sentences=chunk.map(r=>({project_id:state.project.id,external_id:r.__external_id,sentence:String(r.sentence)}));
      const {data:stored,error}=await state.supabase.from('sentences').upsert(sentences,{onConflict:'project_id,external_id'}).select('id,external_id');
      if(error)throw error;
      const byExternal=Object.fromEntries(stored.map(s=>[s.external_id,s.id]));
      const golden=chunk.map(r=>{
        const source=Object.fromEntries(Object.entries(r).filter(([k])=>k!=='__external_id'));
        return {project_id:state.project.id,sentence_id:byExternal[r.__external_id],golden_labels:source,source_data:source};
      });
      const res=await state.supabase.from('gold_labels').upsert(golden,{onConflict:'sentence_id'});
      if(res.error)throw res.error;
      imported+=chunk.length;
    }
    status.textContent=`Imported ${imported} rows. Pool sizes are shown below.`;toast(`Imported ${imported} rows`);
  }catch(e){status.textContent=e.message;toast(e.message)}
}
async function drawSample(){
  const rows=state.importRows;
  if(!rows?.length)return toast('Import or reselect the workbook first');
  const count=Number($('#sampleCount').value),seed=Number($('#sampleSeed').value);
  if(!Number.isInteger(count)||count<1||!Number.isInteger(seed))return toast('Enter an integer seed and positive count');
  const pools=stratifiedPools(rows),insufficient=pools.find(p=>p.rows.length<count);
  if(insufficient)return toast(`${insufficient.dimension}/${insufficient.category} has only ${insufficient.rows.length} eligible rows`);
  const {data:run,error:runError}=await state.supabase.from('sample_runs').insert({project_id:state.project.id,seed,count_per_stratum:count,created_by:state.user.id}).select().single();
  if(runError)return toast(runError.message);
  const rng=mulberry32(seed),inserts=[];
  for(const pool of pools){
    const shuffled=[...pool.rows];
    for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    for(const row of shuffled.slice(0,count)){
      const {data:sentence,error}=await state.supabase.from('sentences').select('id').eq('project_id',state.project.id).eq('external_id',row.__external_id).single();
      if(error)return toast(`Could not map workbook row to imported sentence: ${error.message}`);
      inserts.push({project_id:state.project.id,sentence_id:sentence.id,dimension:pool.dimension,sample_run_id:run.id});
    }
  }
  const {error}=await state.supabase.from('assignments').insert(inserts);
  if(error)return toast(error.message);
  state.runId=run.id;await loadRuns();toast(`Assigned ${inserts.length} items (${count} per each of six categories)`);await renderView();
}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
async function exportWorkbook(){const {data:sentences,error}=await state.supabase.from('sentences').select('id,external_id,sentence').eq('project_id',state.project.id);if(error)return toast(error.message);const {data:gold}=await state.supabase.from('gold_labels').select('sentence_id,source_data').eq('project_id',state.project.id);const {data:assignments}=await state.supabase.from('assignments').select('*').eq('project_id',state.project.id);const {data:labels}=await state.supabase.from('annotations').select('*').eq('project_id',state.project.id);const {data:consensus}=await state.supabase.from('consensus').select('*').eq('project_id',state.project.id);const source=Object.fromEntries((gold||[]).map(g=>[g.sentence_id,g.source_data]));const byAssignment=Object.fromEntries((assignments||[]).map(a=>[a.id,a]));const output=(labels||[]).map(l=>{const assignment=byAssignment[l.assignment_id];const final=(consensus||[]).find(c=>c.assignment_id===l.assignment_id);return {...(source[assignment?.sentence_id]||{}),sentence:sentences.find(s=>s.id===assignment?.sentence_id)?.sentence,dimension:assignment?.dimension,coder_id:l.user_id,presence:l.presence?1:0,high_low:l.high_low===null?null:l.high_low?1:0,reasoning:l.reasoning,submitted_at:l.submitted_at,consensus_presence:final?.presence===undefined?null:Number(final.presence),consensus_high_low:final?.high_low===null||final?.high_low===undefined?null:Number(final.high_low),consensus_confirmed:!!final?.confirmed_at}});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(output),'Labels');XLSX.writeFile(wb,`${state.project.name.replace(/[^a-z0-9]+/gi,'_')}_coding_export.xlsx`);}

$('#nav').addEventListener('click',event=>{const btn=event.target.closest('[data-view]');if(!btn)return;state.view=btn.dataset.view;$$('.nav-item').forEach(x=>x.classList.toggle('active',x===btn));renderView()});
$('#signOut').onclick=async()=>{await state.supabase.auth.signOut();state.user=null;renderAuth()};
const cfg=storedConfig();if(cfg.url&&cfg.key)connect(cfg.url,cfg.key);else renderAuth();
