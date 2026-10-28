/**
 * ⚡ app.js: DOM Event Handling & Supabase Data Fetching
 */

// 📌 [임의 설정 표기] DB 연결 및 로컬 미러링 데이터
// 실제 Supabase 연동 시 아래 주석 해제 후 키 설정
/*
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
*/

// 임의 데이터셋 (Supabase fallback / 예시 데이터) [임의 지정 항목]
const mockDrSystems = [
  {
    system_id: 'SYS-001',
    dr_type: 'A-A',
    system_name: '[시스템 A] 통합민원신청시스템',
    business_type: '대국민 핵심 서비스 (상시 무중단 이중화)',
    data_spec: 'DB 15TB (Oracle RAC) / 피크 3,500 TPS [임의 설정]',
    rpo_target: '0초',
    rto_target: '수 분 이내'
  },
  {
    system_id: 'SYS-002',
    dr_type: 'A-S',
    system_name: '[시스템 B] 정부통합인증시스템',
    business_type: '인증 및 세션 관리 (대기형 이중화)',
    data_spec: 'DB 4TB (PostgreSQL) / 피크 1,800 TPS [임의 설정]',
    rpo_target: '수 분 이내',
    rto_target: '수 시간 이내'
  },
  {
    system_id: 'SYS-003',
    dr_type: 'STORAGE',
    system_name: '[시스템 C] GPKI 키저장소',
    business_type: '대용량 보안 데이터 (스토리지 블록 복제)',
    data_spec: 'SAN/NAS Block 120TB / Sequential I/O [임의 설정]',
    rpo_target: '수 시간',
    rto_target: '수 일 ~ 수 주 이내'
  },
  {
    system_id: 'SYS-004',
    dr_type: 'NONE',
    system_name: '[시스템 D] 단순 정책 홍보 게시판',
    business_type: '비핵심 정보 제공 (DR 구축 제외)',
    data_spec: 'Web 500GB / DB 100GB (MySQL) [임의 설정]',
    rpo_target: '면제 (백업 기반 수동복구)',
    rto_target: '면제 (백업 기반 수동복구)'
  },
  {
    system_id: 'SYS-005',
    dr_type: 'PPP',
    system_name: '[시스템 E] 대국민 설문조사 플랫폼',
    business_type: '트래픽 가변 플랫폼 (민간 클라우드 이관)',
    data_spec: 'Object 5TB / 최대 10,000 TPS Auto-scaling [임의 설정]',
    rpo_target: '민간 클라우드 활용 전환',
    rto_target: '민간 클라우드 활용 전환'
  }
];

let currentSystems = [...mockDrSystems];
let activeType = 'ALL';
let searchKeyword = '';

// DOM Elements
const gridContainer = document.getElementById('systemGrid');
const searchInput = document.getElementById('searchInput');
const filterContainer = document.getElementById('filterContainer');

// 카드 렌더링 함수
function renderCards(data) {
  gridContainer.innerHTML = '';
  
  if (data.length === 0) {
    gridContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #64748b;">검색 결과가 없습니다.</p>';
    return;
  }

  data.forEach(sys => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <span class="badge">${sys.dr_type}</span>
        <small style="color:#94a3b8">${sys.system_id}</small>
      </div>
      <h3 class="card-title">${sys.system_name}</h3>
      <div class="card-body" style="margin-top: 0.8rem;">
        <p><strong>업무 성격:</strong> ${sys.business_type}</p>
        <p><strong>데이터 사양:</strong> ${sys.data_spec}</p>
        <p><strong>RPO 목표:</strong> <span style="color:#d97706; font-weight:600">${sys.rpo_target}</span></p>
        <p><strong>RTO 목표:</strong> <span style="color:#2563eb; font-weight:600">${sys.rto_target}</span></p>
      </div>
    `;
    gridContainer.appendChild(card);
  });
}

// 업데이트 처리
function updateView() {
  const filtered = getFilteredSystems(currentSystems, activeType, searchKeyword);
  renderCards(filtered);
}

// 이벤트 리스너 설정
searchInput.addEventListener('input', (e) => {
  searchKeyword = e.target.value;
  updateView();
});

filterContainer.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    document.querySelectorAll('.filter-buttons .btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeType = e.target.getAttribute('data-type');
    updateView();
  }
});

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  updateView();
});