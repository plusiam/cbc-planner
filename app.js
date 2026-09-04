// =====================================================================
//  엔진 — 상태 관리 · 렌더링 · 자동 저장 · 내보내기
// =====================================================================
const STORAGE_KEY = 'cbc-design-worksheet-v1';
const SCHEMAS = { single: SCHEMA_SINGLE, fusion: SCHEMA_FUSION };

// 상태: 모드별로 f(단일 칸) / g(행 추가 표) / c(반복 카드) / k(점검표) 를 나눠 저장
let state = { mode: 'single', helpOpen: false, view: 'all', step: { single: 's0', fusion: 's0' }, refsOpen: false, single: emptyState(), fusion: emptyState() };

// 각 단계 머리에 붙는 "쓰는 순서" 힌트 (서식 안내문의 ①~⑦ / ①~⑨)
const ORDER_HINT = {
  single: { s0: '쓰는 순서 ③ 단원명 · ⑥ 설계 의도', s1: '쓰는 순서 ①·② — 여기서 시작', s2: '쓰는 순서 ④', s3: '쓰는 순서 ⑤ 차시 · ⑦ 흐름 확정' },
  fusion: { s0: '쓰는 순서 ⑧ 프로젝트명·설계 의도', s1: '쓰는 순서 ①~⑤ — 여기서 시작', s2: '쓰는 순서 ⑥', s3: '쓰는 순서 ⑦ 차시 · ⑨ 탐구 목록 확정' }
};
// 참조 패널에 띄울 칸 (앞 단계에서 정한 것)
const REFS = {
  single: [['단원명 (= 핵심 질문)', 'unit-name'], ['성취기준', 'standards'], ['핵심 개념', 'concept'], ['단원 수준 핵심 아이디어', 'idea-unit'], ['수행과제', 'task-name'], ['준거(S)', 'criteria']],
  fusion: [['프로젝트명', 'project-name'], ['성취기준', 'standards'], ['개념적 렌즈', 'lens'], ['단원 수준 핵심 아이디어', 'idea-unit'], ['핵심 질문', 'eq'], ['탐구 과제', 'tasks'], ['수행과제명', 'task-name'], ['준거(S)', 'criteria']]
};
function emptyState() { return { f: {}, g: {}, c: {}, k: {} }; }
const cur = () => state[state.mode];
const schema = () => SCHEMAS[state.mode];
const MODES = ['single', 'fusion'];
const isMode = m => m === 'single' || m === 'fusion';   // SCHEMAS[m] 검사는 'constructor' 같은 이름이 통과한다

// ---------- 유틸 ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const $ = sel => document.querySelector(sel);
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function autoGrow(el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; }
function growAll(root = document) { root.querySelectorAll('textarea').forEach(autoGrow); }

// ---------- 초기 행 데이터 ----------
// gridInitRows 는 schema-flat.js 에 있다. st 를 넘기면 현재 서식이 아닌 쪽 상태에도 쓸 수 있다.
function ensureGrid(block, st = cur()) {
  const g = st.g;
  if (!Array.isArray(g[block.id]) || g[block.id].length === 0) g[block.id] = gridInitRows(block);
  return g[block.id];
}
function ensureCards(block, st = cur()) {
  const c = st.c;
  if (!Array.isArray(c[block.id]) || c[block.id].length === 0)
    c[block.id] = Array.from({ length: block.init || 1 }, () => Object.fromEntries(block.fields.map(f => [f.key, ''])));
  return c[block.id];
}

