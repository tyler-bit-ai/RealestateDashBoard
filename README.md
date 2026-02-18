# Real Estate Dashboard (Google Sheets 연동)

Google Sheets 데이터를 동적으로 읽어와 매물 현황을 대시보드 형태로 보여주는 React + Vite 프로젝트입니다.

## 1) 실행

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## 2) 환경 변수 설정

`.env` 파일에서 아래 값을 채우세요.

```env
VITE_GOOGLE_SHEET_ID=your_google_sheet_id
VITE_GOOGLE_SHEET_GID=
VITE_GOOGLE_SHEET_NAME=Sheet1
VITE_GOOGLE_SHEET_QUERY=select *
```

- `VITE_GOOGLE_SHEET_ID`: 시트 URL의 `/d/{ID}/edit` 부분
- `VITE_GOOGLE_SHEET_GID`: 특정 탭 `gid` (설정 시 `VITE_GOOGLE_SHEET_NAME`보다 우선)
- `VITE_GOOGLE_SHEET_NAME`: 탭 이름
- `VITE_GOOGLE_SHEET_QUERY`: Google Visualization Query (`select *`, `select A,B,C` 등)

## 3) Google Sheets 공개 설정

대시보드에서 읽으려면 시트가 외부 조회 가능해야 합니다.

1. Google Sheets에서 `공유` 또는 `웹에 게시` 설정을 엽니다.
2. 링크가 있는 사용자에게 읽기 권한을 부여합니다.
3. `.env`에 시트 ID와 탭 이름을 입력합니다.

## 4) 현재 구현 범위

- Google Sheets API(gviz endpoint)로 실시간 데이터 조회
- 기본 KPI 카드: 총 매물 수, 활성 매물 수, 평균 가격
- 전체 데이터 테이블 렌더링
- 새로고침 버튼으로 즉시 재조회

## 5) 다음 확장 아이디어

- 지역/가격/상태 필터
- 차트(월별 거래량, 가격 분포)
- 인증이 필요한 비공개 시트 연동(서버 프록시 + 서비스 계정)
