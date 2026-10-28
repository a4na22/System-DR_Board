/** JSON 정보시스템 목록 로딩, 브라우저 추가 데이터 병합 및 화면 제어. */
const SYSTEM_TYPES = ['A-A', 'A-S', 'STORAGE', 'NONE', 'PPP'];
const STORAGE_KEY = 'dr-board.custom-systems.v1';
const SYSTEM_FIELDS = ['system_name', 'config_id', 'dr_type', 'business_type', 'data_spec', 'rpo_target', 'rto_target'];
const gridContainer = document.getElementById('systemGrid');
const searchInput = document.getElementById('searchInput');
const filterContainer = document.getElementById('filterContainer');
const dialog = document.getElementById('systemDialog');
const form = document.getElementById('systemForm');
const saveStatus = document.getElementById('saveStatus');
let customSystems = [];
let currentSystems = [];
let systemsReady = false;
function loadStoredSystems(baseSystems) {
  customSystems = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(stored) || !stored.every(system => isValidSystem(system, true)) ||
        new Set(stored.map(system => system.system_id)).size !== stored.length) {
      throw new Error('Invalid saved systems');
    }
    // 기존 브라우저 저장 데이터에는 구성 ID를 부여해 시스템을 그대로 유지합니다.
    const usedIds = new Set(baseSystems.map(system => normalizeConfigId(system.config_id)));
    for (const system of stored.filter(system => system.config_id !== undefined)) {
      const id = normalizeConfigId(system.config_id);
      usedIds.add(id);
    }
    let migrated = false;
    for (const system of stored) {
      if (system.config_id !== undefined) continue;
      const base = `LEGACY-${system.system_id}`;
      let id = base;
      let suffix = 1;
      while (usedIds.has(normalizeConfigId(id))) id = `${base}-${suffix++}`;
      system.config_id = id;
      usedIds.add(normalizeConfigId(id));
      migrated = true;
    }
    customSystems = stored;
    if (migrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customSystems));
      } catch {
        saveStatus.textContent = '기존 시스템에 구성 ID를 부여했으나 브라우저에 저장하지 못했습니다.';
      }
    }
  } catch {
    saveStatus.textContent = '저장된 시스템을 불러올 수 없습니다. 브라우저 저장 설정을 확인해주세요.';
  }
  const configIds = new Set(baseSystems.map(system => normalizeConfigId(system.config_id)));
  const systemIds = new Set(baseSystems.map(system => system.system_id));
  customSystems = customSystems.filter(system => {
    const configId = normalizeConfigId(system.config_id);
    if (configIds.has(configId) || systemIds.has(system.system_id)) return false;
    configIds.add(configId);
    systemIds.add(system.system_id);
    return true;
  });
  return customSystems;
}
let activeType = 'ALL';
let searchKeyword = '';

function normalizeConfigId(id) {
  return id.trim().toUpperCase();
}
function isValidSystem(system, allowLegacy = false, requireCustomId = true) {
  return system && SYSTEM_FIELDS.every(field =>
    (allowLegacy && field === 'config_id' && system[field] === undefined) ||
    (typeof system[field] === 'string' && system[field].trim())) &&
    SYSTEM_TYPES.includes(system.dr_type) && typeof system.system_id === 'string' && system.system_id.trim() &&
    (!requireCustomId || system.system_id.startsWith('CUSTOM-'));
}

