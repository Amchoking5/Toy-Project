const form = document.getElementById("f");
const out = document.getElementById("out");

const API_BASE = "http://127.0.0.1:8000";

function yyyymmdd(dateStr /* "YYYY-MM-DD" */) {
  return dateStr.replaceAll("-", "");
}

function hhmmss(timeStr /* "HH:MM" or "HH:MM:SS" */) {
  // "05:00" -> "050000"
  const parts = timeStr.split(":");
  const hh = (parts[0] ?? "00").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  const ss = (parts[2] ?? "00").padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

function validateLimit(startUI, limitUI) {
  // 같은 날짜 기준으로만 비교
  const [sh, sm] = startUI.split(":").map(Number);
  const [lh, lm] = limitUI.split(":").map(Number);
  return (lh * 60 + lm) >= (sh * 60 + sm);
}

// UX: 오늘 날짜 기본값
(function initDefaults() {
  const dateEl = document.querySelector('input[name="date_ui"]');
  if (dateEl && !dateEl.value) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    dateEl.value = `${yyyy}-${mm}-${dd}`;
  }
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.textContent = "요청 중...";

  const fd = new FormData(form);

  const dateUI = String(fd.get("date_ui") || "");
  const startUI = String(fd.get("start_ui") || "");
  const limitUI = String(fd.get("limit_ui") || "");

  if (!dateUI || !startUI || !limitUI) {
    out.textContent = "날짜/시간을 입력해줘.";
    return;
  }

  if (!validateLimit(startUI, limitUI)) {
    out.textContent = "리밋 시간이 시작 시간보다 빠릅니다. 다시 설정해줘.";
    return;
  }

  const payload = {
    srt_id: String(fd.get("srt_id") || "").trim(),
    srt_pw: String(fd.get("srt_pw") || ""),
    dep: String(fd.get("dep") || "").trim(),
    arr: String(fd.get("arr") || "").trim(),
    date: yyyymmdd(dateUI),
    start_time: hhmmss(startUI),
    limit_time: hhmmss(limitUI),
    email: String(fd.get("email") || "").trim(),
    seat_pref: String(fd.get("seat_pref") || "general"),
    interval_sec: Number(fd.get("interval_sec") || 3),
  };

  try {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      out.textContent = `요청 실패: ${res.status}\n` + (await res.text());
      return;
    }

    const json = await res.json();
    out.textContent = `접수 완료!\njob_id: ${json.job_id}\n(결과는 이메일로 발송됨)`;
  } catch (err) {
    out.textContent = "네트워크 오류: " + String(err);
  }
});