// ---------- 렌더링 ----------
function helpHTML(html, open) {
  if (!html) return '';
  return `<details class="help"${open ? ' open' : ''}><summary>ⓘ 작성 안내</summary><div class="body">${html}</div></details>`;
}
function ta(attrs, value, ph, rows) {
  const a = Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<textarea ${a} rows="${rows || 1}" placeholder="${esc(ph || '')}">${esc(value)}</textarea>`;
}
function labelCell(row) {
  const cls = row.sub ? 'lbl2' : 'lbl';
  const sub2 = row.sub2 ? `<span class="small">${esc(row.sub2)}</span>` : '';
  return `<td class="${cls}">${esc(row.sub || row.label)}${sub2}</td>`;
}
function renderKV(block) {
  const f = cur().f, H = state.helpOpen;
  let html = '<table class="f"><colgroup><col style="width:120px"></colgroup>';
  const rows = block.rows;
  rows.forEach((r, i) => {
    let cells = '';
    if (r.group) {
      // 같은 group 이름이 이어지면 rowspan 으로 묶는다
      const first = i === 0 || rows[i - 1].group !== r.group;
      if (first) {
        let span = 1; while (rows[i + span] && rows[i + span].group === r.group) span++;
        cells += `<td class="lbl" rowspan="${span}">${esc(r.group)}</td>`;
      }
      cells += `<td class="lbl2" style="width:92px">${esc(r.sub)}</td>`;
      cells += `<td>${ta({ kind: 'f', key: r.key }, f[r.key] || '', r.ph, r.rows)}${helpHTML(r.help, H)}</td>`;
    } else {
      cells += labelCell(r);
      cells += `<td colspan="2">${ta({ kind: 'f', key: r.key }, f[r.key] || '', r.ph, r.rows)}${helpHTML(r.help, H)}</td>`;
    }
    html += `<tr>${cells}</tr>`;
  });
  return html + '</table>';
}
function renderInline(block) {
  const f = cur().f, H = state.helpOpen;
  let html = '<table class="f"><tr>';
  block.cells.forEach(c => {
    html += `<td class="lbl2" style="width:${c.lw || '90px'}">${esc(c.label)}</td>`;
    html += `<td${c.w ? ` style="width:${c.w}"` : ''}>${ta({ kind: 'f', key: c.key }, f[c.key] || '', c.ph, 1)}${helpHTML(c.help, H)}</td>`;
  });
  return html + '</tr></table>';
}
function renderGrid(block) {
  const rows = ensureGrid(block), H = state.helpOpen;
  let html = `<div class="grid-wrap"><table class="f"><thead><tr>`;
  block.cols.forEach(c => html += `<th${c.w ? ` style="width:${c.w}"` : ''}>${c.label}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach((row, ri) => {
    html += '<tr class="dyn">';
    block.keys.forEach((k, ci) => {
      const last = ci === block.keys.length - 1;
      html += `<td${last ? ' class="rel"' : ''}>${ta({ kind: 'g', grid: block.id, idx: ri, key: k }, row[k] || '', block.ph[ci], 1)}`;
      if (last) html += `<div class="rowtools no-print">
        <button title="위로" onclick="gridMove('${block.id}',${ri},-1)">↑</button>
        <button title="아래로" onclick="gridMove('${block.id}',${ri},1)">↓</button>
        <button title="아래에 행 추가" onclick="gridInsert('${block.id}',${ri})">+</button>
        <button class="del" title="행 삭제" onclick="gridDelete('${block.id}',${ri})">✕</button></div>`;
      html += '</td>';
    });
    html += '</tr>';
  });
  html += `</tbody></table></div><button class="add-row no-print" onclick="gridInsert('${block.id}',${rows.length - 1})">${esc(block.addLabel || '+ 행 추가')}</button>`;
  if (block.id === 'rubric') html += `<span class="badge muted" id="rubricBadge"></span>`;   // 준거 수 / 행 수 배지
  html += helpHTML(block.help, H);
  return html;
}
// 준거(S)의 번호 줄 수와 평가기준표 행 수를 대조
function updateRubricBadge() {
  const el = $('#rubricBadge'); if (!el) return;
  const m = cur();
  const n = (m.f['criteria'] || '').split(/\r?\n/).filter(l => /^\s*\d+\s*[)\].]/.test(l)).length;
  const rows = (m.g['rubric'] || []).length;
  if (!n) { el.className = 'badge muted'; el.textContent = `평가기준표 ${rows}행 · 준거(S)를 1) 2) 3) 번호로 쓰면 개수를 대조합니다`; return; }
  if (n === rows) { el.className = 'badge ok'; el.textContent = `✓ 준거 ${n}개 = 평가 요소 ${rows}행`; }
  else { el.className = 'badge warn'; el.textContent = `⚠ 준거 ${n}개 / 평가 요소 ${rows}행 — 개수를 맞추세요`; }
}
function renderCards(block) {
  const cards = ensureCards(block), H = state.helpOpen;
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  let html = block.note ? `<div class="caption">${esc(block.title)} <span class="light">— ${esc(block.note)}</span></div>` : '';
  cards.forEach((card, ci) => {
    html += `<div class="card"><div class="card-head"><span>${esc(block.title)} ${circled[ci] || (ci + 1)}</span>
      <span class="ct no-print">
        <button onclick="cardMove('${block.id}',${ci},-1)" title="위로">↑</button>
        <button onclick="cardMove('${block.id}',${ci},1)" title="아래로">↓</button>
        <button onclick="cardDelete('${block.id}',${ci})" title="삭제">✕</button></span></div>
      <table class="f">`;
    block.fields.forEach(fd => {
      html += `<tr><td class="lbl">${esc(fd.label)}</td><td>${ta({ kind: 'c', cards: block.id, idx: ci, key: fd.key }, card[fd.key] || '', fd.ph, fd.rows)}${helpHTML(fd.help, H)}</td></tr>`;
    });
    html += '</table></div>';
  });
  html += `<button class="add-row no-print" onclick="cardAdd('${block.id}')">${esc(block.addLabel || '+ 추가')}</button>`;
  return html;
}
function renderChecks(block) {
  const k = cur().k;
  let total = 0, done = 0;
  let body = '<table class="f">';
  block.groups.forEach((g, gi) => {
    body += `<tr><td class="lbl2" style="width:92px">${esc(g.label)}</td><td><ul class="checks">`;
    g.items.forEach((it, ii) => {
      const id = `${block.id}-${gi}-${ii}`; total++; if (k[id]) done++;
      body += `<li class="${k[id] ? 'done' : ''}"><input type="checkbox" id="ck-${id}" data-kind="k" data-key="${id}"${k[id] ? ' checked' : ''}><label for="ck-${id}">${it}</label></li>`;
    });
    body += '</ul></td></tr>';
  });
  body += '</table>';
  const pct = total ? Math.round(done / total * 100) : 0;
  return `<div class="check-meter"><span>점검 ${done} / ${total}</span><div class="bar"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>` + body;
}
function renderBlock(block) {
  switch (block.type) {
    case 'note': return `<details class="note"${(block.open || state.helpOpen) ? ' open' : ''}><summary>${block.title}</summary><div class="body">${block.html}</div></details>`;
    case 'caption': return `<div class="caption">${block.html}</div>`;
    case 'kv': return renderKV(block);
    case 'inline': return renderInline(block);
    case 'grid': return renderGrid(block);
    case 'cards': return renderCards(block);
    case 'checks': return renderChecks(block);
  }
  return '';
}
function blockId(si, bi) { return `blk-${si}-${bi}`; }
function renderAll() {
  const s = schema();
  document.body.dataset.mode = state.mode;
  $('#modeSingle').classList.toggle('on', state.mode === 'single');
  $('#modeFusion').classList.toggle('on', state.mode === 'fusion');
  let html = `<div class="doc-head"><div class="mode-tag">${esc(s.tag)}</div><h1>${esc(s.title)} — ${esc(s.tag)}</h1><div class="sub">${esc(s.sub)}</div></div>`;
  const hints = ORDER_HINT[state.mode] || {};
  s.sections.forEach((sec, si) => {
    // 안내(intro) 섹션은 0단계와 함께 보이도록 같은 sec 그룹으로 묶는다
    const group = sec.id === 'intro' ? 's0' : sec.id;
    html += `<section class="sec" id="sec-${sec.id}" data-sec="${group}">`;
    if (sec.title) html += `<h2 class="stage">${esc(sec.title)}${hints[sec.id] ? `<span class="stage-order">${esc(hints[sec.id])}</span>` : ''}</h2>`;
    sec.blocks.forEach((b, bi) => html += `<div id="${blockId(si, bi)}" data-si="${si}" data-bi="${bi}">${renderBlock(b)}</div>`);
    if (sec.id !== 'intro') html += `<div class="sec-nav no-print"><button class="btn" onclick="stepMove(-1)">‹ 이전 단계</button><button class="btn primary" onclick="stepMove(1)">다음 단계 ›</button></div>`;
    html += `</section>`;
  });
  html += `<div class="foot">개념 기반 프로젝트 설계 웹학습지 · 입력 내용은 이 브라우저에만 저장됩니다(자동 저장). 다른 기기에서 이어 쓰려면 「작업 파일(.json) 저장」을 이용하세요.<br>
    © 룰루랄라 한기쌤 (여한기 / GitHub: <a href="https://github.com/plusiam" target="_blank" rel="noopener">plusiam</a>) · CC BY-NC 4.0</div>`;
  $('#sheet').innerHTML = html;
  applyView(false);
  renderSteps();
  updateRubricBadge();
  renderRefs();
}

