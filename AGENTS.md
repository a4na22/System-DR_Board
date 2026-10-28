# 프로젝트 규칙

- 정적 데이터는 data/ 폴더 JSON에 둔다. `data/tasks.json`은 예시 데이터 이전용 원본이고 `data/supabase.json`은 브라우저 공개 연결 설정이다.
- 운영 정보시스템 목록은 Supabase `public.dr_systems`에서 조회·등록한다. 앱 JavaScript에 목록을 하드코딩하거나 localStorage·JSON을 운영 데이터처럼 대체 표시하지 않는다.
- `supabase-data.js`가 Supabase Data API 통신을 담당하고 `app.js`는 조회 성공 후에만 검색과 추가 기능을 사용한다.
- 구성 ID는 대소문자와 앞뒤 공백을 무시하고 중복 검사하며 DB에서도 고유 인덱스로 보호한다. 내부 ID는 UUID로 생성한다.
- 사용자가 선택한 공개 데모는 로그인 없이 조회·등록을 허용한다. 공개 키만 브라우저에 사용하고 secret/service_role 키를 코드에 넣지 않는다.
- DB 권한은 `supabase/public-demo.sql`로 프로젝트 소유자가 적용한다. 앱에서 RLS를 끄거나 권한을 우회하지 않는다.
- 기존 브라우저 데이터는 자동 삭제하거나 서버에 자동 업로드하지 않는다.
- 데이터 변경 시 DB 조회·등록, 중복과 일괄 저장 실패, 권한 오류 및 연결 실패를 검증한다.
