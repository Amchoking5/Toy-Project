// 스도쿠 풀이 페이지 화면 로직 (solver.js의 solve, findConflicts 사용)

const boardEl = document.getElementById("board");
const wrapEl = document.getElementById("board-wrap");
const pickerEl = document.getElementById("picker");
const statusEl = document.getElementById("status");

const given = new Array(81).fill(0);   // 사용자가 입력한 숫자
const shown = new Array(81).fill(0);   // 화면에 보이는 숫자 (입력 + 풀이)
const hinted = new Array(81).fill(false); // 힌트로 채운 칸 (given에 포함, 색만 다르게)
let hintCount = 0;
const unsure = new Set();               // 사진 인식이 불확실한 칸 (주황 테두리)
let selected = 0;
let conflictMsg = false;               // 지금 상태 문구가 '겹치는 숫자' 경고인지
let pickerOpen = false;

// 판 만들기
const cells = [];
for (let i = 0; i < 81; i++) {
  const r = Math.floor(i / 9), c = i % 9;
  const el = document.createElement("div");
  el.className = "cell row-" + (r + 1);
  if ((Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 1) el.classList.add("alt");
  el.tabIndex = i === 0 ? 0 : -1;
  el.setAttribute("role", "gridcell");
  el.addEventListener("click", () => {
    const reopen = !(pickerOpen && selected === i);   // 열린 칸을 다시 누르면 닫기
    select(i);
    reopen ? openPicker(i) : closePicker();
  });
  boardEl.appendChild(el);
  cells.push(el);
}

function render() {
  const conflicts = findConflicts(shown);
  const r0 = Math.floor(selected / 9), c0 = selected % 9;
  const b0 = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);
  const v0 = shown[selected];
  for (let i = 0; i < 81; i++) {
    const el = cells[i], v = shown[i];
    const r = Math.floor(i / 9), c = i % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    el.textContent = v || "";
    el.classList.toggle("given", given[i] > 0 && !hinted[i]);
    el.classList.toggle("hint", hinted[i]);
    el.classList.toggle("unsure", unsure.has(i));
    el.classList.toggle("solved", !given[i] && v > 0);
    el.classList.toggle("bad", conflicts.has(i));
    el.classList.toggle("selected", i === selected);
    el.classList.toggle("peer", i !== selected && (r === r0 || c === c0 || b === b0));
    el.classList.toggle("same", i !== selected && v0 > 0 && v === v0);
    el.setAttribute("aria-label", `${r + 1}행 ${c + 1}열 ${v || "빈칸"}`);
  }
  if (conflicts.size) { setStatus("같은 행·열·3×3 칸에 겹치는 숫자가 있어요.", "error"); conflictMsg = true; }
  else if (conflictMsg) { setStatus(""); conflictMsg = false; }
}

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function select(i) {
  cells[selected].tabIndex = -1;
  selected = i;
  cells[i].tabIndex = 0;
  cells[i].focus();
  render();
}

function clearSolution() {
  for (let i = 0; i < 81; i++) shown[i] = given[i];
}

function input(n) {
  clearSolution();            // 문제를 고치면 이전 풀이는 지운다
  given[selected] = n;
  shown[selected] = n;
  hinted[selected] = false;   // 직접 고치면 힌트·인식 불확실 표시는 없앤다
  unsure.delete(selected);
  setStatus("");
  render();
}

// 키보드
boardEl.addEventListener("keydown", e => {
  const r = Math.floor(selected / 9), c = selected % 9;
  const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (move) {
    e.preventDefault();
    closePicker();
    select(((r + move[0] + 9) % 9) * 9 + (c + move[1] + 9) % 9);
  } else if (/^[1-9]$/.test(e.key)) {
    input(+e.key);
  } else if (["Backspace", "Delete", "0", " "].includes(e.key)) {
    e.preventDefault();
    input(0);
  }
});

// 원형 선택창: 1~9, 힌트, 지우기 11개를 칸 둘레에 원형으로 배치 (가운데는 비워서 칸이 보이게)
const pickerBtns = [];
for (let n = 1; n <= 9; n++) pickerBtns.push(makePickerBtn(String(n), `${n} 입력`, () => input(n)));
const pickerHint = makePickerBtn("💡", "힌트", () => giveHint(selected), "hint-btn");
const pickerErase = makePickerBtn("⌫", "지우기", () => input(0), "erase");
pickerBtns.push(pickerHint, pickerErase);

function makePickerBtn(label, aria, action, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-label", aria);
  b.setAttribute("role", "menuitem");
  if (cls) b.classList.add(cls);
  b.addEventListener("click", e => {
    e.stopPropagation();
    closePicker();
    action();
    cells[selected].focus();
  });
  pickerEl.appendChild(b);
  return b;
}

