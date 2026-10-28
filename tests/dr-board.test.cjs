const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const key = 'dr-board.custom-systems.v1';
async function boot(storage = new Map(), failWrite = false, options = {}) {
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.dataset = {}; this.classList = { toggle() {} }; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.append(item); }
    replaceChildren() { this.children = []; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    setAttribute() {}
    querySelectorAll() { return []; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() {}
  }
  const elements = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement() { return new Element(); }
  };
  const fields = new Map();
  const form = document.getElementById('systemForm');
  form.elements = { namedItem(name) { if (!fields.has(name)) fields.set(name, new Element()); return fields.get(name); } };
  form.reportValidity = () => true;
  form.reset = () => fields.forEach(field => field.value = '');
  const events = [];
  const context = vm.createContext({ document,
    fetch: async (url, init) => {
      events.push('fetch:' + url);
      if (options.fetchError) throw new Error('Network failure');
      return { ok: options.ok !== false, status: options.ok === false ? 404 : 200,
        json: async () => { events.push('json'); return options.data ?? JSON.parse(fs.readFileSync(path.join(root, 'data/tasks.json'), 'utf8')); }
      };
    }, localStorage: {
    getItem: name => { events.push('storage'); return storage.get(name) ?? null; },
    setItem: (name, value) => { if (failWrite) throw Error('Storage full'); storage.set(name, value); }
  } });
  for (const file of ['gemini-code-1793151881740.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  await vm.runInContext('initializationPromise', context);
  function submit(name = '추가 시스템', configId = `CI-${String(vm.runInContext('currentSystems.length + 1', context)).padStart(4, '0')}`) {
    const values = { system_name: name, config_id: configId, dr_type: 'A-S', business_type: '민원 관리', data_spec: 'DB 3TB', rpo_target: '5분', rto_target: '1시간' };
    for (const [field, value] of Object.entries(values)) form.elements.namedItem(field).value = value;
    form.listeners.submit({ preventDefault() {} });
  }
  return { run: code => vm.runInContext(code, context), get: id => document.getElementById(id), submit, storage, events };
}
test('30 unique examples, six per type, and combined search/filter', async () => {
  const app = await boot();
  assert.equal(app.run('currentSystems.length'), 30);
  assert.equal(app.run('new Set(currentSystems.map(s => s.system_id)).size'), 30);
  assert.equal(app.run('new Set(currentSystems.map(s => s.config_id)).size'), 30);
  assert.equal(app.run("currentSystems[0].config_id"), 'CI-0001');
  assert.equal(app.run("currentSystems[29].config_id"), 'CI-0030');
  for (const type of ['A-A', 'A-S', 'STORAGE', 'NONE', 'PPP']) {
    assert.equal(app.run(`getFilteredSystems(currentSystems, '${type}', '').length`), 6);
  }
  assert.equal(app.run("getFilteredSystems(currentSystems, 'A-A', '민원').length"), 1);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'PPP', '민원').length"), 0);
  assert.equal(app.get('systemGrid').children.length, 30);
});
test('add system, clear filters, persist across reload, and render input as text', async () => {
  const app = await boot();
  app.run("activeType = 'NONE'; searchKeyword = '없는 검색어'; updateView()");
  app.submit('<img src=x onerror=alert(1)>');
  assert.equal(app.run('currentSystems.length'), 31);
  assert.equal(app.run('activeType'), 'ALL');
  assert.equal(app.get('systemGrid').children.length, 31);
  assert.equal(app.get('systemGrid').children[30].children[1].textContent, '<img src=x onerror=alert(1)>');
  const reloaded = await boot(app.storage);
  assert.equal(reloaded.run('currentSystems.length'), 31);
  assert.equal(reloaded.run("getFilteredSystems(currentSystems, 'A-S', 'ci-0031').length"), 1);
  reloaded.submit('두 번째 시스템');
  assert.equal(reloaded.run('new Set(currentSystems.map(s => s.system_id)).size'), 32);
});
test('whitespace-only fields are rejected', async () => {
  const app = await boot();
  app.submit('   ');
  assert.equal(app.run('currentSystems.length'), 30);
  assert.match(app.get('formError').textContent, /공백/);
});
test('configuration ID supports partial, case-insensitive search and type filtering', async () => {
  const app = await boot();
  assert.equal(app.run("getFilteredSystems(currentSystems, 'ALL', ' ci-0001 ').length"), 1);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'A-S', 'ci-0001').length"), 0);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'ALL', 'CI-000').length"), 9);
  assert.equal(app.get('systemGrid').children[0].children[2].children[0].children[1].textContent, 'CI-0001');
});
test('empty and duplicate configuration IDs are rejected without changing storage', async () => {
  const app = await boot();
  app.submit('추가 시스템', '   ');
  assert.equal(app.run('currentSystems.length'), 30);
  assert.match(app.get('formError').textContent, /공백/);
  app.submit('중복 시스템', ' ci-0001 ');
  assert.equal(app.run('currentSystems.length'), 30);
  assert.equal(app.storage.has(key), false);
  assert.match(app.get('formError').textContent, /이미 등록된/);
  app.submit('첫 번째 시스템', 'EXT-001');
  app.submit('두 번째 시스템', 'ext-001');
  assert.equal(app.run('currentSystems.length'), 31);
  assert.equal(JSON.parse(app.storage.get(key)).length, 1);
});
test('legacy systems receive persistent IDs without losing existing fields', async () => {
  const app = await boot();
  app.submit('이전 등록 시스템');
  const stored = JSON.parse(app.storage.get(key));
  delete stored[0].config_id;
  app.storage.set(key, JSON.stringify(stored));
  const migrated = await boot(app.storage);
  assert.equal(migrated.run('currentSystems.length'), 31);
  assert.equal(migrated.run('customSystems[0].system_name'), '이전 등록 시스템');
  assert.equal(migrated.run('customSystems[0].config_id'), 'LEGACY-CUSTOM-31');
  assert.equal(JSON.parse(app.storage.get(key))[0].config_id, 'LEGACY-CUSTOM-31');
  assert.equal((await boot(app.storage)).run('customSystems[0].config_id'), 'LEGACY-CUSTOM-31');
});
test('legacy ID migration avoids collisions with existing custom IDs', async () => {
  const app = await boot();
  app.submit('이전 시스템');
  app.submit('새 시스템', 'LEGACY-CUSTOM-31');
  const stored = JSON.parse(app.storage.get(key));
  delete stored[0].config_id;
  app.storage.set(key, JSON.stringify(stored));
  const migrated = await boot(app.storage);
  assert.equal(migrated.run('currentSystems.length'), 32);
  assert.equal(migrated.run('customSystems[0].config_id'), 'LEGACY-CUSTOM-31-1');
});
test('storage failure retains form and does not report a saved system', async () => {
  const app = await boot(new Map(), true);
  app.get('systemDialog').showModal();
  app.submit();
  assert.equal(app.run('currentSystems.length'), 30);
  assert.equal(app.get('systemDialog').open, true);
  assert.match(app.get('formError').textContent, /저장하지 못/);
});
test('corrupt saved data does not prevent showing examples', async () => {
  const app = await boot(new Map([[key, '{invalid json']]));
  assert.equal(app.run('currentSystems.length'), 30);
  assert.match(app.get('saveStatus').textContent, /불러올 수 없/);
});
test('entry points use existing local script and stylesheet files', async () => {
  for (const name of ['index.html', 'gemini-code-1793151875153.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const [, file] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(root, file)), `Missing asset: ${file}`);
    }
  }
});

