// WebMCP — 페이지 안의 계획 API(window.cbcPlanner)를 브라우저 에이전트(Gemini in Chrome · ChatGPT 데스크톱 내장 브라우저 등)의 도구로 등록한다.
// 표준 네임스페이스는 document.modelContext (W3C 초안·Chrome 문서). navigator.modelContext 는 초기 문서용 예비 감지.
// Chrome 149~156 오리진 트라이얼, 로컬은 chrome://flags/#enable-webmcp-testing. 미지원 브라우저에서는 아무 일도 하지 않는다.
// app.js 뒤에 로드한다.
(() => {
  const mc = document.modelContext || navigator.modelContext;
  const P = window.cbcPlanner;
  if (!mc || typeof mc.registerTool !== 'function' || !P || P.webmcp) return;   // 같은 이름을 다시 등록하면 InvalidStateError

  const FLAT = P.getSchema();
  const curMode = () => P.getPlan().mode;
  const fieldsOf = m => FLAT.modes[m].sections.flatMap(s => s.fields);
  const labelOf = (m, kind, id) => { const f = fieldsOf(m).find(x => x.kind === kind && (x.key || x.id) === id); return f ? f.label : id; };
  const where = m => m !== curMode() ? ` — ${FLAT.modes[m].tag} 서식(전환해서 확인)` : '';
  const stripHelp = f => { const o = { ...f }; delete o.help; if (o.fields) o.fields = o.fields.map(x => { const y = { ...x }; delete y.help; return y; }); return o; };

  const MODE = { type: 'string', enum: ['single', 'fusion'], description: '서식. single=단일교과용, fusion=융합교과용. 생략하면 화면에 보이는 서식' };
  const SECTION = { type: 'string', enum: ['s0', 's1', 's2', 's3', 'check'], description: '단계 하나만 다룰 때. s0 표지 · s1 교육과정 분석 · s2 평가 계획 · s3 학습 계획 · check 점검표' };

  // execute 가 reject 되면 에이전트에는 이유 없는 오류만 간다 — 실패도 {ok:false, reason} 객체로 돌려준다
  const safe = fn => async input => { try { return await fn(input || {}); } catch (e) { return { ok: false, reason: String(e && e.message || e) }; } };

  const tools = [
    {
      name: 'get_schema',
      description: '설계안 서식의 칸 목록(키·라벨·자리표시·표의 열·점검 항목)을 돌려준다. set_field·add_row·apply_plan 을 부르기 전에 먼저 호출해 정확한 key 를 확인한다. 작성 규칙(안내문)이 필요하면 withHelp:true, 길이를 줄이려면 section 으로 단계 하나만 받는다.',
      inputSchema: { type: 'object', properties: { mode: MODE, section: SECTION, withHelp: { type: 'boolean', description: '작성 안내(규칙)까지 포함. 길어지므로 칸 내용을 직접 쓸 때만 true' } } },
      annotations: { readOnlyHint: true },
      execute: ({ mode, section, withHelp }) => {
        const m = mode || curMode(), M = FLAT.modes[m];
        const sections = M.sections.filter(s => !section || s.id === section)
          .map(s => ({ id: s.id, title: s.title, notes: withHelp ? s.notes : undefined, fields: s.fields.map(f => withHelp ? f : stripHelp(f)) }));
        return { ok: true, mode: m, tag: M.tag, nameKey: M.nameKey, payloadExample: FLAT.payloadExample, sections };
      }
    },
    {
      name: 'get_plan',
      description: '현재 입력된 설계안 내용을 돌려준다(f 칸 · g 표 · c 카드 · k 점검표). 표는 아직 손대지 않은 자리표시 행일 수 있다. section 으로 단계 하나만 받을 수 있다.',
      inputSchema: { type: 'object', properties: { mode: MODE, section: SECTION } },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ mode, section }) => {
        const m = mode || curMode(), plan = P.getPlan()[m];
        if (!section) return { ok: true, mode: m, f: plan.f, g: plan.g, c: plan.c, k: plan.k };
        const out = { f: {}, g: {}, c: {}, k: {} };
        FLAT.modes[m].sections.filter(s => s.id === section).flatMap(s => s.fields).forEach(f => {
          if (f.kind === 'f') { if (plan.f[f.key] !== undefined) out.f[f.key] = plan.f[f.key]; }
          else if (f.kind === 'k') f.items.forEach(it => { if (plan.k[it.id] !== undefined) out.k[it.id] = plan.k[it.id]; });
          else if (plan[f.kind][f.id]) out[f.kind][f.id] = plan[f.kind][f.id];
        });
        return { ok: true, mode: m, section, ...out };
      }
    },
    {
      name: 'set_field',
      description: '설계안의 칸 하나를 채운다. key 는 get_schema 에서 kind 가 "f" 인 항목의 key. 여러 줄은 \\n 으로 잇는다. 기존 값을 덮어쓴다.',
      inputSchema: { type: 'object', required: ['key', 'value'], properties: { mode: MODE, key: { type: 'string', description: '칸의 key (예: unit-name, standards, criteria)' }, value: { type: 'string', description: '칸에 넣을 글. 여러 줄은 \\n' } } },
      execute: ({ mode, key, value }) => {
        const r = P.setField(mode || curMode(), key, value);
        if (r.ok) toast(`AI가 「${labelOf(r.mode, 'f', key)}」 칸을 채웠습니다${where(r.mode)}`);
        return r;
      }
    },
    {
      name: 'add_row',
      description: '표에 행을 하나 덧붙인다. rubric·other 는 두 서식 공통, flow·lessons 는 단일교과용, open·close 는 융합교과용. 표를 처음부터 채울 때는 apply_plan 의 g 에 행 배열을 넘기는 편이 낫다(빈 자리표시 행이 남지 않는다).',
      inputSchema: { type: 'object', required: ['gridId', 'row'], properties: { mode: MODE, gridId: { type: 'string', enum: ['rubric', 'other', 'flow', 'lessons', 'open', 'close'], description: '표의 id' }, row: { type: 'object', additionalProperties: { type: 'string' }, description: '열 키 → 값. 열 키는 get_schema 의 columns' } } },
      execute: ({ mode, gridId, row }) => {
        const r = P.addRow(mode || curMode(), gridId, row);
        if (r.ok) toast(`AI가 「${labelOf(r.mode, 'g', gridId)}」 표에 행을 추가했습니다${where(r.mode)}`);
        return r;
      }
    },
    {
      name: 'add_card',
      description: '융합교과용 3단계 「탐구 목록」 카드를 하나 덧붙인다(cardsId: inquiry). 카드의 열 키는 get_schema 의 fields.',
      inputSchema: { type: 'object', required: ['cardsId', 'card'], properties: { mode: MODE, cardsId: { type: 'string', enum: ['inquiry'] }, card: { type: 'object', additionalProperties: { type: 'string' }, description: '필드 키 → 값 (hour, topic, phase, q, act, watch, how)' } } },
      execute: ({ mode, cardsId, card }) => {
        const r = P.addCard(mode || curMode(), cardsId, card);
        if (r.ok) toast(`AI가 「${labelOf(r.mode, 'c', cardsId)}」 카드를 추가했습니다${where(r.mode)}`);
        return r;
      }
    },
    {
      name: 'apply_plan',
      description: '설계안 여러 칸을 한 번에 반영한다. plan 은 get_schema 의 payloadExample 형식 {mode, single 또는 fusion: {f, g, c, k}}. merge 가 true(기본)면 plan 에 있는 값만 바꾸고 빈 값은 건너뛴다. false 면 서식을 비우고 새로 채우므로 사용자가 분명히 요청했을 때만 쓴다. 서식에 없는 키는 rejected 로 돌아온다.',
      inputSchema: { type: 'object', required: ['plan'], properties: { plan: { type: 'object', description: '{mode, single|fusion: {f: {key: 값}, g: {표id: [행…]}, c: {카드id: [카드…]}, k: {항목id: true}}}' }, merge: { type: 'boolean', description: '기본 true. false 는 서식을 비우고 새로 채움' } } },
      annotations: { consequentialHint: true },
      execute: ({ plan, merge }) => {
        const r = P.applyPlan(plan, { merge: merge !== false });
        if (r.ok) toast(`AI가 설계안을 반영했습니다 — 칸 ${r.applied.f} · 표 ${r.applied.g}행 · 카드 ${r.applied.c}${r.rejected.length ? ` (건너뜀 ${r.rejected.length})` : ''}`);
        return r;
      }
    },
    {
      name: 'set_mode',
      description: '화면의 서식을 바꾼다. single=단일교과용, fusion=융합교과용. 두 서식의 내용은 따로 저장되어 있다.',
      inputSchema: { type: 'object', required: ['mode'], properties: { mode: MODE } },
      execute: ({ mode }) => { const r = P.setMode(mode); if (r.ok) toast(`AI가 「${FLAT.modes[mode].tag}」 서식으로 바꿨습니다`); return r; }
    }
  ];

  const ac = new AbortController();
  tools.forEach(t => Promise.resolve(mc.registerTool({ ...t, execute: safe(t.execute) }, { signal: ac.signal }))
    .catch(e => console.warn('WebMCP 도구 등록 실패', t.name, e)));
  P.webmcp = { tools: tools.map(t => t.name), unregister: () => ac.abort() };   // 콘솔에서 확인·해제용
})();
