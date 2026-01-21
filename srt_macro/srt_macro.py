import os
import time
import random
from datetime import datetime

from SRT import SRT
from SRT.errors import SRTResponseError, SRTLoginError, SRTNetFunnelError

import smtplib
from email.mime.text import MIMEText
from email.header import Header


# =========================
# 테스트용 하드코딩 설정
# =========================
CONFIG = {
    # SRT 계정
    "srt_id": "2483592517",
    "srt_pw": "yoo4316!",

    # 조회 조건
    "dep": "수서",
    "arr": "대전",
    "date": "20260131",       # YYYYMMDD
    "start_time": "110000",   # HHMMSS
    "limit_time": "130000",   # HHMMSS (이 시간 지나면 종료)

    "seat_pref": "general",   # general | special | any
    "interval_sec": 5.0,

    # 성공/실패 알림 받을 이메일
    "to_email": "amchoking@kaist.ac.kr",

    # 메일 발송 (테스트용 하드코딩)
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "sender_email": "yoocpp@gmail.com",
    "sender_app_pw": "thznxqyprhpfamwg",  # 테스트용 하드코딩 OK라고 해서 그대로 둠
}


def parse_hhmmss(date_yyyymmdd: str, hhmmss: str) -> datetime:
    return datetime.strptime(date_yyyymmdd + hhmmss, "%Y%m%d%H%M%S")