// ---------- 단계 내비게이션 ----------
function stepList() { return schema().sections.filter(s => s.id !== 'intro'); }
function curStep() { return state.step[state.mode] || 's0'; }
const SHORT_NAMES = { s0: '표지·기본 정보', s1: '교육과정 분석', s2: '평가 계획', s3: '학습 계획', check: '탈고 점검' };
function shortTitle(sec) {
  // "2단계 · 평가 계획 수립하기" → 번호 "2" + 짧은 이름
  const m = sec.title.match(/^(\d)단계/);
  return { num: m ? m[1] : '✓', name: SHORT_NAMES[sec.id] || sec.title };
}
// 섹션별 진행률: kv/inline 칸, grid 행, cards 카드 단위로 "채움/전체"
function sectionProgress(sec) {
  const m = cur(); let total = 0, done = 0;
  sec.blocks.forEach(b => {
    if (b.type === 'kv') b.rows.forEach(r => { total++; if ((m.f[r.key] || '').trim()) done++; });
    else if (b.type === 'inline') b.cells.forEach(c => { total++; if ((m.f[c.key] || '').trim()) done++; });
    else if (b.type === 'grid') {
      const init = gridInitRows(b);
      (m.g[b.id] || init).forEach((row, i) => {
        total++;
        const filled = b.keys.some(k => (row[k] || '').trim() && (row[k] || '') !== ((init[i] || {})[k] || ''));
        if (filled) done++;
      });
    } else if (b.type === 'cards') (m.c[b.id] || []).forEach(card => { total++; if (Object.values(card).some(v => (v || '').trim())) done++; });
    else if (b.type === 'checks') b.groups.forEach((g, gi) => g.items.forEach((it, ii) => { total++; if (m.k[`${b.id}-${gi}-${ii}`]) done++; }));
  });
  return { total, done };
}
function renderSteps() {
  const list = stepList(), active = curStep();
  $('#steps').innerHTML = list.map(sec => {
    const t = shortTitle(sec), p = sectionProgress(sec);
    const full = p.total && p.done === p.total;
    return `<button class="step${sec.id === active ? ' on' : ''}${full ? ' full' : ''}" onclick="setStep('${sec.id}', true)" title="${esc(sec.title)}">
      <span class="num">${t.num}</span><span>${esc(t.name)}</span><span class="prog">${p.done}/${p.total}</span></button>`;
  }).join('');
  const idx = list.findIndex(s => s.id === active);
  $('#prevBtn').disabled = idx <= 0; $('#nextBtn').disabled = idx >= list.length - 1;
  $('#viewAll').classList.toggle('on', state.view === 'all');
  $('#viewStep').classList.toggle('on', state.view === 'step');
}
function applyView(scroll) {
  document.body.classList.toggle('step-view', state.view === 'step');
  const active = curStep();
  document.querySelectorAll('section.sec').forEach(sec => sec.classList.toggle('active', sec.dataset.sec === active));
  if (state.view === 'step') document.querySelectorAll('section.sec.active').forEach(sec => growAll(sec));  // display:none 상태였던 칸 높이 재계산
  else growAll();
  if (scroll) {
    if (state.view === 'step') window.scrollTo({ top: 0 });
    else { const el = $('#sec-' + active); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
}
function setStep(id, scroll = true) { state.step[state.mode] = id; applyView(scroll); renderSteps(); saveNow(); }
function stepMove(d) {
  const list = stepList(), i = list.findIndex(s => s.id === curStep()), j = i + d;
  if (j < 0 || j >= list.length) return;
  setStep(list[j].id, true);
}
function setView(v) { if (state.view === v) return; state.view = v; applyView(true); renderSteps(); saveNow(); }
// 고정 영역(툴바+단계바) 높이 — 화면 폭에 따라 툴바가 줄바꿈하므로 상수로 둘 수 없다.
// CSS 의 section.sec { scroll-margin-top } 과 아래 스크롤 스파이가 이 값을 쓴다.
let topbarH = 96;
function syncTopbarH() {
  const el = $('.topbar'); if (!el) return;
  topbarH = Math.round(el.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--topbar-h', topbarH + 'px');
}
if (window.ResizeObserver) new ResizeObserver(syncTopbarH).observe($('.topbar'));
// 웹폰트가 늦게 적용되면서 줄 높이가 바뀌는데 ResizeObserver 가 이를 놓치는 경우가 있다
if (document.fonts) document.fonts.ready.then(syncTopbarH);

// 전체 보기에서 스크롤에 따라 현재 단계 탭을 따라가게
let scrollTick = false;
window.addEventListener('scroll', () => {
  if (state.view !== 'all' || scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    const secs = Array.from(document.querySelectorAll('section.sec')).filter(s => s.dataset.sec);
    let best = null;
    secs.forEach(s => { if (s.getBoundingClientRect().top <= topbarH + 34) best = s.dataset.sec; });
    if (best && best !== curStep()) { state.step[state.mode] = best; renderSteps(); scheduleSave(); }
  });
}, { passive: true });

// ---------- 참조 패널 ----------
function renderRefs() {
  const body = $('#refbody'); if (!body) return;
  const m = cur();
  body.innerHTML = (REFS[state.mode] || []).map(([label, key]) => {
    const v = (m.f[key] || '').trim();
    return `<div class="ri"><div class="rl">${esc(label)}</div><div class="rv${v ? '' : ' empty'}">${esc(v || '아직 비어 있음')}</div></div>`;
  }).join('');
}
function toggleRefs() {
  state.refsOpen = !state.refsOpen;
  $('#refpanel').classList.toggle('open', state.refsOpen);
  if (state.refsOpen) renderRefs();
  saveNow();
}
function rerenderBlock(blockIdStr) {
  // 특정 블록(id로 찾음)만 다시 그린다 — 행 추가/삭제 뒤 사용
  const s = schema();
  s.sections.forEach((sec, si) => sec.blocks.forEach((b, bi) => {
    if (b.id === blockIdStr) { const el = $('#' + blockId(si, bi)); el.innerHTML = renderBlock(b); growAll(el); }
  }));
  if (blockIdStr === 'rubric') updateRubricBadge();
  renderSteps();
}
function findBlock(id, m = state.mode) { for (const sec of SCHEMAS[m].sections) for (const b of sec.blocks) if (b.id === id) return b; }
// 점검표는 블록째 다시 그리면 체크박스 DOM 이 새로 만들어져 포커스가 날아간다.
// (Tab·Space 로 항목을 훑을 수 없게 된다) 그래서 진행률 미터만 고쳐 그린다.
function updateCheckMeter(blockEl) {
  const meter = blockEl && blockEl.querySelector('.check-meter'); if (!meter) return;
  const boxes = blockEl.querySelectorAll('input[type=checkbox][data-kind="k"]');
  const total = boxes.length, done = [...boxes].filter(b => b.checked).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  meter.children[0].textContent = `점검 ${done} / ${total}`;
  meter.querySelector('.bar i').style.width = pct + '%';
  meter.children[2].textContent = pct + '%';
}

// ---------- 행/카드 조작 ----------
function gridInsert(id, after) {
  const b = findBlock(id), rows = ensureGrid(b);
  rows.splice(after + 1, 0, Object.fromEntries(b.keys.map(k => [k, ''])));
  rerenderBlock(id); scheduleSave();
}
function gridDelete(id, i) {
  const rows = ensureGrid(findBlock(id));
  if (rows.length <= 1) { toast('마지막 행은 지울 수 없습니다'); return; }
  if (Object.values(rows[i]).some(v => v.trim()) && !confirm('이 행의 내용을 지울까요?')) return;
  rows.splice(i, 1); rerenderBlock(id); scheduleSave();
}
function gridMove(id, i, d) {
  const rows = ensureGrid(findBlock(id)), j = i + d;
  if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]]; rerenderBlock(id); scheduleSave();
}
function cardAdd(id) {
  const b = findBlock(id), cards = ensureCards(b);
  cards.push(Object.fromEntries(b.fields.map(f => [f.key, ''])));
  rerenderBlock(id); scheduleSave();
}
function cardDelete(id, i) {
  const cards = ensureCards(findBlock(id));
  if (cards.length <= 1) { toast('마지막 카드는 지울 수 없습니다'); return; }
  if (Object.values(cards[i]).some(v => v.trim()) && !confirm('이 탐구 목록의 내용을 지울까요?')) return;
  cards.splice(i, 1); rerenderBlock(id); scheduleSave();
}
function cardMove(id, i, d) {
  const cards = ensureCards(findBlock(id)), j = i + d;
  if (j < 0 || j >= cards.length) return;
  [cards[i], cards[j]] = [cards[j], cards[i]]; rerenderBlock(id); scheduleSave();
}

