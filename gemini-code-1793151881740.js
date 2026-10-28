/**
 * 💡 logic.js: Pure Business Logic
 * UI나 DB 의존성 없이 필터링 및 검색 규칙만 담당
 */

// 1. 유형별 데이터 필터링 함수
function filterSystemsByType(systems, type) {
  if (!type || type === 'ALL') return systems;
  return systems.filter(sys => sys.dr_type === type);
}

// 2. 키워드 검색 함수 (시스템명 & 업무특성)
function searchSystemsByKeyword(systems, keyword) {
  if (!keyword || keyword.trim() === '') return systems;
  const lowerKeyword = keyword.toLowerCase().trim();
  return systems.filter(sys => 
    sys.system_name.toLowerCase().includes(lowerKeyword) ||
    sys.business_type.toLowerCase().includes(lowerKeyword)
  );
}

// 3. 통합 매칭 로직
function getFilteredSystems(systems, selectedType, keyword) {
  let result = filterSystemsByType(systems, selectedType);
  result = searchSystemsByKeyword(result, keyword);
  return result;
}