def send_email(subject: str, body: str, to_email: str) -> None:
    msg = MIMEText(body, _charset="utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = CONFIG["sender_email"]
    msg["To"] = to_email

    with smtplib.SMTP(CONFIG["smtp_host"], CONFIG["smtp_port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(CONFIG["sender_email"], CONFIG["sender_app_pw"])
        server.sendmail(CONFIG["sender_email"], [to_email], msg.as_string())


def train_matches_pref(train_obj, seat_pref: str) -> bool:
    s = str(train_obj)
    if seat_pref == "general":
        return "일반실 예약가능" in s
    if seat_pref == "special":
        return "특실 예약가능" in s
    return ("일반실 예약가능" in s) or ("특실 예약가능" in s)


def shutdown_now() -> None:
    os.system("shutdown /s /t 0")


def sleep_with_jitter(base_sec: float) -> None:
    """
    규칙적으로 5초마다 치면 서버가 더 민감해질 수 있어서
    약간 랜덤 지터(0~2초)를 섞어줌.
    """
    jitter = random.uniform(0.0, 2.0)
    time.sleep(max(0.5, base_sec + jitter))


def login_srt():
    """
    세션 리셋/재로그인: SRT 객체를 새로 만드는 게 사실상 세션 리셋이야.
    """
    return SRT(CONFIG["srt_id"], CONFIG["srt_pw"])


def main():
    dep = CONFIG["dep"]
    arr = CONFIG["arr"]
    date = CONFIG["date"]
    start_time = CONFIG["start_time"]
    limit_time = CONFIG["limit_time"]
    seat_pref = CONFIG["seat_pref"]
    interval_sec = float(CONFIG["interval_sec"])
    to_email = CONFIG["to_email"]

    end_dt = parse_hhmmss(date, limit_time)

    print(f"[INFO] 조건: {dep}->{arr} {date} {start_time}~{limit_time} / seat={seat_pref} / interval={interval_sec}s")
    print("[INFO] 로그인 시도...")

    try:
        srt = login_srt()
    except SRTLoginError as e:
        print("[ERROR] 로그인 실패:", e)
        try:
            send_email(
                subject="[SRT 매크로 실패] 로그인 실패",
                body=f"로그인 실패로 작업이 중단되었습니다.\n\n에러: {e}",
                to_email=to_email,
            )
        except Exception as mail_e:
            print("[WARN] 실패 알림 메일 전송 실패:", mail_e)
        return

    print("[INFO] 로그인 성공. 조회 시작...")

    netfunnel_fail_streak = 0  # 연속 NetFunnel 실패 횟수(백오프용)

    while True:
        if datetime.now() >= end_dt:
            print("[INFO] 시간 제한 도달. 종료.")
            try:
                send_email(
                    subject="[SRT 매크로 종료] 시간 제한 도달",
                    body=(
                        f"시간 제한({limit_time})에 도달하여 작업을 종료했습니다.\n"
                        f"조건: {dep}->{arr} {date} {start_time}~{limit_time}\n"
                    ),
                    to_email=to_email,
                )
            except Exception as mail_e:
                print("[WARN] 종료 알림 메일 전송 실패:", mail_e)
            return

        try:
            trains = srt.search_train(dep, arr, date, start_time, limit_time)
            netfunnel_fail_streak = 0  # 성공적으로 조회되면 streak 리셋

        except SRTNetFunnelError as e:
            # ✅ 핵심: NetFunnel 꼬이면 "세션 리셋 + 재로그인"
            netfunnel_fail_streak += 1
            backoff = min(300, 10 * (2 ** (netfunnel_fail_streak - 1)))  # 10,20,40,80... 최대 5분
            print(f"[WARN] NetFunnel 오류({netfunnel_fail_streak}회): {e}")
            print(f"[INFO] 세션 리셋 후 재로그인 시도... (backoff {backoff}s)")

            # 잠깐 쉬고(서버 진정), 새로 로그인
            time.sleep(backoff)

            try:
                srt = login_srt()
                print("[INFO] 재로그인 성공. 조회 재개.")
            except SRTLoginError as le:
                print("[ERROR] 재로그인 실패:", le)
                # 재로그인 실패는 너무 연속으로 메일 폭탄 안 나게 필요시 제한 가능
                sleep_with_jitter(max(interval_sec, 10.0))
            continue

        except (SRTResponseError,) as e:
            # 일반 응답 오류는 가볍게 재시도
            print("[WARN] SRT 응답 오류, 재시도:", type(e).__name__, e)
            sleep_with_jitter(max(interval_sec, 3.0))
            continue

        except Exception as e:
            # 예상 못한 에러도 일단 잠깐 쉬고 계속
            print("[WARN] 예상치 못한 오류, 재시도:", type(e).__name__, e)
            sleep_with_jitter(max(interval_sec, 5.0))
            continue

        candidates = [t for t in trains if train_matches_pref(t, seat_pref)]

        if not candidates:
            print(f"[INFO] 예약 가능 좌석 없음. {interval_sec}초 후 재조회...")
            sleep_with_jitter(interval_sec)
            continue

        target = candidates[0]
        print("[INFO] 예약 시도:", target)

        try:
            reservation = srt.reserve(target)
        except SRTNetFunnelError as e:
            # 예약 단계에서도 NetFunnel 꼬일 수 있어서 동일 처리
            netfunnel_fail_streak += 1
            backoff = min(300, 10 * (2 ** (netfunnel_fail_streak - 1)))
            print(f"[WARN] (예약) NetFunnel 오류({netfunnel_fail_streak}회): {e}")
            print(f"[INFO] 세션 리셋 후 재로그인 시도... (backoff {backoff}s)")
            time.sleep(backoff)
            try:
                srt = login_srt()
                print("[INFO] 재로그인 성공. 예약 재시도는 다음 루프에서 진행.")
            except SRTLoginError as le:
                print("[ERROR] 재로그인 실패:", le)
            continue

        except Exception as e:
            print("[WARN] 예약 시도 실패, 재조회로 복귀:", e)
            sleep_with_jitter(max(interval_sec, 3.0))
            continue

        print("[SUCCESS] 예약 성공!")
        print(reservation)

        # 성공 메일
        try:
            send_email(
                subject=f"[SRT 예약 성공] {dep}->{arr} {date}",
                body=f"예약 성공!\n\n{reservation}\n\n선택 열차:\n{target}\n",
                to_email=to_email,
            )
            print("[INFO] 성공 메일 발송 완료.")
        except Exception as mail_e:
            print("[WARN] 성공 메일 발송 실패:", mail_e)

        # PC 종료
        print("[INFO] 컴퓨터를 종료합니다...")
        #shutdown_now()
        return


if __name__ == "__main__":
    main()