// ---------- 입력 → 상태 반영 ----------
document.addEventListener('input', e => {
  const el = e.target;
  if (el.tagName !== 'TEXTAREA') return;
  autoGrow(el);
  const d = el.dataset, m = cur();
  if (d.kind === 'f') m.f[d.key] = el.value;
  else if (d.kind === 'g') m.g[d.grid][+d.idx][d.key] = el.value;
  else if (d.kind === 'c') m.c[d.cards][+d.idx][d.key] = el.value;
  if (d.key === 'criteria') updateRubricBadge();
  if (state.refsOpen && d.kind === 'f') renderRefs();
  scheduleSave();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.type === 'checkbox' && el.dataset.kind === 'k') {
    cur().k[el.dataset.key] = el.checked;
    el.closest('li').classList.toggle('done', el.checked);
    updateCheckMeter(el.closest('[data-si]'));
    renderSteps(); scheduleSave();
  }
});
document.addEventListener('click', e => { if (!e.target.closest('.dd')) closeMenu(); });
window.addEventListener('resize', () => growAll());

// ---------- 저장/불러오기 (localStorage) ----------
let saveTimer;
function setStatus(txt, ok) { const s = $('#saveStatus'); s.textContent = txt; s.classList.toggle('saved', !!ok); }
function scheduleSave() { clearTimeout(saveTimer); setStatus('⏳ 저장 중…', false); saveTimer = setTimeout(() => { saveNow(); renderSteps(); }, 700); }
function saveNow() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStatus('✅ 자동 저장됨', true); }
  catch (e) { setStatus('⚠️ 저장 실패', false); }
}
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
    const s = JSON.parse(raw);
    state.mode = s.mode === 'fusion' ? 'fusion' : 'single';
    state.helpOpen = !!s.helpOpen;
    state.view = s.view === 'step' ? 'step' : 'all';
    if (s.step && typeof s.step === 'object') state.step = Object.assign({ single: 's0', fusion: 's0' }, s.step);
    state.refsOpen = !!s.refsOpen;
    ['single', 'fusion'].forEach(m => { state[m] = Object.assign(emptyState(), s[m] || {}); });
    setStatus('✅ 불러오기 완료', true);
  } catch (e) { console.warn('저장 데이터 복원 실패', e); }
}

