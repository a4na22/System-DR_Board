/** DR 시스템 예시 데이터 및 화면 제어. 예시 사양은 실제 시스템 정보가 아닙니다. */
const SYSTEM_TYPES = ['A-A', 'A-S', 'STORAGE', 'NONE', 'PPP'];
const STORAGE_KEY = 'dr-board.custom-systems.v1';
const SYSTEM_FIELDS = ['system_name', 'config_id', 'dr_type', 'business_type', 'data_spec', 'rpo_target', 'rto_target'];
const exampleGroups = [
  ['A-A', '0초', '수분 이내', [
    ['통합민원신청시스템', '민원 접수 및 처리'], ['전자납부시스템', '세금 및 수수료 납부'],
    ['재난상황관리시스템', '재난 상황 접수 및 전파'], ['긴급알림전송시스템', '긴급 안내 메시지 발송'],
    ['통합인증시스템', '사용자 인증 및 세션 관리'], ['행정정보중계시스템', '기관 간 행정정보 연계']
  ]],
  ['A-S', '수분 이내', '수시간 이내', [
    ['예산회계관리시스템', '예산 편성 및 회계 처리'], ['인사급여관리시스템', '인사 및 급여 관리'],
    ['전자결재시스템', '행정 문서 결재'], ['계약관리시스템', '계약 체결 및 이행 관리'],
    ['시설물관리시스템', '공공시설 점검 및 유지보수'], ['보조금관리시스템', '보조금 신청 및 집행 관리']
  ]],
  ['STORAGE', '수시간', '수일~수주 이내', [
    ['행정문서보관시스템', '행정 문서 장기 보관'], ['공간정보저장시스템', '지도 및 공간정보 저장'],
    ['공공영상보관시스템', '공공 영상 기록 보관'], ['통계원천자료시스템', '통계 원천 데이터 보관'],
    ['전자기록관리시스템', '전자 기록물 관리'], ['공공도서자료시스템', '디지털 도서 및 자료 보관']
  ]],
  ['NONE', 'DR 적용 면제 (백업 기반 수동 복구)', 'DR 적용 면제 (백업 기반 수동 복구)', [
    ['정책홍보게시판', '정책 소식 및 홍보 자료 게시'], ['직원동호회게시판', '직원 동호회 활동 안내'],
    ['교육일정안내시스템', '교육 일정 및 장소 안내'], ['행사사진게시판', '행사 사진 공유'],
    ['구내식당안내시스템', '식단 및 운영 시간 안내'], ['내부설문게시판', '내부 의견 수렴']
  ]],
  ['PPP', '민간 클라우드 이전 계획에 따름', '민간 클라우드 이전 계획에 따름', [
    ['대국민설문플랫폼', '대국민 온라인 설문'], ['공공교육플랫폼', '온라인 교육 콘텐츠 제공'],
    ['행사예약플랫폼', '공공 행사 예약 및 접수'], ['관광정보플랫폼', '지역 관광 정보 제공'],
    ['공공데이터분석플랫폼', '공공데이터 분석 및 시각화'], ['시민참여플랫폼', '시민 제안 및 참여 접수']
  ]]
];
const mockDrSystems = exampleGroups.flatMap(([type, rpo, rto, systems], groupIndex) =>
  systems.map(([name, business], index) => ({
    system_id: `SYS-${String(groupIndex * 6 + index + 1).padStart(3, '0')}`,
    config_id: `CI-${String(groupIndex * 6 + index + 1).padStart(4, '0')}`,
    dr_type: type,
    system_name: name,
    business_type: business,
    data_spec: type === 'STORAGE'
      ? `SAN/NAS ${(index + 1) * 20}TB / 블록 복제 [임의 설정]`
      : `DB ${(index + 1) * 2}TB (${type === 'A-A' ? 'PostgreSQL HA' : 'PostgreSQL'}) / 피크 ${(index + 1) * 500} TPS [임의 설정]`,
    rpo_target: rpo,
    rto_target: rto
  }))
);

const gridContainer = document.getElementById('systemGrid');
const searchInput = document.getElementById('searchInput');
const filterContainer = document.getElementById('filterContainer');
const dialog = document.getElementById('systemDialog');
const form = document.getElementById('systemForm');
const saveStatus = document.getElementById('saveStatus');
let customSystems = [];
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!Array.isArray(stored) || !stored.every(system => isValidSystem(system, true)) ||
      new Set(stored.map(system => system.system_id)).size !== stored.length) {
    throw new Error('Invalid saved systems');
  }
  // 기존 브라우저 저장 데이터에는 구성 ID를 부여해 시스템을 그대로 유지합니다.
  const usedIds = new Set(mockDrSystems.map(system => normalizeConfigId(system.config_id)));
  for (const system of stored.filter(system => system.config_id !== undefined)) {
    const id = normalizeConfigId(system.config_id);
    if (usedIds.has(id)) throw new Error('Duplicate configuration ID');
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
let currentSystems = [...mockDrSystems, ...customSystems];
let activeType = 'ALL';
let searchKeyword = '';

function normalizeConfigId(id) {
  return id.trim().toUpperCase();
}
function isValidSystem(system, allowLegacy = false) {
  return system && SYSTEM_FIELDS.every(field =>
    (allowLegacy && field === 'config_id' && system[field] === undefined) ||
    (typeof system[field] === 'string' && system[field].trim())) &&
    SYSTEM_TYPES.includes(system.dr_type) && typeof system.system_id === 'string' && system.system_id.startsWith('CUSTOM-');
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
  searchKeyword = event.target.value;
  updateView();
});
filterContainer.addEventListener('click', event => {
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
updateView();
