const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createSupabaseStore } = require('../supabase-data.js');
const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/supabase.json'), 'utf8'));
const examples = () => JSON.parse(fs.readFileSync(path.join(root, 'data/tasks.json'), 'utf8'));
const header = '시스템명,구성 ID,DR 유형,업무 성격,데이터 사양,RPO 목표,RTO 목표';
function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
async function boot(options = {}) {
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
  const database = options.database ?? examples();
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'data/supabase.json') return response(config, options.configStatus ?? 200);
    assert.ok(url.startsWith(config.url + '/rest/v1/dr_systems'));
    assert.equal(init.headers.apikey, config.publishableKey);
    assert.equal(init.headers.Authorization, undefined);
    if (options.networkError) throw Error('Network unavailable');
    if (init.method === 'POST') {
      if (options.insertError) return response(options.insertError, options.insertStatus ?? 403);
      const systems = JSON.parse(init.body);
      database.push(...systems);
      return response(systems, 201);
    }
    if (options.loadError) return response(options.loadError, options.loadStatus ?? 403);
    const query = new URL(url).searchParams;
    return response(database.slice(Number(query.get('offset')), Number(query.get('offset')) + Number(query.get('limit'))));
  };
  const context = vm.createContext({ document, fetch: fetcher, AbortSignal, crypto: { randomUUID }, localStorage: {
    getItem() { throw Error('Legacy browser systems must not be read'); },
    setItem() { throw Error('Data must not be written to localStorage'); }
  } });
  for (const file of ['gemini-code-1793151881740.js', 'supabase-data.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  await vm.runInContext('initializationPromise', context);
  async function submit(name = '추가 시스템', configId = 'EXT-001') {
    const values = { system_name: name, config_id: configId, dr_type: 'A-S', business_type: '민원 관리', data_spec: 'DB 3TB', rpo_target: '5분', rto_target: '1시간' };
    for (const [field, value] of Object.entries(values)) form.elements.namedItem(field).value = value;
    await form.listeners.submit({ preventDefault() {} });
  }
  return { run: code => vm.runInContext(code, context), get: id => document.getElementById(id), submit, database, calls };
}
function importText(app, csv) { return app.run(`importCsvText(${JSON.stringify(csv)})`); }
test('load from Supabase only, render 30 systems, and filter by name and configuration ID', async () => {
  const app = await boot();
  assert.equal(app.run('currentSystems.length'), 30);
  assert.equal(app.get('systemGrid').children.length, 30);
  assert.equal(app.calls[0].url, 'data/supabase.json');
  assert.ok(!app.calls.some(call => call.url === 'data/tasks.json'));
  for (const type of ['A-A', 'A-S', 'STORAGE', 'NONE', 'PPP']) assert.equal(app.run(`getFilteredSystems(currentSystems, '${type}', '').length`), 6);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'A-A', '민원').length"), 1);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'ALL', ' ci-0001 ').length"), 1);
  assert.equal(app.run("getFilteredSystems(currentSystems, 'PPP', 'ci-0001').length"), 0);
});
test('single registration writes DB, resets filters, and survives a new browser session', async () => {
  const app = await boot();
  app.run("activeType = 'NONE'; searchKeyword = '없는 검색어'; updateView()");
  await app.submit('<img src=x onerror=alert(1)>');
  assert.equal(app.database.length, 31);
  assert.equal(app.run('activeType'), 'ALL');
  assert.equal(app.get('systemGrid').children[30].children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.match(app.database[30].system_id, /^CUSTOM-[0-9a-f-]{36}$/);
  assert.equal((await boot({ database: app.database })).run('currentSystems.length'), 31);
  assert.match(app.get('saveStatus').textContent, /Supabase에 저장/);
});
test('whitespace and duplicate configuration IDs are rejected before any DB insert', async () => {
  const app = await boot();
  await app.submit('   ');
  assert.match(app.get('formError').textContent, /공백/);
  await app.submit('중복', ' ci-0001 ');
  assert.match(app.get('formError').textContent, /중복된 구성 ID/);
  assert.equal(app.calls.filter(call => call.init.method === 'POST').length, 0);
});
test('DB RLS rejection retains input and does not report success', async () => {
  const app = await boot({ insertError: { code: '42501' } });
  app.get('systemDialog').showModal();
  await app.submit();
  assert.equal(app.database.length, 30);
  assert.equal(app.get('systemDialog').open, true);
  assert.match(app.get('formError').textContent, /접근 권한/);
  assert.equal(app.get('saveSystemButton').disabled, false);
});
test('DB unique constraint handles another browser registering the same ID', async () => {
  const app = await boot({ insertError: { code: '23505' }, insertStatus: 409 });
  await app.submit();
  assert.match(app.get('formError').textContent, /이미 등록된 구성 ID/);
  assert.equal(app.run('currentSystems.length'), 30);
});
test('CSV supports UTF-8 BOM, quoted commas, multiline fields and escaped quotes', async () => {
  const app = await boot();
  const csv = '\uFEFF' + header + '\r\n"민원, 관리",CSV-001,A-A,"업무\n안내","DB ""HA"" 3TB",0초,수분 이내\r\n문서관리,CSV-002,storage,문서 보관,10TB,수시간,수일\r\n';
  assert.equal(await importText(app, csv), 2);
  assert.equal(app.database.length, 32);
  assert.equal(app.database[30].system_name, '민원, 관리');
  assert.equal(app.database[30].business_type, '업무\n안내');
  assert.equal(app.database[30].data_spec, 'DB "HA" 3TB');
  assert.equal(app.database[31].dr_type, 'STORAGE');
  assert.equal(app.calls.filter(call => call.init.method === 'POST').length, 1);
});
test('CSV duplicates against DB and inside batch reject entire batch', async () => {
  for (const id of ['ci-0001', 'csv-001']) {
    const app = await boot();
    await assert.rejects(importText(app, header + '\n시스템1,CSV-001,A-A,업무,DB,0초,수분\n시스템2,' + id + ',A-S,업무,DB,수분,수시간'), /중복된 구성 ID/);
    assert.equal(app.database.length, 30);
    assert.equal(app.calls.filter(call => call.init.method === 'POST').length, 0);
  }
});
test('CSV invalid fields, headers, types, quotes and encoding reject before DB writes', async () => {
  const app = await boot();
  for (const csv of ['', header, '시스템명,구성 ID\n이름,ID1', header + '\n이름,ID1,UNKNOWN,업무,DB,0초,수분', header + '\n이름,ID1,A-A,업무,DB,,수분', header + '\n"닫히지 않은 따옴표', header + '\n이름,ID1,A-A,업무,DB,0초,"수분"x', header + '\n\uFFFD,ID1,A-A,업무,DB,0초,수분']) await assert.rejects(importText(app, csv));
  assert.equal(app.database.length, 30);
});
test('CSV DB rejection does not change displayed systems', async () => {
  const app = await boot({ insertError: { code: '42501' } });
  await assert.rejects(importText(app, header + '\n이름,ID1,A-A,업무,DB,0초,수분'), /접근 권한/);
  assert.equal(app.run('currentSystems.length'), 30);
});
test('CSV file input imports the selected file and reports count', async () => {
  const app = await boot();
  app.get('csvFile').files = [];
  await app.get('importCsvButton').listeners.click();
  assert.match(app.get('csvStatus').textContent, /먼저 CSV/);
  app.get('csvFile').files = [{ size: 100, text: async () => header + '\n업로드 시스템,UPLOAD-001,A-A,업무,DB,0초,수분' }];
  await app.get('importCsvButton').listeners.click();
  assert.equal(app.run('currentSystems.length'), 31);
  assert.match(app.get('csvStatus').textContent, /1개 시스템을 등록/);
});
test('network and permission errors block additions, expose retry, and avoid JSON fallback', async () => {
  for (const options of [{ networkError: true }, { configStatus: 404 }, { loadError: { code: '42501' } }]) {
    const app = await boot(options);
    assert.equal(app.run('systemsReady'), false);
    assert.equal(app.get('addSystemButton').disabled, true);
    assert.equal(app.get('retryLoadButton').hidden, false);
    assert.ok(!app.calls.some(call => call.url === 'data/tasks.json'));
  }
});
test('empty DB stays empty instead of silently displaying example systems', async () => {
  const app = await boot({ database: [] });
  assert.equal(app.run('currentSystems.length'), 0);
  assert.match(app.get('systemGrid').children[0].textContent, /조회 권한/);
});
test('pagination reads beyond one REST response and reload sees changes from another browser', async () => {
  const database = Array.from({ length: 501 }, (_, index) => ({ ...examples()[0], system_id: 'SYS-' + index, config_id: 'ID-' + index }));
  const app = await boot({ database });
  assert.equal(app.run('currentSystems.length'), 501);
  assert.equal(app.calls.filter(call => call.url.includes('/rest/v1/')).length, 2);
  database.push({ ...database[0], system_id: 'SYS-new', config_id: 'ID-new' });
  await app.get('reloadSystemsButton').listeners.click();
  assert.equal(app.run('currentSystems.length'), 502);
});
test('invalid DB records fail loading and retry recovers', async () => {
  const database = examples();
  database[1].config_id = 'ci-0001';
  const app = await boot({ database });
  assert.equal(app.run('systemsReady'), false);
  database[1].config_id = 'CI-0002';
  await app.get('retryLoadButton').listeners.click();
  assert.equal(app.run('systemsReady'), true);
});
test('entry points reference existing assets and template imports into DB', async () => {
  const app = await boot();
  assert.equal(await importText(app, fs.readFileSync(path.join(root, 'system-import-template.csv'), 'utf8')), 2);
  for (const name of ['index.html', 'gemini-code-1793151875153.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const [, file] of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.ok(html.includes('id="connectionStatus"'));
    assert.ok(html.includes('Supabase에 저장'));
  }
});
test('invalid connection config is rejected', () => {
  assert.throws(() => createSupabaseStore({ ...config, url: 'http://untrusted.invalid' }), /연결 설정/);
});
