# 작업 체크리스트 — AI 입구 (계획 API · schema.json · 붙여넣기 · WebMCP)

계획 원본: `~/.claude/plans/sprightly-snuggling-starlight.md` · 결정 이유: [context-notes.md](context-notes.md)

## 커밋 1 · 계획 API `window.cbcPlanner`
- [ ] `schema-flat.js` — `htmlToText`, `gridInitRows`(app.js에서 이동), `flattenSchema`
- [ ] `app.js` — `applyPlan` / `getPlan` / `setField` / `addRow` / `addCard` / `setCheck` / `setMode`(가드·반환값) / `getSchema`, `window.cbcPlanner` 노출
- [ ] `app.js` — `importJSON`이 `applyPlan`을 거치게, `ensureGrid/ensureCards/findBlock`에 서식 인자
- [ ] `index.html` — `schema-flat.js` 스크립트 태그
- [ ] 검증 — 콘솔 멱등성 `applyPlan(getPlan())` rejected 0 · 거절 3건 케이스 · 병합/교체 · 다른 서식 setter · 기존 .json 회귀 · 375px 불변

## 커밋 2 · schema.json + 프롬프트 팩
- [ ] `build-schema.js` — `node build-schema.js` → `schema.json` (표준 라이브러리만, const 함정 우회)
- [ ] `app.js` — `promptPack(mode)`, `copyPromptPack()`
- [ ] `index.html` — 메뉴 「🤖 AI에게 서식 알려주기」
- [ ] `README.md` — 「AI와 함께 쓰기」, schema.json 재생성 한 줄
- [ ] 검증 — 두 번 생성해 `git status` 변화 없음 · 브라우저 `getSchema()` === fetch(schema.json) · 팩 30줄 이내 · 실제 채팅 1곳에서 JSON 받아 반영

## 커밋 3 · 붙여넣기 대화상자 + `#plan=` 링크
- [ ] `index.html` — `<dialog id="pasteDlg">`, 메뉴 「📋 AI 답변 붙여넣기로 불러오기」, `.dd-menu` 스크롤, CSS
- [ ] `app.js` — `extractJSON`, `openPasteDialog`, `applyPasted`, `loadFromHash`, `growAll`/input 핸들러 `data-kind` 가드
- [ ] `index.html` — 오리진 트라이얼 meta 자리(주석)
- [ ] 검증 — 펜스/설명/순수 JSON 세 형태 · 깨진 JSON 메시지 · rejected 목록 잔류 · 해시 → 대화상자 미리 채움·해시 제거 · 상한 초과 토스트 · 375px

## 커밋 4 · WebMCP
- [ ] `webmcp.js` — 기능 감지, 도구 7개 등록, `safe()` 래퍼, `P.webmcp` 가드
- [ ] `index.html` — 스크립트 태그
- [ ] `README.md` — Gemini in Chrome · ChatGPT 데스크톱 절차, 플래그·Inspector 테스트법
- [ ] 검증 — Chrome 150+ 플래그 + Inspector로 도구 7개 · `set_field` 실행 → 칸·토스트·저장 · `unregister()` 후 사라짐 · Safari 콘솔 오류 0

## 마무리
- [ ] 회귀 14항목 재실행 (입력·행 조작·서식 전환·단계별 보기·안내·배지·내보내기 4종·자동 저장·JS 오류)
- [ ] 프롬프트 팩·schema.json에 학생 식별 정보 요구 문구 없음
- [ ] 네 커밋 한 번에 푸시 → 배포 확인
