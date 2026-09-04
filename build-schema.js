// schema.json 생성 — node build-schema.js (Node 표준 라이브러리만, package.json 불필요)
// 서식(schema-*.js)을 고친 뒤 다시 실행한다. 결과는 브라우저의 cbcPlanner.getSchema() 와 같아야 한다.
const fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

// schema-*.js 는 const 최상위 선언이라 vm 전역 객체의 속성이 되지 않는다.
// 세 파일을 한 스크립트로 이어 붙이고 마지막 식의 값을 받는다.
const code = ['schema-single.js', 'schema-fusion.js', 'schema-flat.js'].map(read).join('\n;\n')
  + '\n;flattenSchema({ single: SCHEMA_SINGLE, fusion: SCHEMA_FUSION })';
const flat = vm.runInNewContext(code, {}, { filename: 'schema-bundle.js' });

fs.writeFileSync(path.join(__dirname, 'schema.json'), JSON.stringify(flat, null, 1) + '\n');
const count = m => flat.modes[m].sections.reduce((n, s) => n + s.fields.length, 0);
console.log(`schema.json 생성 — single ${count('single')}블록 · fusion ${count('fusion')}블록`);
