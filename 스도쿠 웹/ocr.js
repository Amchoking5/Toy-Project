// 사진에서 스도쿠 판 읽기
// 1) 적응형 이진화 → 2) 가장 큰 덩어리(격자선)로 판의 네 꼭짓점 찾기 → 3) 원근 보정으로 정사각형 펴기
// → 4) 81칸으로 잘라 숫자가 있는 칸만 골라내기 → 5) Tesseract.js로 숫자 판독
// Tesseract.js(약 7MB)는 처음 업로드할 때만 CDN에서 불러온다.

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const WARP = 450;            // 펴낸 판 크기(px), 한 칸 50px
const CELL = WARP / 9;

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("인식 엔진을 불러오지 못했어요. 인터넷 연결을 확인해 주세요."));
    document.head.appendChild(s);
  });
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!window.Tesseract) await loadScript(TESSERACT_URL);
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: m => { if (m.status && m.progress != null && !/recogniz/.test(m.status)) onProgress?.(`인식 엔진 준비 중… ${Math.round(m.progress * 100)}%`); },
      });
      await worker.setParameters({
        tessedit_char_whitelist: "123456789",
        tessedit_pageseg_mode: "8",    // 한 단어 모드 (10=한 글자 모드는 숫자를 놓치는 경우가 잦음)
      });
      return worker;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

// ---------- 이미지 처리 ----------

function toGray(img, maxSide = 1000) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return { g, w, h };
}

// 주변 평균보다 c만큼 어두우면 1(잉크). 조명이 고르지 않아도 동작한다.
function adaptiveThreshold(g, w, h, radius, c) {
  const S = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const sum = S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = g[y * w + x] < mean - c ? 1 : 0;
    }
  }
  return out;
}

// 8방향 연결 덩어리 라벨링. 덩어리마다 {size, minX, maxX, minY, maxY, pixels?}
function components(bin, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || label[start] >= 0) continue;
    const id = comps.length;
    const comp = { id, size: 0, minX: w, maxX: 0, minY: h, maxY: 0 };
    let sp = 0;
    stack[sp++] = start; label[start] = id;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      comp.size++;
      if (x < comp.minX) comp.minX = x; if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y; if (y > comp.maxY) comp.maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (bin[q] && label[q] < 0) { label[q] = id; stack[sp++] = q; }
      }
    }
    comps.push(comp);
  }
  return { comps, label };
}

// 격자선 덩어리에서 네 꼭짓점: 좌상(x+y 최소), 우하(x+y 최대), 우상(x−y 최대), 좌하(x−y 최소)
function findCorners(label, w, h, id) {
  let tl, tr, br, bl, sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== id) continue;
    const x = p % w, y = (p / w) | 0, s = x + y, d = x - y;
    if (s < sMin) { sMin = s; tl = [x, y]; }
    if (s > sMax) { sMax = s; br = [x, y]; }
    if (d > dMax) { dMax = d; tr = [x, y]; }
    if (d < dMin) { dMin = d; bl = [x, y]; }
  }
  return [tl, tr, br, bl];
}

