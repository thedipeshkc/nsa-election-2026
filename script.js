// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const ADMIN_CODE = "nsafall2026"; // change this before sharing the link
const DEFAULT_POSITIONS = ["President","Vice President","General Secretary","Treasurer","Event Coordinator","PR & Social Media Lead","Cultural Programs Lead"];

let positions = [];
let submissions = []; // {name,email,prefs:[],timestamp}
let candidates = {};  // { position: [name, name...] } — official candidates, set by admin
let votes = [];        // { email, name, choices: {position: candidateName}, timestamp }
let finalists = {};    // { position: name } — final locked-in winners
let votingOpen = false;

function switchTab(tab){
  document.getElementById('tabMember').classList.toggle('active', tab==='member');
  document.getElementById('tabVote').classList.toggle('active', tab==='vote');
  document.getElementById('tabAdmin').classList.toggle('active', tab==='admin');
  document.getElementById('memberView').style.display = tab==='member' ? 'block' : 'none';
  document.getElementById('voteView').style.display = tab==='vote' ? 'block' : 'none';
  document.getElementById('adminView').style.display = tab==='admin' ? 'block' : 'none';
  if(tab==='vote') loadVoteView();
}

async function loadPositions(){
  const ref = db.collection('config').doc('positions');
  const snap = await ref.get();
  if(snap.exists && snap.data().list){
    positions = snap.data().list;
  } else {
    positions = DEFAULT_POSITIONS.slice();
    await ref.set({ list: positions });
  }
}

function renderPrefFields(){
  const container = document.getElementById('prefFields');
  container.innerHTML = '';
  for(let i=0;i<3;i++){
    const row = document.createElement('div');
    row.className = 'pref-row';
    row.innerHTML = `
      <div class="pref-num">${i+1}</div>
      <select id="pref${i}">
        <option value="">Select a position</option>
        ${positions.map(p=>`<option value="${p}">${p}</option>`).join('')}
      </select>
    `;
    if(i===0){
      const lbl = document.createElement('label');
      lbl.textContent = 'Your top three position choices';
      container.appendChild(lbl);
    }
    container.appendChild(row);
  }
}

async function submitPreferences(){
  const name = document.getElementById('mName').value.trim();
  const email = document.getElementById('mEmail').value.trim().toLowerCase();
  const p0 = document.getElementById('pref0').value;
  const p1 = document.getElementById('pref1').value;
  const p2 = document.getElementById('pref2').value;
  const errEl = document.getElementById('formError');
  errEl.style.display = 'none';

  if(!name || !email){
    errEl.textContent = 'Please enter your name and email.';
    errEl.style.display = 'block';
    return;
  }
  if(!p0 || !p1 || !p2){
    errEl.textContent = 'Please select all three preferences.';
    errEl.style.display = 'block';
    return;
  }
  if(new Set([p0,p1,p2]).size !== 3){
    errEl.textContent = 'Your three preferences must be different positions.';
    errEl.style.display = 'block';
    return;
  }

  const record = { name, email, prefs:[p0,p1,p2], timestamp: Date.now() };
  try{
    await db.collection('submissions').doc(email).set(record);
    const card = document.getElementById('formCard');
    card.innerHTML = `
      <div class="success">
        <div class="check">✓</div>
        <h2>Preferences recorded</h2>
        <p style="color:var(--muted); margin-top:8px;">Thanks, ${escapeHtml(name.split(' ')[0])} — your choices are in. Submitting again with the same email will update your response. Once candidates are finalized, check the Vote tab to cast your ballot.</p>
        <button class="btn-secondary" style="margin-top:18px;" onclick="location.reload()">Submit another response</button>
      </div>
    `;
  }catch(e){
    console.error(e);
    errEl.textContent = 'Something went wrong saving your response. Please try again.';
    errEl.style.display = 'block';
  }
}

//  VOTE TAB

