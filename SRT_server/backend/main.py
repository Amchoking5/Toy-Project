#thznxqyprhpfamwg
import asyncio
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr

from SRT import SRT
from SRT.errors import SRTResponseError, SRTLoginError, SRTNetFunnelError

import smtplib
from email.mime.text import MIMEText
from email.header import Header

import logging


app = FastAPI(title="SRT Macro API", version="0.1")
logger = logging.getLogger("uvicorn.error")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS: dict[str, dict] = {}


class JobRequest(BaseModel):
    srt_id: str
    srt_pw: str

    dep: str
    arr: str
    date: str = Field(..., description="YYYYMMDD")
    start_time: str = Field(..., description="HHMMSS (예: 050000)")

    limit_time: str = Field(..., description="HHMMSS (예: 235959) - 이 시간 지나면 중단")
    email: EmailStr

    seat_pref: str = Field("general", description="general|special|any")
    interval_sec: float = Field(3.0, ge=1.0, le=30.0, description="조회 간격(초)")


def _parse_hhmmss(date_yyyymmdd: str, hhmmss: str) -> datetime:
    return datetime.strptime(date_yyyymmdd + hhmmss, "%Y%m%d%H%M%S")


def send_email(subject: str, body: str, to_email: str) -> None:
    SMTP_HOST = "smtp.gmail.com"
    SMTP_PORT = 587
    SENDER_EMAIL = "yoocpp@gmail.com"
    SENDER_APP_PW = "thznxqyprhpfamwg"

    msg = MIMEText(body, _charset="utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_APP_PW)
        server.sendmail(SENDER_EMAIL, [to_email], msg.as_string())


async def send_email_async(subject: str, body: str, to_email: str) -> None:
    # ✅ SMTP 같은 동기 I/O를 이벤트루프 밖(스레드)에서 실행
    await asyncio.to_thread(send_email, subject, body, to_email)


def train_matches_pref(train_obj, seat_pref: str) -> bool:
    s = str(train_obj)
    if seat_pref == "general":
        return "일반실 예약가능" in s
    if seat_pref == "special":
        return "특실 예약가능" in s
    return ("일반실 예약가능" in s) or ("특실 예약가능" in s)


# ✅ SRT 라이브러리가 동기일 가능성이 높아서, 스레드로 빼주는 헬퍼들
async def srt_login_async(srt_id: str, srt_pw: str) -> SRT:
    return await asyncio.to_thread(SRT, srt_id, srt_pw)

async def srt_search_async(srt: SRT, dep: str, arr: str, date: str, start_time: str, limit_time: str):
    return await asyncio.to_thread(srt.search_train, dep, arr, date, start_time, limit_time)

async def srt_reserve_async(srt: SRT, target):
    return await asyncio.to_thread(srt.reserve, target)


async def run_macro(job_id: str, req: JobRequest) -> None:
    def set_state(**kwargs):
        JOBS[job_id].update(kwargs)

    set_state(status="running", started_at=time.time(), last_error=None)

    end_dt = _parse_hhmmss(req.date, req.limit_time)
    logger.info(f"job={job_id} run_macro 시작: {req.dep}->{req.arr} {req.date} {req.start_time}~{req.limit_time}")
    # ✅ 원래 코드에서 선언이 없어서 버그났던 변수
    netfunnel_fail_streak = 0
    search_no_seat_count = 0 

    # 로그인
    try:
        srt = await srt_login_async(req.srt_id, req.srt_pw)
    except SRTLoginError as e:
        set_state(status="failed", last_error="login_failed")
        await send_email_async(
            subject=f"[SRT 매크로 실패] 로그인 실패",
            body=f"로그인 실패로 작업이 중단되었습니다.\n\n에러: {e}",
            to_email=str(req.email),
        )
        return

    try:
        while True:
            if datetime.now() >= end_dt:
                set_state(status="stopped", last_error="time_limit_reached")
                await send_email_async(
                    subject=f"[SRT 매크로 종료] 시간 제한 도달",
                    body=f"시간 제한({req.limit_time})에 도달하여 작업을 종료했습니다.\n"
                         f"조건: {req.dep}->{req.arr} {req.date} {req.start_time}~{req.limit_time}\n",
                    to_email=str(req.email),
                )
                return

            try:
                trains = await srt_search_async(srt, req.dep, req.arr, req.date, req.start_time, req.limit_time)

            except SRTNetFunnelError as e:
                netfunnel_fail_streak += 1
                backoff = min(300, 10 * (2 ** (netfunnel_fail_streak - 1)))

                logger.warning(f"job={job_id} NetFunnel 오류({netfunnel_fail_streak}회): {e}")
                logger.info(f"job={job_id} 세션 리셋 후 재로그인 시도... (backoff {backoff}s)")

                await asyncio.sleep(backoff)

                try:
                    srt = await srt_login_async(req.srt_id, req.srt_pw)
                    logger.info(f"job={job_id} 재로그인 성공. 조회 재개.")
                    netfunnel_fail_streak = 0  # 선택: 성공했으면 streak 리셋
                except SRTLoginError as le:
                    logger.error(f"job={job_id} 재로그인 실패: {le}")
                    await asyncio.sleep(max(req.interval_sec, 10.0))

                continue

            except SRTResponseError as e:
                set_state(last_error=f"srt_response_error: {type(e).__name__}")
                await asyncio.sleep(max(req.interval_sec, 3.0))
                continue

            except Exception as e:
                logger.warning(f"job={job_id} 예상치 못한 오류({type(e).__name__}): {e} - 재시도")
                await asyncio.sleep(max(req.interval_sec, 5.0))
                continue

            candidates = [t for t in trains if train_matches_pref(t, req.seat_pref)]
            if not candidates:
                search_no_seat_count += 1
                set_state(last_checked_at=time.time(), last_error=None, no_seat_count=search_no_seat_count)

                wait_s = req.interval_sec
                logger.info(f"job={job_id} 검색 {search_no_seat_count}회 실패(좌석없음) - {wait_s:.1f}s 대기")

                await asyncio.sleep(wait_s)
                continue

            target = candidates[0]
            reservation = await srt_reserve_async(srt, target)

            set_state(status="success", finished_at=time.time(), result=str(reservation))
            await send_email_async(
                subject=f"[SRT 예약 성공] {req.dep}->{req.arr} {req.date}",
                body=f"예약 성공!\n\n{reservation}\n\n선택 열차:\n{target}\n",
                to_email=str(req.email),
            )
            return

    except Exception as e:
        set_state(status="failed", last_error=f"unexpected: {type(e).__name__}")
        await send_email_async(
            subject=f"[SRT 매크로 실패] 예기치 않은 오류",
            body=f"작업 중 예기치 않은 오류가 발생했습니다.\n\n에러: {e}",
            to_email=str(req.email),
        )
        return


@app.post("/jobs", status_code=202)
async def create_job(req: JobRequest):
    job_id = str(uuid.uuid4())

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "created_at": time.time(),
        "meta": {
            "dep": req.dep,
            "arr": req.arr,
            "date": req.date,
            "start_time": req.start_time,
            "limit_time": req.limit_time,
            "email": str(req.email),
            "seat_pref": req.seat_pref,
            "interval_sec": req.interval_sec,
        },
    }

    asyncio.create_task(run_macro(job_id, req))

    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job