// 정사각형(0..WARP) 좌표 → 사진 좌표로 보내는 원근 변환 행렬 (8개 미지수 선형 방정식)
function homography(dst) {
  const src = [[0, 0], [WARP, 0], [WARP, WARP], [0, WARP]];
  const A = [], b = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k], [u, v] = dst[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let i = 0; i < 8; i++) {            // 가우스 소거
    let piv = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = 0; r < 8; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

function warp(g, w, h, corners) {
  const [a, b2, c, d, e, f, g2, h2] = homography(corners);
  const out = new Float32Array(WARP * WARP);
  for (let y = 0; y < WARP; y++) for (let x = 0; x < WARP; x++) {
    const z = g2 * x + h2 * y + 1;
    const u = (a * x + b2 * y + c) / z, v = (d * x + e * y + f) / z;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const px = (xx, yy) => g[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
    out[y * WARP + x] = (px(x0, y0) * (1 - fx) + px(x0 + 1, y0) * fx) * (1 - fy)
                      + (px(x0, y0 + 1) * (1 - fx) + px(x0 + 1, y0 + 1) * fx) * fy;
  }
  return out;
}

// 펴낸 판이 9×9 격자와 얼마나 맞는지: 격자선 위치(k/9)의 잉크 비율 − 칸 가운데 줄의 잉크 비율
function gridScore(bin) {
  const band = (pos, vertical) => {
    let ink = 0, n = 0;
    for (let d = -2; d <= 2; d++) {
      const q = Math.round(pos) + d;
      if (q < 0 || q >= WARP) continue;
      for (let t = 0; t < WARP; t++) { ink += vertical ? bin[t * WARP + q] : bin[q * WARP + t]; n++; }
    }
    return ink / n;
  };
  let lines = 0, mids = 0;
  for (const v of [true, false]) {
    for (let k = 1; k < 9; k++) lines += band(k * CELL, v);
    for (let k = 0; k < 9; k++) mids += band((k + 0.5) * CELL, v);
  }
  return lines / 16 - mids / 18;
}

// 한 칸에서 숫자 덩어리를 찾아 Tesseract에 넣기 좋은 캔버스(흰 바탕 검은 글씨)로 만든다. 없으면 null.
function extractDigit(bin, r, c) {
  const pad = Math.round(CELL * 0.1);                        // 격자선 피하기
  const x0 = Math.round(c * CELL) + pad, y0 = Math.round(r * CELL) + pad;
  const s = Math.round(CELL) - pad * 2;
  const sub = new Uint8Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) sub[y * s + x] = bin[(y0 + y) * WARP + x0 + x];

  const { comps, label } = components(sub, s, s);
  let best = null;
  for (const k of comps) {
    const ch = k.maxY - k.minY + 1, cw = k.maxX - k.minX + 1;
    const cx = (k.minX + k.maxX) / 2, cy = (k.minY + k.maxY) / 2;
    if (ch < s * 0.35 || ch > s * 0.98 || cw > s * 0.9) continue;      // 너무 작거나(점·잡티) 칸만 한 것(선)
    if (Math.abs(cx - s / 2) > s * 0.3 || Math.abs(cy - s / 2) > s * 0.3) continue;
    if (k.size < s * s * 0.03) continue;
    if (!best || k.size > best.size) best = k;
  }
  if (!best) return null;

  // 같은 숫자의 다른 조각(예: 끊긴 획)도 bbox 근처면 함께 넣는다
  let { minX, maxX, minY, maxY } = best;
  const keep = new Set([best.id]);
  for (const k of comps) {
    if (k.id === best.id || k.size < 4) continue;
    if (k.minX >= minX - 3 && k.maxX <= maxX + 3 && k.minY >= minY - 3 && k.maxY <= maxY + 3) keep.add(k.id);
  }

  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const OUT = 96, target = 60, scale = target / bh;
  const cv = document.createElement("canvas");
  cv.width = cv.height = OUT;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(OUT, OUT);
  img.data.fill(255);
  const ox = (OUT - bw * scale) / 2, oy = (OUT - bh * scale) / 2;
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    const sx = Math.floor((x - ox) / scale) + minX, sy = Math.floor((y - oy) / scale) + minY;
    if (sx < minX || sy < minY || sx > maxX || sy > maxY) continue;
    if (keep.has(label[sy * s + sx])) { const i = (y * OUT + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// 이미지(HTMLImageElement/ImageBitmap) → { board: 81칸 숫자(0=빈칸), unsure: 확신이 낮은 칸 인덱스 }
async function readSudoku(img, onProgress) {
  onProgress?.("판을 찾는 중…");
  await new Promise(r => setTimeout(r));                     // 문구가 먼저 그려지게

  const { g, w, h } = toGray(img);
  const bin = adaptiveThreshold(g, w, h, Math.max(7, Math.round(Math.min(w, h) / 40)), 8);
  const { comps, label } = components(bin, w, h);

  // 판 후보: 크고 대략 정사각형인 덩어리 상위 몇 개 + 사진 전체.
  // 종이 테두리·그림자 경계처럼 '크기만 큰' 덩어리도 있으므로, 후보마다 펴 본 뒤
  // 1/9 간격 격자선과 얼마나 맞는지 점수를 매겨 가장 격자다운 것을 고른다.
  const cands = comps
    .filter(k => {
      const bw = k.maxX - k.minX + 1, bh = k.maxY - k.minY + 1;
      return bw * bh >= w * h * 0.04 && bw / bh > 0.5 && bw / bh < 2;
    })
    .sort((a, b) => b.size - a.size)
    .slice(0, 6)
    .map(k => findCorners(label, w, h, k.id));
  cands.push([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]);

  let best = null;
  for (const corners of cands) {
    const flat = warp(g, w, h, corners);
    const flatBin = adaptiveThreshold(flat, WARP, WARP, 12, 10);
    const score = gridScore(flatBin);
    if (!best || score > best.score) best = { corners, flat, flatBin, score };
  }
  const { flatBin } = best;

  const digits = [];
  for (let i = 0; i < 81; i++) {
    const cv = extractDigit(flatBin, Math.floor(i / 9), i % 9);
    if (cv) digits.push([i, cv]);
  }

  const board = new Array(81).fill(0), unsure = [];
  if (!digits.length) return { board, unsure, found: false };

  const worker = await getWorker(onProgress);
  for (let k = 0; k < digits.length; k++) {
    onProgress?.(`숫자 읽는 중… ${k + 1}/${digits.length}`);
    const [i, cv] = digits[k];
    const { data } = await worker.recognize(cv);
    const ch = (data.text || "").replace(/[^1-9]/g, "")[0];
    if (ch) board[i] = +ch;
    if (!ch || data.confidence < 60) unsure.push(i);
  }
  return { board, unsure, found: true };
}
