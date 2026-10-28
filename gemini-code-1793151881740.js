/**
 * 💡 logic.js: Pure Business Logic
 * UI나 DB 의존성 없이 필터링 및 검색 규칙만 담당
 */

// 1. 유형별 데이터 필터링 함수
function filterSystemsByType(systems, type) {
  if (!type || type === 'ALL') return systems;
  return systems.filter(sys => sys.dr_type === type);
}

// 2. 키워드 검색 함수 (시스템명, 구성 ID, 업무 성격)
function searchSystemsByKeyword(systems, keyword) {
  if (!keyword || keyword.trim() === '') return systems;
  const lowerKeyword = keyword.toLowerCase().trim();
  return systems.filter(sys => 
    sys.system_name.toLowerCase().includes(lowerKeyword) ||
    (sys.config_id || '').toLowerCase().includes(lowerKeyword) ||
    sys.business_type.toLowerCase().includes(lowerKeyword)
  );
}

// 3. 통합 매칭 로직
function getFilteredSystems(systems, selectedType, keyword) {
  let result = filterSystemsByType(systems, selectedType);
  result = searchSystemsByKeyword(result, keyword);
  return result;
}

// 따옴표 안의 쉼표·줄바꿈·이스케이프된 따옴표를 지원하는 CSV 파서.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  const source = text.replace(/^\uFEFF/, '');
  const pushField = () => { row.push(field); field = ''; afterQuote = false; };
  const pushRow = () => {
    pushField();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
    } else if (char === ',') pushField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      pushRow();
    } else if (char === '"') {
      if (field || afterQuote) throw new Error('CSV 따옴표 형식이 올바르지 않습니다. 양식을 확인해주세요.');
      quoted = true;
    } else {
      if (afterQuote) throw new Error('CSV 닫는 따옴표 뒤에 쉼표 또는 줄바꿈이 필요합니다.');
      field += char;
    }
  }
  if (quoted) throw new Error('CSV에 닫히지 않은 따옴표가 있습니다.');
  pushRow();
  return rows;
}
function parseSystemsCsv(text) {
  const columns = [
    ['system_name', '시스템명', 100], ['config_id', '구성 ID', 100], ['dr_type', 'DR 유형', 100],
    ['business_type', '업무 성격', 200], ['data_spec', '데이터 사양', 200],
    ['rpo_target', 'RPO 목표', 100], ['rto_target', 'RTO 목표', 100]
  ];
  if (text.includes('\uFFFD')) throw new Error('파일 인코딩을 확인해주세요. CSV UTF-8 형식으로 저장해야 합니다.');
  const [header, ...rows] = parseCsv(text);
  if (!header || !rows.length) throw new Error('CSV에 제목 행과 시스템 데이터가 필요합니다.');
  const normalizeHeader = value => value.replace(/\s/g, '').toLowerCase();
  const normalizedHeader = header.map(normalizeHeader);
  if (new Set(normalizedHeader).size !== header.length) throw new Error('CSV에 중복된 열 제목이 있습니다.');
  const positions = columns.map(([field, label]) => {
    const index = normalizedHeader.findIndex(value => value === normalizeHeader(field) || value === normalizeHeader(label));
    if (index < 0) throw new Error(`CSV에 필수 열이 없습니다: ${label}`);
    return index;
  });
  if (new Set(positions).size !== header.length) throw new Error('CSV 열 제목을 다운로드 양식에 맞춰주세요.');
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== header.length) throw new Error(`${rowNumber}번째 데이터 행: 열 개수가 제목 행과 다릅니다.`);
    const system = {};
    columns.forEach(([field, label, maxLength], column) => {
      const value = row[positions[column]].trim();
      if (!value) throw new Error(`${rowNumber}번째 데이터 행: ${label} 항목이 비어 있습니다.`);
      if (value.length > maxLength) throw new Error(`${rowNumber}번째 데이터 행: ${label} 항목은 ${maxLength}자 이내로 입력해주세요.`);
      system[field] = value;
    });
    system.dr_type = system.dr_type.toUpperCase();
    if (!['A-A', 'A-S', 'STORAGE', 'NONE', 'PPP'].includes(system.dr_type)) {
      throw new Error(`${rowNumber}번째 데이터 행: DR 유형은 A-A, A-S, STORAGE, NONE, PPP 중 하나여야 합니다.`);
    }
    return system;
  });
}