async function loadVoteView(){
  const container = document.getElementById('voteContent');
  container.innerHTML = '<div class="loading">Loading ballot…</div>';

  await loadPositions();

  try{
    const cSnap = await db.collection('config').doc('candidates').get();
    candidates = cSnap.exists ? (cSnap.data().map || {}) : {};
  }catch(e){ candidates = {}; }

  try{
    const vSnap = await db.collection('config').doc('votingStatus').get();
    votingOpen = vSnap.exists ? !!vSnap.data().open : false;
  }catch(e){ votingOpen = false; }

  const contested = positions.filter(p => (candidates[p]||[]).length > 1);
  const uncontested = positions.filter(p => (candidates[p]||[]).length === 1);

  if(Object.keys(candidates).length === 0 || (contested.length===0 && uncontested.length===0)){
    container.innerHTML = `<div class="card"><div class="empty-state">Candidates haven't been finalized yet. Check back once the advisory team publishes the official candidate list.</div></div>`;
    return;
  }

  if(!votingOpen){
    container.innerHTML = `<div class="card"><div class="empty-state">Voting isn't open yet. The candidate list is set — check back when the advisory team opens the ballot.</div></div>`;
    return;
  }

  if(contested.length === 0){
    container.innerHTML = `
      <div class="card">
        <h2>No vote needed</h2>
        <div class="sub">Every position is running unopposed this cycle — no ballot required.</div>
        <div class="candidate-pool" style="margin-top:10px;">
          ${uncontested.map(p => `<span class="badge">${escapeHtml(p)}: ${escapeHtml(candidates[p][0])}</span>`).join(' ')}
        </div>
      </div>
    `;
    return;
  }

  let html = `
    <div class="card">
      <h2>Cast Your Vote</h2>
      <div class="sub">Vote for any position you care about — you don't need to vote on all of them. Enter the same email you used for your membership; resubmitting updates your ballot until voting closes.</div>
      <label for="vName">Full name</label>
      <input type="text" id="vName" placeholder="e.g. Sujata Thapa">
      <label for="vEmail">Email</label>
      <input type="email" id="vEmail" placeholder="you@moreheadstate.edu">
  `;

  if(uncontested.length){
    html += `<label style="margin-top:24px;">Running unopposed</label>
      <div class="candidate-pool" style="margin-top:6px;">
        ${uncontested.map(p => `<span class="badge">${escapeHtml(p)}: ${escapeHtml(candidates[p][0])}</span>`).join(' ')}
      </div>`;
  }

  contested.forEach(pos => {
    html += `
      <label style="margin-top:22px;">${escapeHtml(pos)}</label>
      <div class="vote-options" data-position="${escapeAttr(pos)}">
        ${candidates[pos].map(name => `
          <label class="radio-row">
            <input type="radio" name="vote-${cssEscape(pos)}" value="${escapeAttr(name)}">
            <span>${escapeHtml(name)}</span>
          </label>
        `).join('')}
      </div>
    `;
  });

  html += `
      <div class="error" id="voteError"></div>
      <button class="btn-primary" onclick="submitVote()">Submit ballot</button>
    </div>
  `;
  container.innerHTML = html;
}

async function submitVote(){
  const name = document.getElementById('vName').value.trim();
  const email = document.getElementById('vEmail').value.trim().toLowerCase();
  const errEl = document.getElementById('voteError');
  errEl.style.display = 'none';

  if(!name || !email){
    errEl.textContent = 'Please enter your name and email.';
    errEl.style.display = 'block';
    return;
  }

  try{
    const subCheck = await db.collection('submissions').doc(email).get();
    if(!subCheck.exists){
      errEl.textContent = 'This email hasn\'t submitted preferences yet. Please submit your preferences in the Member Portal tab first, then come back to vote.';
      errEl.style.display = 'block';
      return;
    }
  }catch(e){
    console.error(e);
    errEl.textContent = 'Something went wrong verifying your membership. Please try again.';
    errEl.style.display = 'block';
    return;
  }

  const contested = positions.filter(p => (candidates[p]||[]).length > 1);
  const choices = {};
  contested.forEach(pos => {
    const checked = document.querySelector(`input[name="vote-${cssEscape(pos)}"]:checked`);
    if(checked){
      choices[pos] = checked.value;
    }
  });

  if(Object.keys(choices).length === 0){
    errEl.textContent = 'Please vote for at least one position.';
    errEl.style.display = 'block';
    return;
  }

  try{
    await db.collection('votes').doc(email).set({ name, email, choices, timestamp: Date.now() }, { merge: true });
    document.getElementById('voteContent').innerHTML = `
      <div class="card">
        <div class="success">
          <div class="check">✓</div>
          <h2>Ballot recorded</h2>
          <p style="color:var(--muted); margin-top:8px;">Thanks, ${escapeHtml(name.split(' ')[0])} — your vote is in. You can come back and resubmit with the same email if you change your mind or want to vote on more positions before voting closes.</p>
        </div>
      </div>
    `;
  }catch(e){
    console.error(e);
    errEl.textContent = 'Something went wrong recording your vote. Please try again.';
    errEl.style.display = 'block';
  }
}

