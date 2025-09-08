// Contacts-style top bar for lender page (All + More/Back, counts, community)
import { renderTable } from './table.js';
import { dom } from './domCache.js';

/* Status sets (main vs more) */
const MAIN = ['all','invite','sub-application','sub-docs','approved'];
const MORE = ['all','missing-docs','cannot-qualify'];

const S = { allContacts: [], mode:'main', status:'all', community:'all' };

/* Normalize lender status from contact.lenders[*].status */
function norm(raw){
  const s = String(raw||'').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('sub') && s.includes('application')) return 'sub-application';
  if (s.includes('sub') && s.includes('doc'))        return 'sub-docs';
  if (s.includes('missing') && s.includes('doc'))    return 'missing-docs';
  if (s.includes('cannot') && s.includes('qual'))    return 'cannot-qualify';
  return s; // invite, approved, etc.
}

/* Communities may be string or string[] */
function hasCommunity(c, val){
  if (val === 'all') return true;
  const cs = c?.communities;
  if (Array.isArray(cs)) return cs.includes(val);
  return cs === val;
}

function collectCommunities(list){
  const set = new Set();
  list.forEach(c=>{
    const cs = c?.communities;
    if (Array.isArray(cs)) cs.forEach(x=>x && set.add(x));
    else if (typeof cs==='string' && cs) set.add(cs);
  });
  return ['all', ...Array.from(set).sort()];
}

function buildPills(){
  const box = dom.statusFilters;
  box.innerHTML = '';
  const keys = (S.mode==='main'?MAIN:MORE);
  keys.forEach((key, i)=>{
    const btn = document.createElement('button');
    btn.className = `status-pill ${key}`;
    btn.dataset.status = key;
    if ((S.status===key) || (S.status==='all' && i===0)) btn.classList.add('active');
    btn.innerHTML = `<span class="label">${key.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
                     <span class="value" data-count="${key}">0</span>`;
    box.appendChild(btn);
  });
}

function wirePills(){
  dom.statusFilters.addEventListener('click', (e)=>{
    const btn = e.target.closest('.status-pill');
    if(!btn) return;
    dom.statusFilters.querySelectorAll('.status-pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    S.status = btn.dataset.status || 'all';
    applyFilters();
  });
}

function wireToggle(){
  const setLabel = ()=> dom.toggleMode.textContent = (S.mode==='main' ? 'More' : 'Back');
  setLabel();
  dom.toggleMode.addEventListener('click', ()=>{
    S.mode = (S.mode==='main') ? 'more' : 'main';
    S.status = 'all';
    buildPills();
    setLabel();
    applyFilters();
  });
}

function wireReset(){
  dom.resetBtn.addEventListener('click', ()=>{
    S.mode='main'; S.status='all'; S.community='all';
    dom.communitySel.value='all';
    buildPills();
    applyFilters();
  });
}

function populateCommunity(){
  dom.communitySel.innerHTML='';
  collectCommunities(S.allContacts).forEach(val=>{
    const opt=document.createElement('option');
    opt.value=val; opt.textContent=(val==='all'?'All Contacts':val);
    dom.communitySel.appendChild(opt);
  });
  dom.communitySel.value='all';
  dom.communitySel.addEventListener('change', ()=>{
    S.community = dom.communitySel.value;
    applyFilters();
  });
}

function countByStatus(list){
  const keys = new Set([...MAIN, ...MORE]);
  const m = {}; keys.forEach(k=>m[k]=0);
  m.all = list.length;
  list.forEach(c => {
    const k = norm(c._lenderStatus); // we’ll set this on ingest
    if (k && m[k]!=null) m[k]+=1;
  });
  return m;
}

function applyFilters(){
  // Scoped by community first
  const scoped = (S.community==='all') ? S.allContacts : S.allContacts.filter(c=>hasCommunity(c, S.community));

  // Then status
  let rows = scoped;
  if (S.status!=='all') rows = rows.filter(c => norm(c._lenderStatus) === S.status);

  renderTable(rows);

  // Update counts + total
  const counts = countByStatus(scoped);
  if (dom.countTotal) dom.countTotal.textContent = String(rows.length);
  document.querySelectorAll('#statusFilters .value').forEach(span=>{
    const key = span.getAttribute('data-count');
    span.textContent = String(counts[key] || 0);
  });
}

export function initTopBar(contacts){
  // Precompute a flat "_lenderStatus" per contact (from the matching lender entry)
  S.allContacts = (contacts||[]).map(c=>{
    const out = { ...c };
    // Keep raw for rendering; _lenderStatus only drives filters/counts
    // (table.js will read dates from the same lender slot)
    return out;
  });
  populateCommunity();
  buildPills();
  wirePills();
  wireToggle();
  wireReset();
  applyFilters();
}