// ---------- 툴바 동작 ----------
function setMode(m) {
  if (!isMode(m)) return { ok: false, reason: "서식은 'single' 또는 'fusion'" };
  if (state.mode !== m) { state.mode = m; renderAll(); saveNow(); window.scrollTo({ top: 0 }); }
  return { ok: true, mode: m };
}
function toggleAllHelp() {
  state.helpOpen = !state.helpOpen;
  document.querySelectorAll('details.help, details.note').forEach(d => d.open = state.helpOpen);
  $('#helpBtn').textContent = state.helpOpen ? 'ⓘ 안내 접기' : 'ⓘ 안내 펼치기';
  saveNow();
}
function resetMode() {
  const name = schema().tag;
  if (!confirm(`「${name}」 서식의 입력 내용을 모두 지울까요?\n(다른 서식의 내용은 유지됩니다)`)) return;
  state[state.mode] = emptyState(); renderAll(); saveNow(); toast(`${name} 내용을 초기화했습니다`);
}
function toggleMenu() { $('#ddMenu').classList.toggle('open'); }
function closeMenu() { $('#ddMenu').classList.remove('open'); }

// ---------- 파일 이름 ----------
function docName() {
  const n = (cur().f[schema().nameKey] || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  return (n || '개념기반_프로젝트_설계안') + '_' + schema().tag + '_' + new Date().toISOString().slice(0, 10);
}
function download(name, content, type) {
  const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 마크다운 (노트북LM·AI 붙여넣기용) ----------
function strip(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
const mdCell = v => String(v || '').trim().replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
function toMarkdown() {
  const s = schema(), m = cur(), out = [];
  out.push(`# ${s.title} (${s.tag})`, '');
  s.sections.forEach(sec => {
    if (sec.id === 'intro') return;
    out.push(`## ${sec.title}`, '');
    sec.blocks.forEach(b => {
      if (b.type === 'caption') { out.push(`### ${strip(b.html)}`, ''); return; }
      if (b.type === 'kv') {
        b.rows.forEach(r => {
          const label = r.group ? `${r.group} — ${r.sub}` : r.label + (r.sub2 ? ' ' + r.sub2 : '');
          const v = (m.f[r.key] || '').trim();
          out.push(`**${label}**`, v ? v : '(미작성)', '');
        });
        return;
      }
      if (b.type === 'inline') { b.cells.forEach(c => out.push(`- **${c.label}**: ${(m.f[c.key] || '').trim() || '(미작성)'}`)); out.push(''); return; }
      if (b.type === 'grid') {
        const rows = m.g[b.id] || [];
        out.push('| ' + b.cols.map(c => strip(c.label)).join(' | ') + ' |', '|' + b.cols.map(() => ' --- ').join('|') + '|');
        rows.forEach(r => out.push('| ' + b.keys.map(k => mdCell(r[k])).join(' | ') + ' |'));
        out.push('');
        return;
      }
      if (b.type === 'cards') {
        (m.c[b.id] || []).forEach((card, i) => {
          out.push(`### ${b.title} ${i + 1}`, '');
          b.fields.forEach(f => out.push(`**${f.label}**`, (card[f.key] || '').trim() || '(미작성)', ''));
        });
        return;
      }
      if (b.type === 'checks') {
        b.groups.forEach((g, gi) => {
          out.push(`**${g.label}**`);
          g.items.forEach((it, ii) => out.push(`- [${m.k[`${b.id}-${gi}-${ii}`] ? 'x' : ' '}] ${strip(it)}`));
          out.push('');
        });
      }
    });
  });
  return out.join('\n');
}
async function copyMarkdown() {
  const md = toMarkdown();
  try { await navigator.clipboard.writeText(md); toast('작성 내용을 마크다운으로 복사했습니다 — 노트북LM에 붙여넣으세요'); }
  catch (e) { download(docName() + '.md', md, 'text/markdown;charset=utf-8'); toast('클립보드를 쓸 수 없어 .md 파일로 저장했습니다'); }
}
function downloadMarkdown() { download(docName() + '.md', toMarkdown(), 'text/markdown;charset=utf-8'); toast('마크다운 파일을 저장했습니다'); }

// ---------- JSON 작업 파일 ----------
// 이 형식이 붙여넣기·URL·WebMCP 가 공유하는 정본이다 (계획 API 참고)
function planPayload() {
  return { app: 'cbc-design-worksheet', version: 1, savedAt: new Date().toISOString(), mode: state.mode, single: state.single, fusion: state.fusion };
}
function downloadJSON() {
  download(docName() + '.json', JSON.stringify(planPayload(), null, 2), 'application/json;charset=utf-8');
  toast('작업 파일을 저장했습니다 (단일·융합 두 서식 모두 포함)');
}
function importJSON(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.app !== 'cbc-design-worksheet') throw new Error('형식이 다른 파일');
      if (!confirm('작업 파일을 불러오면 현재 입력 내용을 덮어씁니다. 계속할까요?')) return;
      const r = applyPlan(d, { merge: false });
      toast('작업 파일을 불러왔습니다' + (r.rejected.length ? ` (서식에 없는 항목 ${r.rejected.length}건은 건너뜀)` : ''));
    } catch (e) { alert('이 웹학습지에서 저장한 작업 파일(.json)이 아닙니다.'); }
    // 취소하고 나가는 길에서도 비워야 같은 파일을 다시 고를 때 change 가 뜬다
    finally { input.value = ''; }
  };
  reader.readAsText(file, 'utf-8');
}

