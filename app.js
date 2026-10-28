/** Supabase 정보시스템 조회·등록 및 화면 제어. */
const SYSTEM_TYPES = ['A-A', 'A-S', 'STORAGE', 'NONE', 'PPP'];
const SYSTEM_FIELDS = ['system_name', 'config_id', 'dr_type', 'business_type', 'data_spec', 'rpo_target', 'rto_target'];
const gridContainer = document.getElementById('systemGrid');
const searchInput = document.getElementById('searchInput');
const filterContainer = document.getElementById('filterContainer');
const dialog = document.getElementById('systemDialog');
const form = document.getElementById('systemForm');
const saveStatus = document.getElementById('saveStatus');
let currentSystems = [];
let systemsReady = false;
let store;
let savingSystems = false;
let activeType = 'ALL';
let searchKeyword = '';

function normalizeConfigId(id) {
  return id.trim().toUpperCase();
}
function isValidSystem(system) {
  return system && SYSTEM_FIELDS.every(field => typeof system[field] === 'string' && system[field].trim()) &&
    SYSTEM_TYPES.includes(system.dr_type) && typeof system.system_id === 'string' && system.system_id.trim();
}
function validateSystemList(systems) {
  if (!Array.isArray(systems) || !systems.every(isValidSystem) ||
      new Set(systems.map(system => system.system_id)).size !== systems.length ||
      new Set(systems.map(system => normalizeConfigId(system.config_id))).size !== systems.length) {
    throw new Error('Supabase 정보시스템 데이터의 필수 항목과 구성 ID 중복을 확인해주세요.');
  }
}
async function saveSystems(systems) {
  if (!systemsReady) throw new Error('시스템 목록을 먼저 불러와야 합니다.');
  if (savingSystems) throw new Error('다른 시스템을 저장하고 있습니다. 잠시 후 다시 시도해주세요.');
  const usedIds = new Set(currentSystems.map(system => normalizeConfigId(system.config_id)));
  systems.forEach((system, index) => {
    if (usedIds.has(normalizeConfigId(system.config_id))) throw new Error((index + 1) + '번째 시스템: 이미 등록되었거나 CSV 안에서 중복된 구성 ID입니다 (' + system.config_id + ').');
    usedIds.add(normalizeConfigId(system.config_id));
    system.system_id = 'CUSTOM-' + crypto.randomUUID();
  });
  validateSystemList(systems);
  savingSystems = true;
  const submitButton = document.getElementById('saveSystemButton');
  submitButton.disabled = true;
  document.getElementById('importCsvButton').disabled = true;
  try {
    const saved = await store.insert(systems);
    if (saved.length !== systems.length) throw new Error('등록 결과를 확인하지 못했습니다. 목록을 새로 불러와 확인해주세요.');
    validateSystemList(saved);
    currentSystems = [...currentSystems, ...saved];
    activeType = 'ALL';
    searchKeyword = '';
    searchInput.value = '';
    updateView();
    return saved;
  } finally {
    savingSystems = false;
    submitButton.disabled = false;
    document.getElementById('importCsvButton').disabled = false;
  }
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
    gridContainer.appendChild(textElement('p', 'empty-state', currentSystems.length ? '검색 결과가 없습니다. 검색어 또는 유형을 변경해주세요.' : '조회된 시스템이 없습니다. 데이터 등록 여부와 조회 권한을 확인해주세요.'));
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
async function importCsvText(text) {
  const systems = parseSystemsCsv(text);
  await saveSystems(systems);
  saveStatus.textContent = 'CSV로 시스템 ' + systems.length + '개를 Supabase에 저장했습니다.';
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
    const count = await importCsvText(await file.text());
    status.textContent = `${count}개 시스템을 등록했습니다. 창을 닫으면 목록에서 확인할 수 있습니다.`;
    fileInput.value = '';
  } catch (error) {
    status.textContent = `${error.message}\n목록을 새로 불러와 등록 여부를 확인한 뒤 다시 시도해주세요.`;
  } finally {
    csvImportInProgress = false;
    button.disabled = false;
  }
});
['closeDialogButton', 'cancelButton'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => dialog.close());
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!systemsReady || savingSystems || !form.reportValidity()) return;
  const system = Object.fromEntries(SYSTEM_FIELDS.map(field => [field, form.elements.namedItem(field).value.trim()]));
  if (SYSTEM_FIELDS.some(field => !system[field])) {
    document.getElementById('formError').textContent = '모든 항목에 공백이 아닌 내용을 입력해주세요.';
    return;
  }
  document.getElementById('formError').textContent = 'Supabase에 저장하고 있습니다…';
  try {
    await saveSystems([system]);
    dialog.close();
    saveStatus.textContent = system.system_name + ' 시스템을 Supabase에 저장했습니다.';
    document.getElementById('formError').textContent = '';
  } catch (error) {
    document.getElementById('formError').textContent = error.message;
  }
});
let loadingSystems = false;
async function initializeSystems() {
  if (loadingSystems || savingSystems) return;
  loadingSystems = true;
  systemsReady = false;
  document.getElementById('addSystemButton').disabled = true;
  document.getElementById('retryLoadButton').hidden = true;
  document.getElementById('connectionStatus').textContent = 'Supabase 연결 중…';
  gridContainer.replaceChildren();
  gridContainer.appendChild(textElement('p', 'empty-state', '시스템 목록을 불러오고 있습니다…'));
  try {
    if (!store) {
      const response = await fetch('data/supabase.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('data/supabase.json 연결 설정을 읽지 못했습니다. 로컬 서버 또는 Live Server로 실행해주세요.');
      store = createSupabaseStore(await response.json());
    }
    const systems = await store.load();
    validateSystemList(systems);
    currentSystems = systems;
    systemsReady = true;
    saveStatus.textContent = '';
    document.getElementById('connectionStatus').textContent = 'Supabase 연결됨 · 공개 데모';
    updateView();
    document.getElementById('addSystemButton').disabled = false;
  } catch (error) {
    currentSystems = [];
    gridContainer.replaceChildren();
    gridContainer.appendChild(textElement('p', 'empty-state', '시스템 목록을 불러오지 못했습니다.'));
    document.getElementById('resultCount').textContent = '목록 불러오기 실패';
    document.getElementById('connectionStatus').textContent = 'Supabase 연결 확인 필요';
    saveStatus.textContent = error.message;
    document.getElementById('retryLoadButton').hidden = false;
  } finally {
    loadingSystems = false;
  }
}
document.getElementById('retryLoadButton').addEventListener('click', initializeSystems);
document.getElementById('reloadSystemsButton').addEventListener('click', initializeSystems);
const initializationPromise = initializeSystems();
