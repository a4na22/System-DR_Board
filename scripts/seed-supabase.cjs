// data/tasks.json을 읽어 아직 등록되지 않은 예시 시스템만 이전합니다.
const fs = require('node:fs');
const path = require('node:path');
const { createSupabaseStore } = require('../supabase-data.js');
async function seed() {
  const root = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'data/supabase.json'), 'utf8'));
  const systems = JSON.parse(fs.readFileSync(path.join(root, 'data/tasks.json'), 'utf8'));
  const store = createSupabaseStore(config);
  const existing = await store.load();
  const ids = new Set(existing.map(system => system.system_id));
  const configIds = new Set(existing.map(system => system.config_id.trim().toUpperCase()));
  const pending = systems.filter(system => !ids.has(system.system_id) && !configIds.has(system.config_id.trim().toUpperCase()));
  if (pending.length) await store.insert(pending);
  console.log(`Supabase: 이전 ${pending.length}개, 기존 ${existing.length}개`);
}
seed().catch(error => { console.error(error.message); process.exitCode = 1; });