// ---------- AI 프롬프트 팩 ----------
// 교사가 채팅(Claude·ChatGPT·Gemini·NotebookLM)에 붙여 넣는 안내문. 링크를 못 여는 AI 도 형식은 맞추도록
// 칸 키 목록을 인라인으로 넣고, 작성 규칙(help)은 schema.json 이 더한다. 학생 개인정보는 넣지 말라고 못 박는다.
function promptPack(mode = state.mode) {
  const S = getSchema().modes[mode];
  const url = new URL('schema.json', location.href).href;   // 코드에는 상대 경로만 두고 주소는 실행 시점에 만든다
  const keyLines = S.sections.filter(sec => sec.fields.some(f => f.kind === 'f'))
    .map(sec => `· ${sec.title.replace(/\s*·.*$/, '')} — ` + sec.fields.filter(f => f.kind === 'f').map(f => `${f.key}(${f.label})`).join(' '));
  const all = S.sections.flatMap(s => s.fields);
  const tables = all.filter(f => f.kind === 'g').map(f => `g.${f.id}[${f.columns.map(c => c.key).join(',')}] ${f.label}`);
  const cards = all.filter(f => f.kind === 'c').map(f => `c.${f.id}[${f.fields.map(x => x.key).join(',')}] ${f.label}`);
  const example = { app: 'cbc-design-worksheet', version: 1, mode, [mode]: { f: { [S.nameKey]: '…' }, g: { rubric: [{ item: '…', high: '…', mid: '…', low: '…' }] }, c: {}, k: {} } };
  return [
    `[cbc-planner 설계안 요청 — ${S.tag}]`,
    `당신은 초등 교사의 「${S.title}」(${S.tag}) 작성을 돕습니다. 제가 주는 자료로 아래 서식의 칸을 채우고,`,
    `cbc-planner 웹학습지가 바로 읽는 JSON 한 덩이로 출력해 주세요.`,
    ``,
    `■ 서식과 작성 규칙`,
    `- 칸 목록·작성 안내·점검표 전체: ${url}  (열 수 없으면 제가 파일로 첨부합니다)`,
    `  각 칸의 help 가 작성 규칙입니다. 규칙에 맞게 쓸 수 없는 칸은 비워 두세요.`,
    `- 성취기준 코드와 원문은 제가 준 것만 그대로 씁니다. 지어내지 않습니다.`,
    `- 학생 실명·학급 명단·사진·연락처 등 개인정보는 어떤 칸에도 넣지 않습니다. 제 자료에 섞여 있어도 옮기지 마세요.`,
    ``,
    '■ 출력 형식 — ```json 코드 블록 하나만, 앞뒤 설명 없이',
    JSON.stringify(example),
    `- f: 한 칸 값(문자열, 줄바꿈은 \\n) · g: 표(행 객체의 배열) · c: 반복 카드 · k: 점검표(비워 둠)`,
    `- 모르는 칸은 넣지 않습니다(빈 문자열도 넣지 않음).`,
    ``,
    `■ 이 서식의 칸 — f 키(라벨)`,
    ...keyLines,
    `■ 표·카드 — 키 순서대로 열`,
    ...tables.concat(cards).map(t => `· ${t}`),
    ``,
    `■ 받은 뒤 — cbc-planner > 📥 내보내기 > 「AI 답변 붙여넣기로 불러오기」에 붙여넣습니다.`,
    ``,
    `■ 제 자료`,
    `(학년·교과·성취기준·단원 아이디어를 여기에 적습니다)`,
  ].join('\n');
}
async function copyPromptPack() {
  const txt = promptPack();
  try { await navigator.clipboard.writeText(txt); toast('AI용 안내문을 복사했습니다 — 채팅창에 붙여넣고 아래에 자료를 이어 적으세요'); }
  catch (e) { download('cbc-planner_AI안내문_' + schema().tag + '.txt', txt, 'text/plain;charset=utf-8'); toast('클립보드를 쓸 수 없어 .txt 파일로 저장했습니다'); }
}

// ---------- 계획 API (window.cbcPlanner) ----------
// 작업 파일·붙여넣기·URL·WebMCP 네 입구가 모두 이 함수들을 거친다. 형식은 작업 파일(.json)과 같다.
// 내용 문제로는 throw 하지 않고 rejected 목록으로 돌려준다 — 에이전트가 자기 실수(모르는 키, 서식 뒤바뀜)를 읽어야 한다.
let FLAT_SCHEMA;
function getSchema() { return FLAT_SCHEMA || (FLAT_SCHEMA = flattenSchema(SCHEMAS)); }
function getPlan() { return JSON.parse(JSON.stringify(planPayload())); }   // 깊은 복사 — 참조로 상태를 건드리지 못하게