function cssEscape(str){
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ADMIN

function checkPasscode(){
  const val = document.getElementById('passInput').value;
  const errEl = document.getElementById('gateError');
  if(val === ADMIN_CODE){
    document.getElementById('gateCard').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    loadAdminData();
  } else {
    errEl.textContent = 'Incorrect passcode.';
    errEl.style.display = 'block';
  }
}

async function loadAdminData(){
  await loadPositions();
  renderPosList();

  document.getElementById('submissionCount').textContent = 'Loading submissions…';
  try{
    const snap = await db.collection('submissions').get();
    submissions = snap.docs.map(d => d.data());
  }catch(e){ submissions = []; }

  try{
    const cSnap = await db.collection('config').doc('candidates').get();
    candidates = cSnap.exists ? (cSnap.data().map || {}) : {};
  }catch(e){ candidates = {}; }

  try{
    const vSnap = await db.collection('config').doc('votingStatus').get();
    votingOpen = vSnap.exists ? !!vSnap.data().open : false;
  }catch(e){ votingOpen = false; }

  try{
    const voteSnap = await db.collection('votes').get();
    votes = voteSnap.docs.map(d => d.data());
  }catch(e){ votes = []; }

  try{
    const fSnap = await db.collection('config').doc('finalists').get();
    finalists = fSnap.exists ? (fSnap.data().map || {}) : {};
  }catch(e){ finalists = {}; }

  renderSubmissions();
  renderTally();
  renderCandidateSelector();
  renderVotingControl();
  renderVoteTally();
  renderVotesTable();
  renderRoster();
}

function renderPosList(){
  const el = document.getElementById('posList');
  el.innerHTML = positions.map(p => `
    <div class="pos-chip">${escapeHtml(p)} <button onclick="removePosition('${escapeAttr(p)}')">✕</button></div>
  `).join('') || '<span style="color:var(--muted); font-size:13px;">No positions yet — add one below.</span>';
}

async function addPosition(){
  const input = document.getElementById('newPosInput');
  const val = input.value.trim();
  if(!val) return;
  if(positions.includes(val)){ input.value=''; return; }
  positions.push(val);
  await db.collection('config').doc('positions').set({ list: positions });
  input.value = '';
  renderPosList();
  renderCandidateSelector();
}

async function removePosition(name){
  positions = positions.filter(p => p !== name);
  await db.collection('config').doc('positions').set({ list: positions });
  renderPosList();
  renderCandidateSelector();
}

function renderSubmissions(){
  document.getElementById('submissionCount').textContent =
    submissions.length === 0 ? 'No submissions yet.' : `${submissions.length} member${submissions.length===1?'':'s'} have submitted preferences.`;

  const tbody = document.getElementById('subTableBody');
  const sorted = [...submissions].sort((a,b)=>b.timestamp-a.timestamp);
  tbody.innerHTML = sorted.map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td><span class="badge">${escapeHtml(s.prefs[0]||'—')}</span></td>
      <td>${escapeHtml(s.prefs[1]||'—')}</td>
      <td>${escapeHtml(s.prefs[2]||'—')}</td>
      <td style="color:var(--muted); font-size:12px;">${new Date(s.timestamp).toLocaleString()}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="empty-state">No one has submitted yet. Once the bulk email goes out, responses will appear here.</td></tr>`;
}

function renderTally(){
  const grid = document.getElementById('tallyGrid');
  if(positions.length === 0){
    grid.innerHTML = '<div class="empty-state">Add positions above to see interest breakdowns.</div>';
    return;
  }
  grid.innerHTML = positions.map(pos => {
    const c1 = submissions.filter(s=>s.prefs[0]===pos).length;
    const c2 = submissions.filter(s=>s.prefs[1]===pos).length;
    const c3 = submissions.filter(s=>s.prefs[2]===pos).length;
    const total = c1+c2+c3;
    const max = Math.max(c1,c2,c3,1);
    return `
      <div class="tally-item">
        <div class="tally-head"><strong>${escapeHtml(pos)}</strong><span>${total} total mention${total===1?'':'s'}</span></div>
        <div class="bar-row"><span style="width:70px;">1st choice</span><div class="bar-track"><div class="bar-fill p1" style="width:${(c1/max)*100}%"></div></div><span>${c1}</span></div>
        <div class="bar-row"><span style="width:70px;">2nd choice</span><div class="bar-track"><div class="bar-fill p2" style="width:${(c2/max)*100}%"></div></div><span>${c2}</span></div>
        <div class="bar-row"><span style="width:70px;">3rd choice</span><div class="bar-track"><div class="bar-fill p3" style="width:${(c3/max)*100}%"></div></div><span>${c3}</span></div>
      </div>
    `;
  }).join('');
}

// Candidate selection (admin picks who officially runs)

function renderCandidateSelector(){
  const el = document.getElementById('candidateBlocks');
  if(positions.length === 0){
    el.innerHTML = '<div class="empty-state">No positions configured yet.</div>';
    return;
  }
  el.innerHTML = positions.map(pos => {
    const interested = submissions.filter(s => s.prefs.includes(pos));
    const currentCandidates = candidates[pos] || [];
    const chips = interested.map(s => {
      const rank = s.prefs.indexOf(pos) + 1;
      const isSelected = currentCandidates.includes(s.name);
      return `<div class="chip ${isSelected?'selected':''}" onclick="toggleCandidate('${escapeAttr(pos)}','${escapeAttr(s.name)}')">${escapeHtml(s.name)} <span class="tag">${rank===1?'1st':rank===2?'2nd':'3rd'} pick</span></div>`;
    }).join('');
    return `
      <div class="position-block">
        <div class="tally-head" style="margin-bottom:6px;">
          <strong>${escapeHtml(pos)}</strong>
          <span style="font-size:12px; color:var(--muted);">${currentCandidates.length} candidate${currentCandidates.length===1?'':'s'} selected</span>
        </div>
        <div class="candidate-pool">
          ${chips || '<span style="color:var(--muted); font-size:13px;">No one listed this as a preference yet.</span>'}
        </div>
      </div>
    `;
  }).join('');
}

async function toggleCandidate(pos, name){
  const list = candidates[pos] || [];
  if(list.includes(name)){
    candidates[pos] = list.filter(n => n !== name);
  } else {
    candidates[pos] = [...list, name];
  }
  await db.collection('config').doc('candidates').set({ map: candidates });
  renderCandidateSelector();
  renderVotingControl();
}

// Voting open/close control

function renderVotingControl(){
  const el = document.getElementById('votingControlArea');
  const contestedCount = positions.filter(p => (candidates[p]||[]).length > 1).length;
  el.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>
        <strong>${votingOpen ? 'Voting is open' : 'Voting is closed'}</strong>
        <div style="font-size:13px; color:var(--muted); margin-top:2px;">${contestedCount} contested position${contestedCount===1?'':'s'} will appear on the ballot.</div>
      </div>
      <button class="${votingOpen ? 'btn-secondary' : 'btn-primary'}" style="margin-top:0; width:auto;" onclick="toggleVoting()">${votingOpen ? 'Close voting' : 'Open voting'}</button>
    </div>
  `;
}

async function toggleVoting(){
  votingOpen = !votingOpen;
  await db.collection('config').doc('votingStatus').set({ open: votingOpen });
  renderVotingControl();
}

//Live vote tally + finalization

function renderVoteTally(){
  const el = document.getElementById('voteTallyGrid');
  const contested = positions.filter(p => (candidates[p]||[]).length > 1);
  if(contested.length === 0){
    el.innerHTML = '<div class="empty-state">No contested positions yet — select candidates above first.</div>';
    return;
  }
  el.innerHTML = `<div class="sub" style="margin-bottom:8px;">${votes.length} member${votes.length===1?'':'s'} have voted so far.</div>` +
  contested.map(pos => {
    const counts = candidates[pos].map(name => ({
      name,
      count: votes.filter(v => v.choices && v.choices[pos] === name).length
    }));
    const max = Math.max(...counts.map(c=>c.count), 1);
    const totalVotes = counts.reduce((sum,c)=>sum+c.count,0);
    const winner = finalists[pos];
    return `
      <div class="tally-item">
        <div class="tally-head">
          <strong>${escapeHtml(pos)}</strong>
          <span>${totalVotes} vote${totalVotes===1?'':'s'} cast${winner ? ' · <span class="locked-tag">Locked: '+escapeHtml(winner)+'</span>' : ''}</span>
        </div>
        ${counts.map(c => `
          <div class="bar-row"><span style="width:120px;">${escapeHtml(c.name)}</span><div class="bar-track"><div class="bar-fill p3" style="width:${(c.count/max)*100}%"></div></div><span>${c.count}</span></div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function renderVotesTable(){
  const tbody = document.getElementById('votesTableBody');
  if(!tbody) return;
  const sorted = [...votes].sort((a,b)=>b.timestamp-a.timestamp);
  tbody.innerHTML = sorted.map(v => {
    const choiceText = Object.entries(v.choices||{}).map(([pos,name]) => `${escapeHtml(pos)}: <strong>${escapeHtml(name)}</strong>`).join('<br>') || '—';
    return `
      <tr>
        <td>${escapeHtml(v.name)}</td>
        <td>${escapeHtml(v.email)}</td>
        <td>${choiceText}</td>
        <td style="color:var(--muted); font-size:12px;">${new Date(v.timestamp).toLocaleString()}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="4" class="empty-state">No votes recorded yet.</td></tr>`;
}

async function finalizeResults(){
  const contested = positions.filter(p => (candidates[p]||[]).length > 1);
  const uncontested = positions.filter(p => (candidates[p]||[]).length === 1);
  const ties = [];

  uncontested.forEach(pos => { finalists[pos] = candidates[pos][0]; });

  contested.forEach(pos => {
    const counts = candidates[pos].map(name => ({
      name,
      count: votes.filter(v => v.choices && v.choices[pos] === name).length
    }));
    const max = Math.max(...counts.map(c=>c.count));
    const topNames = counts.filter(c => c.count === max).map(c => c.name);
    if(topNames.length === 1 && max > 0){
      finalists[pos] = topNames[0];
    } else if(max === 0){
      // no votes cast yet, leave pending
    } else {
      ties.push(pos);
    }
  });

  await db.collection('config').doc('finalists').set({ map: finalists });
  renderVoteTally();
  renderRoster();

  const msgEl = document.getElementById('finalizeMsg');
  if(ties.length){
    msgEl.textContent = `Tie detected for: ${ties.join(', ')}. Use the "Override" dropdown next to that position in the Roster below to pick manually.`;
    msgEl.style.display = 'block';
  } else {
    msgEl.textContent = 'Results finalized — uncontested picks and clear winners are locked in.';
    msgEl.style.display = 'block';
  }
}

async function manualOverride(pos, name){
  if(!name) return;
  finalists[pos] = name;
  await db.collection('config').doc('finalists').set({ map: finalists });
  renderVoteTally();
  renderRoster();
}

function renderRoster(){
  const el = document.getElementById('rosterView');
  const filled = positions.filter(p => finalists[p]);
  if(filled.length === 0){
    el.innerHTML = '<div class="empty-state">No positions finalized yet. Use "Finalize results" above once voting closes.</div>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Position</th><th>Elected member</th><th></th></tr></thead>
      <tbody>
        ${positions.map(p => {
          const opts = (candidates[p]||[]);
          const overrideSelect = opts.length > 1 ? `
            <select onchange="manualOverride('${escapeAttr(p)}', this.value)" style="padding:6px 8px; font-size:12px;">
              <option value="">Override…</option>
              ${opts.map(n => `<option value="${escapeAttr(n)}" ${finalists[p]===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}
            </select>` : '';
          return `<tr><td>${escapeHtml(p)}</td><td>${finalists[p] ? '<strong>'+escapeHtml(finalists[p])+'</strong>' : '<span style="color:var(--muted);">Pending</span>'}</td><td>${overrideSelect}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function exportCSV(){
  const rows = [['Name','Email','1st Choice','2nd Choice','3rd Choice','Submitted At']];
  submissions.forEach(s => rows.push([s.name, s.email, s.prefs[0], s.prefs[1], s.prefs[2], new Date(s.timestamp).toISOString()]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nsa_fall2026_submissions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str){
  return String(str).replace(/'/g, "\\'");
}

// Init
(async function init(){
  await loadPositions();
  renderPrefFields();
})();