// 사용자 입력은 textContent로 출력하여 HTML로 실행되지 않게 합니다.
function textElement(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
function renderCards(data) {
  gridContainer.replaceChildren();
  if (!data.length) {
    gridContainer.appendChild(textElement('p', 'empty-state', '검색 결과가 없습니다. 검색어 또는 유형을 변경해주세요.'));
    return;
  }
  data.forEach(system => {
    const card = textElement('article', 'card', '');
    const header = textElement('div', 'card-header', '');
    header.append(textElement('span', 'badge', system.dr_type));
    card.append(header, textElement('h3', 'card-title', system.system_name));
    const body = textElement('div', 'card-body', '');
    [['구성 ID', 'config_id'], ['업무 성격', 'business_type'], ['데이터 사양', 'data_spec'], ['RPO 목표', 'rpo_target'], ['RTO 목표', 'rto_target']].forEach(([label, field]) => {
      const row = textElement('p', '', '');
      row.append(textElement('strong', '', `${label}: `), textElement('span', field, system[field]));
      body.appendChild(row);
    });
    card.appendChild(body);
    gridContainer.appendChild(card);
  });
}
function updateView() {
  const filtered = getFilteredSystems(currentSystems, activeType, searchKeyword);
  document.getElementById('resultCount').textContent = `전체 ${currentSystems.length}개 · 표시 ${filtered.length}개`;
  filterContainer.querySelectorAll('[data-type]').forEach(button => {
    const active = button.dataset.type === activeType;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderCards(filtered);
}
searchInput.addEventListener('input', event => {
  if (!systemsReady) return;
  searchKeyword = event.target.value;
  updateView();
});
filterContainer.addEventListener('click', event => {
  if (!systemsReady) return;
  const button = event.target.closest('button[data-type]');
  if (!button) return;
  activeType = button.dataset.type;
  updateView();
});
document.getElementById('addSystemButton').addEventListener('click', () => {
  form.reset();
  document.getElementById('formError').textContent = '';
  document.getElementById('csvFile').value = '';
  document.getElementById('csvStatus').textContent = '';
  dialog.showModal();
  form.elements.namedItem('system_name').focus();
});
function importCsvText(text) {
  if (!systemsReady) throw new Error('시스템 목록을 먼저 불러와야 합니다.');
  const systems = parseSystemsCsv(text);
  const usedConfigIds = new Set(currentSystems.map(system => normalizeConfigId(system.config_id)));
  const usedSystemIds = new Set(currentSystems.map(system => system.system_id));
  let nextId = currentSystems.length + 1;
  systems.forEach((system, index) => {
    const configId = normalizeConfigId(system.config_id);
    if (usedConfigIds.has(configId)) throw new Error(`${index + 2}번째 데이터 행: 이미 등록되었거나 CSV 안에서 중복된 구성 ID입니다 (${system.config_id}).`);
    usedConfigIds.add(configId);
    while (usedSystemIds.has(`CUSTOM-${nextId}`)) nextId++;
    system.system_id = `CUSTOM-${nextId++}`;
    usedSystemIds.add(system.system_id);
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...customSystems, ...systems]));
  } catch {
    throw new Error('저장하지 못했습니다. 브라우저 저장 허용 설정 또는 저장 공간을 확인해주세요.');
  }
  customSystems = [...customSystems, ...systems];
  currentSystems = [...currentSystems, ...systems];
  activeType = 'ALL';
  searchKeyword = '';
  searchInput.value = '';
  updateView();
  saveStatus.textContent = `CSV로 시스템 ${systems.length}개를 추가했습니다. 이 브라우저에 저장되었습니다.`;
  return systems.length;
}
let csvImportInProgress = false;
document.getElementById('importCsvButton').addEventListener('click', async () => {
  if (csvImportInProgress) return;
  const fileInput = document.getElementById('csvFile');
  const status = document.getElementById('csvStatus');
  const button = document.getElementById('importCsvButton');
  const file = fileInput.files[0];
  if (!file) { status.textContent = '먼저 CSV 파일을 선택해주세요.'; return; }
  if (file.size > 5 * 1024 * 1024) { status.textContent = 'CSV 파일은 최대 5MB까지 등록할 수 있습니다.'; return; }
  csvImportInProgress = true;
  button.disabled = true;
  status.textContent = 'CSV 파일을 확인하고 있습니다…';
  try {
    const count = importCsvText(await file.text());
    status.textContent = `${count}개 시스템을 등록했습니다. 창을 닫으면 목록에서 확인할 수 있습니다.`;
    fileInput.value = '';
  } catch (error) {
    status.textContent = `${error.message}\n등록된 시스템은 없습니다. 파일을 수정한 후 다시 시도해주세요.`;
  } finally {
    csvImportInProgress = false;
    button.disabled = false;
  }
});
['closeDialogButton', 'cancelButton'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => dialog.close());
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!systemsReady) return;
  const system = Object.fromEntries(SYSTEM_FIELDS.map(field => [field, form.elements.namedItem(field).value.trim()]));
  let nextId = currentSystems.length + 1;
  while (currentSystems.some(item => item.system_id === `CUSTOM-${nextId}`)) nextId++;
  system.system_id = `CUSTOM-${nextId}`;
  if (!form.reportValidity() || !isValidSystem(system)) {
    document.getElementById('formError').textContent = '모든 항목에 공백이 아닌 내용을 입력해주세요.';
    return;
  }
  if (currentSystems.some(item => normalizeConfigId(item.config_id) === normalizeConfigId(system.config_id))) {
    document.getElementById('formError').textContent = '이미 등록된 구성 ID입니다. 다른 고유 식별값을 입력해주세요.';
    form.elements.namedItem('config_id').focus();
    return;
  }
  // 저장에 실패하면 폼을 유지하고 재시도할 수 있게 합니다.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...customSystems, system]));
  } catch {
    document.getElementById('formError').textContent = '저장하지 못했습니다. 브라우저 저장 허용 설정 또는 저장 공간을 확인한 뒤 다시 시도해주세요.';
    return;
  }
  customSystems.push(system);
  currentSystems.push(system);
  activeType = 'ALL';
  searchKeyword = '';
  searchInput.value = '';
  updateView();
  dialog.close();
  saveStatus.textContent = `${system.system_name} 시스템을 추가했습니다. 이 브라우저에서 다시 열어도 유지됩니다.`;
});
// JSON을 먼저 읽고 검증한 다음에만 브라우저 추가 데이터를 합칩니다.
async function initializeSystems() {
  systemsReady = false;
  document.getElementById('addSystemButton').disabled = true;
  document.getElementById('retryLoadButton').hidden = true;
  gridContainer.replaceChildren();
  gridContainer.appendChild(textElement('p', 'empty-state', '시스템 목록을 불러오고 있습니다…'));
  try {
    const response = await fetch('data/tasks.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const baseSystems = await response.json();
    if (!Array.isArray(baseSystems) || !baseSystems.every(system => isValidSystem(system, false, false)) ||
        new Set(baseSystems.map(system => system.system_id)).size !== baseSystems.length ||
        new Set(baseSystems.map(system => normalizeConfigId(system.config_id))).size !== baseSystems.length) {
      throw new Error('Invalid system data');
    }
    saveStatus.textContent = '';
    currentSystems = [...baseSystems, ...loadStoredSystems(baseSystems)];
    systemsReady = true;
    updateView();
    document.getElementById('addSystemButton').disabled = false;
  } catch {
    gridContainer.replaceChildren();
    gridContainer.appendChild(textElement('p', 'empty-state', '시스템 목록을 불러오지 못했습니다.'));
    document.getElementById('resultCount').textContent = '목록 불러오기 실패';
    saveStatus.textContent = 'data/tasks.json 파일을 확인해주세요. HTML을 직접 열었다면 로컬 서버 또는 Live Server로 실행해주세요.';
    document.getElementById('retryLoadButton').hidden = false;
  }
}
document.getElementById('retryLoadButton').addEventListener('click', initializeSystems);
const initializationPromise = initializeSystems();