// 서식별 유효 키 색인 — f: Set, g/c: {id → 열 키 배열}, k: Set
const PLAN_INDEX = {};
function planIndex(mode) {
  if (PLAN_INDEX[mode]) return PLAN_INDEX[mode];
  const ix = { f: new Set(), g: {}, c: {}, k: new Set() };
  getSchema().modes[mode].sections.forEach(sec => sec.fields.forEach(fd => {
    if (fd.kind === 'f') ix.f.add(fd.key);
    else if (fd.kind === 'g') ix.g[fd.id] = fd.columns.map(c => c.key);
    else if (fd.kind === 'c') ix.c[fd.id] = fd.fields.map(f => f.key);
    else if (fd.kind === 'k') fd.items.forEach(it => ix.k.add(it.id));
  }));
  return PLAN_INDEX[mode] = ix;
}
// 칸 값 강제 — 문자열만 받는다. 배열은 줄바꿈으로 잇는다(준거 1) 2) 3) 을 배열로 내는 AI 대응). 객체는 null(거절).
function str(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => str(x) ?? '').join('\n');
  if (typeof v === 'object') return null;
  return String(v);
}
// 표·카드의 행 하나를 정규화 — 배열이면 열 순서로, 객체면 키로. 모르는 열은 rejected 에 적고 행은 살린다.
function normRow(raw, keys, path, rejected) {
  const row = Object.fromEntries(keys.map(k => [k, '']));
  if (Array.isArray(raw)) { raw.forEach((v, i) => { if (i < keys.length) row[keys[i]] = str(v) ?? ''; }); return row; }
  if (!raw || typeof raw !== 'object') { rejected.push({ path, reason: '행은 객체 또는 배열이어야 합니다' }); return null; }
  for (const k of Object.keys(raw)) {
    if (!keys.includes(k)) { rejected.push({ path: `${path}.${k}`, reason: '표에 없는 열' }); continue; }
    const v = str(raw[k]); if (v === null) { rejected.push({ path: `${path}.${k}`, reason: '문자열이 아님' }); continue; }
    row[k] = v;
  }
  return row;
}
// 설계안 전체 반영. merge:false 는 서식을 비우고 새로 채움, merge:true 는 값이 있는 칸만 덮어씀(표·카드는 행이 하나라도 있으면 표째 교체).
function applyPlan(payload, { merge = false } = {}) {
  const rejected = [], applied = { f: 0, g: 0, c: 0, k: 0 };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return { ok: false, mode: state.mode, applied, rejected: [{ path: '', reason: 'JSON 객체가 아닙니다' }] };
  let mode = null;
  if (payload.mode !== undefined) { if (isMode(payload.mode)) mode = payload.mode; else rejected.push({ path: 'mode', reason: "서식은 'single' 또는 'fusion'" }); }
  for (const key of Object.keys(payload))
    if (!['app', 'version', 'savedAt', 'mode', 'single', 'fusion'].includes(key)) rejected.push({ path: key, reason: '알 수 없는 항목 — 서식 내용은 single/fusion 아래 f·g·c·k 에 둡니다' });
  for (const m of MODES) {
    const src = payload[m];
    if (src === undefined) continue;
    if (!src || typeof src !== 'object' || Array.isArray(src)) { rejected.push({ path: m, reason: '객체가 아닙니다' }); continue; }
    const ix = planIndex(m), dst = merge ? state[m] : emptyState();
    for (const bucket of Object.keys(src)) {
      if (!['f', 'g', 'c', 'k'].includes(bucket)) { rejected.push({ path: `${m}.${bucket}`, reason: '알 수 없는 구획 — f·g·c·k 만' }); continue; }
      const part = src[bucket];
      if (!part || typeof part !== 'object' || Array.isArray(part)) { rejected.push({ path: `${m}.${bucket}`, reason: '객체가 아닙니다' }); continue; }
      for (const id of Object.keys(part)) {
        const path = `${m}.${bucket}.${id}`, raw = part[id];
        if (bucket === 'f') {
          if (!ix.f.has(id)) { rejected.push({ path, reason: '서식에 없는 칸' }); continue; }
          const v = str(raw); if (v === null) { rejected.push({ path, reason: '문자열이 아님' }); continue; }
          if (merge && !v.trim()) continue;
          dst.f[id] = v; applied.f++;
        } else if (bucket === 'k') {
          if (!ix.k.has(id)) { rejected.push({ path, reason: '점검표에 없는 항목' }); continue; }
          dst.k[id] = !!raw; applied.k++;
        } else {
          const keys = ix[bucket][id];
          if (!keys) { rejected.push({ path, reason: bucket === 'g' ? '서식에 없는 표' : '서식에 없는 카드' }); continue; }
          if (!Array.isArray(raw)) { rejected.push({ path, reason: '행의 배열이어야 합니다' }); continue; }
          const rows = raw.map((r, i) => normRow(r, keys, `${path}[${i}]`, rejected)).filter(Boolean);
          if (!rows.length) continue;
          dst[bucket][id] = rows; applied[bucket] += rows.length;
        }
      }
    }
    state[m] = dst;
  }
  if (mode) state.mode = mode;
  renderAll(); saveNow();
  return { ok: true, mode: state.mode, applied, rejected };
}
// 아래 부분 setter 는 입력 핸들러와 같은 최소 갱신만 한다 — renderAll 은 포커스와 펼친 안내를 잃고 연속 호출 시 깜빡인다.
// 현재 서식이 아닌 쪽에 쓰면 상태와 저장만 바꾼다(전환할 때 renderAll 이 그린다).
function setField(mode, key, value) {
  mode = mode || state.mode;
  if (!isMode(mode)) return { ok: false, reason: "서식은 'single' 또는 'fusion'" };
  if (!planIndex(mode).f.has(key)) return { ok: false, reason: `서식에 없는 칸: ${key}` };
  const v = str(value); if (v === null) return { ok: false, reason: '값은 문자열이어야 합니다' };
  state[mode].f[key] = v;
  if (mode === state.mode) {
    const el = $(`#sheet textarea[data-kind="f"][data-key="${key}"]`);
    if (el) { el.value = v; autoGrow(el); }
    if (key === 'criteria') updateRubricBadge();
    if (state.refsOpen) renderRefs();
  }
  scheduleSave();
  return { ok: true, mode, key, value: v };
}
function addRow(mode, gridId, row) {
  mode = mode || state.mode;
  if (!isMode(mode)) return { ok: false, reason: "서식은 'single' 또는 'fusion'" };
  const b = findBlock(gridId, mode);
  if (!b || b.type !== 'grid') return { ok: false, reason: `서식에 없는 표: ${gridId}` };
  const rejected = [], nr = normRow(row || {}, b.keys, gridId, rejected);
  if (!nr) return { ok: false, reason: rejected[0].reason };
  const rows = ensureGrid(b, state[mode]); rows.push(nr);
  if (mode === state.mode) rerenderBlock(gridId);
  scheduleSave();
  return { ok: true, mode, gridId, index: rows.length - 1, rows: rows.length, rejected };
}
function addCard(mode, cardsId, card) {
  mode = mode || state.mode;
  if (!isMode(mode)) return { ok: false, reason: "서식은 'single' 또는 'fusion'" };
  const b = findBlock(cardsId, mode);
  if (!b || b.type !== 'cards') return { ok: false, reason: `서식에 없는 카드: ${cardsId}` };
  const rejected = [], nc = normRow(card || {}, b.fields.map(f => f.key), cardsId, rejected);
  if (!nc) return { ok: false, reason: rejected[0].reason };
  const cards = ensureCards(b, state[mode]); cards.push(nc);
  if (mode === state.mode) rerenderBlock(cardsId);
  scheduleSave();
  return { ok: true, mode, cardsId, index: cards.length - 1, cards: cards.length, rejected };
}
function setCheck(mode, id, on) {
  mode = mode || state.mode;
  if (!isMode(mode)) return { ok: false, reason: "서식은 'single' 또는 'fusion'" };
  if (!planIndex(mode).k.has(id)) return { ok: false, reason: `점검표에 없는 항목: ${id}` };
  state[mode].k[id] = !!on;
  if (mode === state.mode) {
    const cb = document.getElementById('ck-' + id);   // 블록을 다시 그리지 않는다 — 포커스가 날아간다
    if (cb) { cb.checked = !!on; cb.closest('li').classList.toggle('done', !!on); updateCheckMeter(cb.closest('[data-si]')); }
    renderSteps();
  }
  scheduleSave();
  return { ok: true, mode, id, checked: !!on };
}
// 콘솔·Playwright·브라우저 확장·webmcp.js 가 모두 이 표면을 쓴다. state 등은 const 라 window 에 없다.
window.cbcPlanner = { applyPlan, getPlan, setField, addRow, addCard, setCheck, setMode, getSchema };