function openPicker(i) {
  const cell = cells[i].getBoundingClientRect();
  const wrap = wrapEl.getBoundingClientRect();
  const d = Math.max(34, Math.min(44, cell.width * 0.8));  // 버튼 지름
  const r = d * 1.95;                                       // 버튼 11개가 놓이는 원의 반지름
  const reach = r + d / 2 + 6;

  // 칸 중심을 기준으로 하되, 화면 밖으로 나가지 않게 안쪽으로 당긴다
  const vw = document.documentElement.clientWidth;
  let cx = cell.left + cell.width / 2, cy = cell.top + cell.height / 2;
  cx = Math.min(Math.max(cx, reach + 4), vw - reach - 4);
  cy = Math.max(cy, reach + 4);

  pickerEl.style.left = cx - wrap.left + "px";
  pickerEl.style.top = cy - wrap.top + "px";
  pickerEl.style.setProperty("--d", d + "px");
  pickerEl.style.setProperty("--r", r + "px");

  // 같은 행·열·3×3에 이미 있는 숫자는 흐리게
  const row = Math.floor(i / 9), col = i % 9;
  const used = new Set();
  for (let j = 0; j < 81; j++) {
    if (j === i || !shown[j]) continue;
    const rj = Math.floor(j / 9), cj = j % 9;
    if (rj === row || cj === col || (Math.floor(rj / 3) === Math.floor(row / 3) && Math.floor(cj / 3) === Math.floor(col / 3))) used.add(shown[j]);
  }

  pickerBtns.forEach((b, k) => {
    const a = (k / pickerBtns.length) * 2 * Math.PI - Math.PI / 2;  // 1이 맨 위, 시계 방향
    b.style.setProperty("--x", (Math.cos(a) * r).toFixed(1) + "px");
    b.style.setProperty("--y", (Math.sin(a) * r).toFixed(1) + "px");
    b.style.animationDelay = k * 10 + "ms";
    if (k < 9) {
      b.classList.toggle("used", used.has(k + 1));
      b.classList.toggle("current", shown[i] === k + 1);
    }
  });
  pickerHint.classList.toggle("used", given[i] > 0);   // 이미 숫자가 있으면 힌트는 흐리게
  pickerErase.classList.toggle("used", !shown[i]);
  pickerEl.hidden = false;
  pickerOpen = true;
}

function closePicker() {
  pickerEl.hidden = true;
  pickerOpen = false;
}

// 바깥을 누르거나 Esc를 누르면 닫기
document.addEventListener("pointerdown", e => {
  if (pickerOpen && !pickerEl.contains(e.target) && !boardEl.contains(e.target)) closePicker();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closePicker(); });
window.addEventListener("resize", closePicker);

function runSolve() {
  clearSolution();
  if (findConflicts(given).size) { render(); return null; }
  const t = performance.now();
  const { solution, aborted } = solve(given);
  const ms = Math.max(1, Math.round(performance.now() - t));
  if (!solution) {
    render();
    setStatus(aborted ? "너무 오래 걸려서 중단했어요. 입력을 확인해 주세요." : "풀 수 없는 문제예요.", "error");
    return null;
  }
  return { solution, ms };
}

document.getElementById("solve").addEventListener("click", () => {
  const res = runSolve();
  if (!res) return;
  res.solution.forEach((v, i) => (shown[i] = v));
  render();
  setStatus(`풀었어요! (${res.ms}ms)`, "ok");
});

document.getElementById("clear").addEventListener("click", () => {
  closePicker(); given.fill(0); shown.fill(0); hinted.fill(false); unsure.clear(); hintCount = 0; setStatus(""); select(0);
});

// 힌트: 지금 입력으로 문제를 풀어 보고, 선택한 칸의 정답만 채운다
function giveHint(i) {
  if (given[i]) {
    setStatus(hinted[i] ? "이미 힌트로 채운 칸이에요. 빈칸을 골라 주세요." : "이미 숫자가 있는 칸이에요. 빈칸을 골라 주세요.");
    cells[i].focus();
    return;
  }
  const res = runSolve();        // 겹침·풀 수 없음이면 runSolve가 안내 문구를 띄운다
  if (!res) return;
  given[i] = shown[i] = res.solution[i];
  hinted[i] = true;
  hintCount++;
  render();
  cells[i].classList.remove("hint-new");
  void cells[i].offsetWidth;     // 같은 칸에 연달아 써도 반짝임이 다시 재생되게
  cells[i].classList.add("hint-new");
  cells[i].focus();
  const left = given.filter(v => !v).length;
  setStatus(left ? `힌트: ${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열은 ${res.solution[i]}이에요. (힌트 ${hintCount}번 사용)`
                 : `완성했어요! (힌트 ${hintCount}번 사용)`, "ok");
}

// 업로드: 사진에서 판을 읽어 입력칸에 채운다
const fileEl = document.getElementById("file");
document.getElementById("upload").addEventListener("click", () => { closePicker(); fileEl.click(); });
fileEl.addEventListener("change", async () => {
  const file = fileEl.files[0];
  fileEl.value = "";                       // 같은 사진을 다시 골라도 동작하게
  if (file) await loadBoardFromImage(await loadImage(file).catch(e => (setStatus(e.message, "error"), null)));
});

async function loadBoardFromImage(img) {
  if (!img) return;
  const busy = on => document.querySelectorAll(".actions button").forEach(b => (b.disabled = on));
  busy(true);
  try {
    const { board, unsure: low, found } = await readSudoku(img, msg => setStatus(msg));
    if (!found) { setStatus("사진에서 숫자를 찾지 못했어요. 판이 크게 나오도록 정면에서 찍어 주세요.", "error"); return; }
    board.forEach((v, i) => { given[i] = shown[i] = v; });
    hinted.fill(false); hintCount = 0;
    unsure.clear(); low.forEach(i => unsure.add(i));
    setStatus("");
    select(0);
    if (findConflicts(given).size) return;   // 겹치는 숫자가 있으면 render가 경고를 띄운다
    const n = board.filter(Boolean).length;
    setStatus(unsure.size
      ? `숫자 ${n}개를 읽었어요. 주황 테두리 ${unsure.size}칸은 확실하지 않으니 확인해 주세요.`
      : `숫자 ${n}개를 읽었어요. 사진과 다른 칸이 있으면 고친 뒤 풀기를 누르세요.`, "ok");
  } catch (e) {
    setStatus(e.message || "사진을 읽지 못했어요.", "error");
  } finally {
    busy(false);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img); };
    img.onerror = () => reject(new Error("이미지 파일을 열 수 없어요."));
    img.src = URL.createObjectURL(file);
  });
}

render();
