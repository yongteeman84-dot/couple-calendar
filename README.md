# Couple Calendar

Next.js 기반의 커플 일정 캘린더 앱입니다.  
일자별 메모와 색상을 저장하며, 데이터는 PostgreSQL `schedules` 테이블에 저장됩니다.

## 요구사항

- Node.js 20+
- PostgreSQL 연결 문자열 (`DATABASE_URL`)

## 환경 변수

`couple-calendar/.env.local` 파일을 만들고 아래 값을 설정합니다.

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
```

## 설치 및 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## 데이터 저장 방식

- API: `GET /api/schedule`, `POST /api/schedule`
- 테이블: `schedules(date varchar(10) primary key, memo text, color varchar(20))`
- 서버 시작 후 첫 요청 시 테이블이 없으면 자동 생성

## 메모 삭제 규칙

아래 조건이면 해당 날짜 데이터가 삭제됩니다.

- 메모가 비어 있음
- 색상이 기본 색상(`#ec4899`)이거나 비어 있음

## DB 연결 테스트 (선택)

```bash
node test_db.js
```

`couple-calendar/.env.local`의 `DATABASE_URL`을 사용해 연결을 확인합니다.
