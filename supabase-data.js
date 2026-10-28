/** Supabase Data API. 공개 키는 apikey 헤더로 전달합니다. */
function createSupabaseStore(config, fetcher = fetch) {
  if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url) ||
      !config.publishableKey?.startsWith('sb_publishable_') || !/^[a-z_][a-z0-9_]*$/.test(config.table)) {
    throw new Error('Supabase 연결 설정을 확인해주세요.');
  }
  const endpoint = `${config.url}/rest/v1/${config.table}`;
  async function request(query, options = {}) {
    let response;
    try {
      response = await fetcher(endpoint + query, {
        ...options,
        headers: { apikey: config.publishableKey, ...options.headers },
        cache: 'no-store',
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      throw new Error('Supabase에 연결하지 못했습니다. 인터넷 연결과 프로젝트 상태를 확인해주세요.');
    }
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok) {
      if (result?.code === '23505') throw new Error('이미 등록된 구성 ID 또는 시스템 ID입니다. 목록을 새로 불러온 뒤 확인해주세요.');
      if ([401, 403].includes(response.status) || result?.code === '42501') {
        throw new Error('Supabase 접근 권한이 없습니다. 공개 데모의 조회·등록 정책을 확인해주세요.');
      }
      if (result?.code === 'PGRST205' || result?.code === '42P01') throw new Error('Supabase에 dr_systems 테이블을 먼저 생성해주세요.');
      throw new Error(`Supabase 요청이 실패했습니다 (HTTP ${response.status}). ${result?.message || ''}`);
    }
    if (!Array.isArray(result)) throw new Error('Supabase 응답 형식이 올바르지 않습니다.');
    return result;
  }
  return {
    async load() {
      const result = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await request(`?select=*&order=system_id.asc&limit=${pageSize}&offset=${offset}`);
        result.push(...page);
        if (page.length < pageSize) return result;
      }
    },
    async insert(systems) {
      return request('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(systems)
      });
    }
  };
}
if (typeof module !== 'undefined') module.exports = { createSupabaseStore };
