// 서식 평탄화 — 브라우저(getSchema)와 build-schema.js(Node)가 같은 코드를 쓴다. DOM 을 쓰지 않는다.
// schema-*.js 뒤, app.js 앞에 로드한다.

// 안내문 HTML → 텍스트. 서식은 <b> <br> <i> <span> 과 &nbsp; 만 쓴다. <br> 은 줄바꿈으로 남겨 글머리 구조를 살린다.
function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

// grid.init 이 숫자면 빈 행 n개, 배열이면 각 행의 초기값 (app.js 의 ensureGrid 와 flattenSchema 가 함께 쓴다)
function gridInitRows(block) {
  if (Array.isArray(block.init)) return block.init.map(r => Object.fromEntries(block.keys.map((k, i) => [k, r[i] || ''])));
  return Array.from({ length: block.init || 1 }, () => Object.fromEntries(block.keys.map(k => [k, ''])));
}

// SCHEMAS → 에이전트가 읽기 좋은 평탄 구조.
// kind 는 상태 버킷 글자와 같다 — f(단일 칸) / g(표) / c(반복 카드) / k(점검표).
// grid 블록에는 제목이 없으므로 직전 caption 을 라벨로 쓰고, 같은 caption 을 뒤따르는 칸의 group 으로도 붙인다.
function flattenSchema(schemas) {
  const modes = {};
  for (const mode of Object.keys(schemas)) {
    const s = schemas[mode], sections = [];
    s.sections.forEach(sec => {
      const out = { id: sec.id, title: sec.title || '', notes: [], fields: [] };
      let caption = '';
      sec.blocks.forEach(b => {
        if (b.type === 'note') out.notes.push({ title: htmlToText(b.title), text: htmlToText(b.html) });
        else if (b.type === 'caption') caption = htmlToText(String(b.html || '').replace(/<span class="light">[\s\S]*?<\/span>/g, ''));   // 설명 꼬리(light)는 라벨에서 뺀다
        else if (b.type === 'kv') b.rows.forEach(r => out.fields.push({
          kind: 'f', key: r.key,
          label: r.group ? `${r.group} — ${r.sub}` : r.label + (r.sub2 ? ' ' + r.sub2 : ''),
          group: caption || null, placeholder: r.ph || '', multiline: (r.rows || 1) > 1, help: htmlToText(r.help)
        }));
        else if (b.type === 'inline') b.cells.forEach(c => out.fields.push({
          kind: 'f', key: c.key, label: c.label, group: caption || null, placeholder: c.ph || '', multiline: false, help: htmlToText(c.help)
        }));
        else if (b.type === 'grid') out.fields.push({
          kind: 'g', id: b.id, label: caption || b.id,
          columns: b.keys.map((k, i) => ({ key: k, label: htmlToText(b.cols[i] && b.cols[i].label), placeholder: (b.ph && b.ph[i]) || '' })),
          init: gridInitRows(b), help: htmlToText(b.help)
        });
        else if (b.type === 'cards') out.fields.push({
          kind: 'c', id: b.id, label: b.title, note: b.note || '', init: b.init || 1,
          fields: b.fields.map(f => ({ key: f.key, label: f.label, placeholder: f.ph || '', multiline: (f.rows || 1) > 1, help: htmlToText(f.help) }))
        });
        else if (b.type === 'checks') out.fields.push({
          kind: 'k', id: b.id, label: sec.title || '점검표',
          items: b.groups.flatMap((g, gi) => g.items.map((it, ii) => ({ id: `${b.id}-${gi}-${ii}`, group: g.label, text: htmlToText(it) })))
        });
      });
      sections.push(out);
    });
    modes[mode] = { tag: s.tag, title: s.title, nameKey: s.nameKey, sections };
  }
  // 에이전트에게 보여 줄 페이로드 골격 — 작업 파일(.json)과 같은 형식
  const first = modes.single || modes[Object.keys(modes)[0]];
  const rubric = first.sections.flatMap(s => s.fields).find(f => f.kind === 'g' && f.id === 'rubric');
  const payloadExample = {
    app: 'cbc-design-worksheet', version: 1, mode: 'single',
    single: { f: { [first.nameKey]: '…' }, g: rubric ? { rubric: [Object.fromEntries(rubric.columns.map(c => [c.key, '…']))] } : {}, c: {}, k: {} }
  };
  return { app: 'cbc-design-worksheet', version: 1, payloadExample, modes };
}
