// 스도쿠 풀이 엔진 (브라우저·Node 공용)
// board: 길이 81 배열, 0 = 빈칸. 행 r, 열 c 칸의 인덱스는 r * 9 + c.

const ALL = 0x3fe; // 비트 1~9

const boxOf = i => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);
const bitCount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

// 27개 단위(행 9, 열 9, 3×3 9)에 속한 칸 인덱스
const UNITS = [];
for (let k = 0; k < 9; k++) {
  UNITS.push([...Array(9)].map((_, j) => k * 9 + j));
  UNITS.push([...Array(9)].map((_, j) => j * 9 + k));
  const r0 = Math.floor(k / 3) * 3, c0 = (k % 3) * 3;
  UNITS.push([...Array(9)].map((_, j) => (r0 + Math.floor(j / 3)) * 9 + c0 + (j % 3)));
}

// 규칙에 어긋난 칸(같은 행·열·3×3에 같은 숫자)의 인덱스 집합
function findConflicts(board) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (!v) continue;
    const r = Math.floor(i / 9), c = i % 9, b = boxOf(i);
    for (let j = i + 1; j < 81; j++) {
      if (board[j] !== v) continue;
      if (Math.floor(j / 9) === r || j % 9 === c || boxOf(j) === b) { bad.add(i); bad.add(j); }
    }
  }
  return bad;
}

// 해를 하나 찾는다. 결과: { solution: 길이 81 배열 | null, aborted: 탐색 한도 초과 여부 }
// onStep(i, v)를 넘기면 숫자를 놓고(v) 지울 때(0)마다 호출된다 (풀이 과정 애니메이션용).
// 백트래킹 + 후보가 가장 적은 칸부터 채우는 방식(MRV)이라 어려운 문제도 빠르게 푼다.
function solve(input, onStep) {
  const board = input.slice();
  const row = new Array(9).fill(0), col = new Array(9).fill(0), box = new Array(9).fill(0);

  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (!v) continue;
    const bit = 1 << v, r = Math.floor(i / 9), c = i % 9, b = boxOf(i);
    if ((row[r] | col[c] | box[b]) & bit) return { solution: null, aborted: false }; // 처음부터 규칙 위반
    row[r] |= bit; col[c] |= bit; box[b] |= bit;
  }

  let nodes = 0;
  const LIMIT = 2e5; // 비정상적으로 오래 걸리는 입력 방지
  const cand = new Array(81).fill(0);
  const place = (i, v, on) => {
    const bit = 1 << v, r = Math.floor(i / 9), c = i % 9, b = boxOf(i);
    if (on) { board[i] = v; row[r] |= bit; col[c] |= bit; box[b] |= bit; }
    else { board[i] = 0; row[r] &= ~bit; col[c] &= ~bit; box[b] &= ~bit; }
    if (onStep) onStep(i, on ? v : 0);
  };

  // 정확 덮개(Algorithm X) 방식: '칸 하나에 숫자 하나'와 '단위마다 숫자 v는 한 번'이라는
  // 두 종류 제약 중 선택지가 가장 적은 제약을 골라 그 선택지만 시도한다.
  function dfs() {
    if (++nodes > LIMIT) return false;

    let bestCell = -1, bestCnt = 10;
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const m = ALL & ~(row[Math.floor(i / 9)] | col[i % 9] | box[boxOf(i)]);
      cand[i] = m;
      const n = bitCount(m);
      if (n < bestCnt) { bestCell = i; bestCnt = n; if (n === 0) return false; }
    }
    if (bestCell < 0) return true; // 빈칸 없음 = 완성

    let options = null; // [[칸, 숫자], ...]
    if (bestCnt > 1) {
      let unitBest = bestCnt;
      for (let u = 0; u < 27 && unitBest > 1; u++) {
        const cells = UNITS[u];
        let placed = 0;
        for (const i of cells) if (board[i]) placed |= 1 << board[i];
        for (let v = 1; v <= 9; v++) {
          const bit = 1 << v;
          if (placed & bit) continue;
          const where = [];
          for (const i of cells) if (!board[i] && (cand[i] & bit)) where.push(i);
          if (where.length === 0) return false; // 숫자 v가 들어갈 곳이 없음
          if (where.length < unitBest) {
            unitBest = where.length;
            options = where.map(i => [i, v]);
            if (unitBest === 1) break;
          }
        }
      }
    }
    if (!options) {
      options = [];
      for (let v = 1; v <= 9; v++) if (cand[bestCell] & (1 << v)) options.push([bestCell, v]);
    }

    for (const [i, v] of options) {
      place(i, v, true);
      if (dfs()) return true;
      place(i, v, false);
    }
    return false;
  }

  const ok = dfs(0);
  return { solution: ok ? board : null, aborted: !ok && nodes > LIMIT };
}

if (typeof module !== "undefined") module.exports = { solve, findConflicts };
