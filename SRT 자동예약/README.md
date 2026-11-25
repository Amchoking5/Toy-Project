---
id: srt-macro
title: SRT 자동 예약
subtitle: 취소표 자동 조회·예약 및 메일 알림
emoji: 🚄
period: "2026.01"
team: 개인 프로젝트
order: 1
roles:
  - 예약 매크로 및 오류 복구 로직
  - FastAPI 백엔드 / 웹 폼 프론트엔드
stack:
  Back-end: [Python, FastAPI, SRTrain, SMTP]
  Front-end: [HTML, CSS, JavaScript]
gallery: []
links: []
---
# SRT 자동 예약

원하는 구간·날짜·시간대의 SRT 좌석을 주기적으로 조회하다가 빈 좌석이 생기면 바로 예약하고, 결과를 이메일로 알려 주는 프로그램입니다. 처음에는 콘솔 스크립트로 만들었고, 이후 웹 폼에서 조건을 입력하면 서버가 백그라운드 작업으로 돌리는 구조로 확장했습니다.

## 핵심 기능

### 좌석 조회와 자동 예약
- 출발역, 도착역, 날짜, 시간 범위, 좌석 종류(일반실/특실/아무거나)를 조건으로 조회합니다.
- 조건에 맞는 열차가 나오면 바로 예약하고, 제한 시간이 지나면 작업을 종료합니다.
- 조회 간격에 0–2초 랜덤 지터를 섞어 요청이 지나치게 규칙적이지 않게 했습니다.

### 오류 복구
- NetFunnel(접속 대기열) 오류가 나면 지수 백오프(10초 → 최대 5분) 후 세션을 새로 만들어 재로그인합니다.
- 일반 응답 오류나 예상하지 못한 오류는 잠시 쉰 뒤 다시 조회합니다.

### 웹 서버 버전
- FastAPI `POST /jobs`로 작업을 등록하면 `asyncio` 백그라운드 작업으로 실행되고, `GET /jobs/{id}`로 상태를 확인할 수 있습니다.
- 동기 라이브러리(SRTrain, SMTP)는 `asyncio.to_thread`로 감싸 이벤트 루프가 막히지 않게 했습니다.
- 예약 성공, 실패, 시간 초과 결과를 Gmail SMTP로 메일 발송합니다.

## 폴더 구성

| 폴더 | 내용 |
|---|---|
| `macro/` | 콘솔에서 바로 실행하는 매크로 (`run.bat`) |
| `backend/` | FastAPI 서버 |
| `frontend/` | 조건 입력 웹 폼 |

## 실행 방법

각 폴더의 `.env.example`을 `.env`로 복사하고 값을 채웁니다.

```
# 콘솔 버전
cd macro && python srt_macro.py

# 웹 버전
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
cd frontend && python -m http.server 5500
```