const csvHeader = '시스템명,구성 ID,DR 유형,업무 성격,데이터 사양,RPO 목표,RTO 목표';
function importText(app, csv) { return app.run(`importCsvText(${JSON.stringify(csv)})`); }
test('CSV imports quoted commas, newlines, escaped quotes and persists all systems', async () => {
  const app = await boot();
  const csv = '\uFEFF' + csvHeader + '\r\n"민원, 관리",CSV-001,A-A,"업무\n안내","DB ""HA"" 3TB",0초,수분 이내\r\n문서관리,CSV-002,storage,문서 보관,10TB,수시간,수일\r\n';
  assert.equal(importText(app, csv), 2);
  assert.equal(app.run('currentSystems.length'), 32);
  assert.equal(app.run('customSystems[0].system_name'), '민원, 관리');
  assert.equal(app.run('customSystems[0].data_spec'), 'DB "HA" 3TB');
  assert.equal(app.run('customSystems[0].business_type'), '업무\n안내');
  assert.equal(app.run('customSystems[1].dr_type'), 'STORAGE');
  assert.equal((await boot(app.storage)).run('currentSystems.length'), 32);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'ALL', 'csv-001').length"), 1);
});
test('CSV duplicate IDs against examples and within file reject entire batch', async () => {
  for (const duplicate of ['ci-0001', 'csv-001']) {
    const app = await boot();
    const csv = csvHeader + '\n시스템1,CSV-001,A-A,업무,DB,0초,수분\n시스템2,' + duplicate + ',A-S,업무,DB,수분,수시간';
    assert.throws(() => importText(app, csv), /중복된 구성 ID/);
    assert.equal(app.run('currentSystems.length'), 30);
    assert.equal(app.storage.has(key), false);
  }
});
test('CSV invalid headers, fields, types, quoting and encoding are rejected', async () => {
  const app = await boot();
  for (const csv of [
    '', csvHeader, '시스템명,구성 ID\n이름,ID1',
    csvHeader + '\n이름,ID1,UNKNOWN,업무,DB,0초,수분',
    csvHeader + '\n이름,ID1,A-A,업무,DB,0초',
    csvHeader + '\n이름,ID1,A-A,업무,DB,,수분',
    csvHeader + '\n"닫히지 않은 따옴표',
    csvHeader + '\n이름,ID1,A-A,업무,DB,0초,"수분"x',
    csvHeader + '\n\uFFFD,ID1,A-A,업무,DB,0초,수분'
  ]) assert.throws(() => importText(app, csv));
  assert.equal(app.run('currentSystems.length'), 30);
});
test('CSV storage failure leaves all systems unchanged', async () => {
  const app = await boot(new Map(), true);
  assert.throws(() => importText(app, csvHeader + '\n이름,ID1,A-A,업무,DB,0초,수분'), /저장하지 못/);
  assert.equal(app.run('currentSystems.length'), 30);
  assert.equal(app.run('customSystems.length'), 0);
});
test('download template is importable and both entry points contain guide and CSV controls', async () => {
  const app = await boot();
  assert.equal(importText(app, fs.readFileSync(path.join(root, 'system-import-template.csv'), 'utf8')), 2);
  for (const name of ['index.html', 'gemini-code-1793151875153.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.ok(html.indexOf('class="dr-guide"') > html.indexOf('id="searchInput"'));
    for (const label of ['A-A DR 방식', 'A-S DR 방식', '스토리지 복제 방식', 'DR 미대상', '민간 클라우드이전(PPP포함)']) assert.ok(html.includes(label));
    assert.ok(html.includes('id="csvFile"'));
    assert.ok(html.includes('id="importCsvButton"'));
  }
});
test('CSV upload button reads selected file and updates status', async () => {
  const app = await boot();
  app.get('csvFile').files = [];
  await app.get('importCsvButton').listeners.click();
  assert.match(app.get('csvStatus').textContent, /먼저 CSV/);
  app.get('csvFile').files = [{ size: 100, text: async () => csvHeader + '\n업로드 시스템,UPLOAD-001,A-A,업무,DB,0초,수분' }];
  await app.get('importCsvButton').listeners.click();
  assert.equal(app.run('currentSystems.length'), 31);
  assert.match(app.get('csvStatus').textContent, /1개 시스템을 등록/);
  assert.equal(app.get('importCsvButton').disabled, false);
});

test('JSON is read before browser storage and JSON changes appear immediately', async () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/tasks.json'), 'utf8'));
  data[0].system_name = 'JSON updated name';
  const app = await boot(new Map(), false, { data });
  assert.deepEqual(app.events, ['fetch:data/tasks.json', 'json', 'storage']);
  assert.equal(app.run('currentSystems[0].system_name'), 'JSON updated name');
});
test('JSON wins ID conflicts while non-conflicting browser systems survive', async () => {
  const initial = await boot();
  initial.submit('Browser override', 'ext-001');
  initial.submit('Browser addition', 'ext-002');
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/tasks.json'), 'utf8'));
  data[0].config_id = 'EXT-001';
  const app = await boot(initial.storage, false, { data });
  assert.equal(app.run('currentSystems.length'), 31);
  assert.equal(app.run('currentSystems[0].system_name'), data[0].system_name);
  assert.equal(app.run('customSystems[0].system_name'), 'Browser addition');
  // Only reading the list must not delete the original browser storage.
  assert.equal(JSON.parse(initial.storage.get(key)).length, 2);
  data[0].system_id = 'CUSTOM-32';
  const systemIdConflict = await boot(initial.storage, false, { data });
  assert.equal(systemIdConflict.run('currentSystems.length'), 30);
});
test('JSON failures block additions and do not load or overwrite browser data', async () => {
  const initial = await boot();
  initial.submit();
  const original = initial.storage.get(key);
  for (const options of [{ fetchError: true }, { ok: false }, { data: {} }, { data: [{}] }]) {
    const app = await boot(initial.storage, false, options);
    assert.equal(app.run('systemsReady'), false);
    assert.equal(app.get('addSystemButton').disabled, true);
    assert.equal(app.get('retryLoadButton').hidden, false);
    assert.ok(!app.events.includes('storage'));
    assert.throws(() => importText(app, csvHeader), /시스템 목록/);
    assert.equal(initial.storage.get(key), original);
  }
});
test('JSON duplicate configuration IDs reject loading, and retry recovers', async () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/tasks.json'), 'utf8'));
  data[1].config_id = data[0].config_id.toLowerCase();
  const options = { data };
  const app = await boot(new Map(), false, options);
  assert.equal(app.run('systemsReady'), false);
  delete options.data;
  await app.get('retryLoadButton').listeners.click();
  assert.equal(app.run('systemsReady'), true);
  assert.equal(app.run('currentSystems.length'), 30);
  assert.equal(app.get('addSystemButton').disabled, false);
});