// ---------- 정적 HTML (저장용·빈 양식 인쇄용) ----------
function buildStaticHTML(blank) {
  const s = schema();
  const sheet = $('#sheet').cloneNode(true);
  sheet.querySelectorAll('.no-print, .rowtools, .add-row, .check-meter').forEach(el => el.remove());
  // textarea → 글 상자
  sheet.querySelectorAll('textarea').forEach(t => {
    const div = document.createElement('div');
    const v = blank ? '' : t.value;
    div.style.cssText = 'white-space:pre-wrap;word-break:break-word;min-height:30px;padding:3px 4px;line-height:1.6;font-size:10pt;';
    if (v.trim()) { div.textContent = v; }
    else { div.textContent = t.placeholder; div.style.color = '#b6bec7'; }
    t.replaceWith(div);
  });
  sheet.querySelectorAll('input[type=checkbox]').forEach(cb => {
    const sp = document.createElement('span'); sp.textContent = (!blank && cb.checked) ? '☑ ' : '☐ '; cb.replaceWith(sp);
  });
  // 안내문: 빈 양식은 모두 펼침, 완성본은 접힌 것 제거
  sheet.querySelectorAll('details').forEach(d => { if (blank) d.open = true; else if (!d.open) d.remove(); });
  sheet.querySelectorAll('details summary').forEach(sm => { if (sm.parentElement.classList.contains('help')) sm.remove(); });
  const css = $('style').textContent;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(s.title)} — ${esc(s.tag)}</title><style>${css}
body{background:#fff}.sheet{box-shadow:none;border:0;margin:0 auto}details.note{background:#fafaf8}</style></head>
<body data-mode="${state.mode}">${sheet.outerHTML}</body></html>`;
}
function downloadHTML() { download(docName() + '.html', buildStaticHTML(false), 'text/html;charset=utf-8'); toast('HTML 파일을 저장했습니다'); }
function printSheet(blank) {
  if (!blank) {
    document.body.classList.add('hide-help');
    const done = () => { document.body.classList.remove('hide-help'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print(); return;
  }
  // 빈 양식: 정적 HTML을 숨은 iframe에 넣어 인쇄
  let fr = $('#printFrame'); if (fr) fr.remove();
  fr = document.createElement('iframe'); fr.id = 'printFrame';
  fr.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:210mm;height:297mm;border:0;';
  document.body.appendChild(fr);
  fr.srcdoc = buildStaticHTML(true);
  fr.onload = () => { setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 300); };
}

// ---------- 시작 ----------
loadSaved();
renderAll();
syncTopbarH();
$('#refpanel').classList.toggle('open', state.refsOpen);
$('#helpBtn').textContent = state.helpOpen ? 'ⓘ 안내 접기' : 'ⓘ 안내 펼치기';
