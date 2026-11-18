export const MAP_W = 1000;
export const MAP_H = 700;

/**
 * 전투 맵 이미지 (src/assets/maps/battle-map.png, 원본 1499×1049)를 논리 좌표 1000×700에 비율 유지로 표시.
 * 아래 수치는 원본 픽셀에서 측정한 값 (칸: 돌바닥 투영 구간 중심, 경로: 직선 구간 여러 단면의 돌바닥 중앙값, 모서리: 45° 단면)
 */
export const MAP_IMAGE = { width: 1499, height: 1049 };
export const MAP_SCALE = MAP_W / MAP_IMAGE.width; // ≈ 0.6671 (세로 1049 × 0.6671 ≈ 699.8)
const s = (v: number) => v * MAP_SCALE;

/** 외곽 순환 경로(둥근 사각형의 중심선). 모서리 반경은 원근 때문에 위·아래가 다름 */
export const PATH = {
  left: s(188), top: s(183), right: s(1310), bottom: s(851.5),
  radius: { tl: s(164), tr: s(164), br: s(147), bl: s(147) },
  /** 길 폭 (표시·판정 참고용) */
  width: s(68),
};

/** 몬스터 등장 포털 (왼쪽 위 분홍 원) */
export const PORTAL = { x: s(183), y: s(194) };

/** 중앙 배치 칸 5열 × 4행 (직사각형). 그리기·클릭·드래그 판정 모두 이 정의를 사용 */
const COL_X = [361.5, 555.5, 749.5, 942, 1137].map(s);
const ROW_Y = [311, 447, 582, 719.5].map(s);
export const GRID = { cols: 5, rows: 4, cellW: s(170), cellH: s(122) };

export function cellCenter(col: number, row: number) {
  return { x: COL_X[col], y: ROW_Y[row] };
}

type Seg =
  | { kind: 'line'; len: number; x0: number; y0: number; dx: number; dy: number }
  | { kind: 'arc'; len: number; cx: number; cy: number; a0: number; r: number };

// 위쪽 직선 시작점 기준 시계 방향(화면 기준) 구간
const { left: L, top: T, right: R, bottom: B } = PATH;
const { tl, tr, br, bl } = PATH.radius;
const q = Math.PI / 2;
const SEGS: Seg[] = [
  { kind: 'line', len: R - L - tl - tr, x0: L + tl, y0: T, dx: 1, dy: 0 },
  { kind: 'arc', len: q * tr, cx: R - tr, cy: T + tr, a0: -q, r: tr },
  { kind: 'line', len: B - T - tr - br, x0: R, y0: T + tr, dx: 0, dy: 1 },
  { kind: 'arc', len: q * br, cx: R - br, cy: B - br, a0: 0, r: br },
  { kind: 'line', len: R - L - br - bl, x0: R - br, y0: B, dx: -1, dy: 0 },
  { kind: 'arc', len: q * bl, cx: L + bl, cy: B - bl, a0: q, r: bl },
  { kind: 'line', len: B - T - bl - tl, x0: L, y0: B - bl, dx: 0, dy: -1 },
  { kind: 'arc', len: q * tl, cx: L + tl, cy: T + tl, a0: Math.PI, r: tl },
];
export const PATH_LENGTH = SEGS.reduce((sum, g) => sum + g.len, 0);

/** 등장 지점: 포털에 가장 가까운 왼쪽 위 모서리 곡선 위의 점 (누적 거리 0 = 이 지점) */
const PORTAL_ANGLE = Math.atan2(PORTAL.y - (T + tl), PORTAL.x - (L + tl)) + 2 * Math.PI; // π~1.5π 범위
const START_OFFSET = PATH_LENGTH - q * tl + (PORTAL_ANGLE - Math.PI) * tl;

function rawPoint(d: number) {
  for (const g of SEGS) {
    if (d <= g.len) {
      if (g.kind === 'line') return { x: g.x0 + g.dx * d, y: g.y0 + g.dy * d };
      const a = g.a0 + d / g.r;
      return { x: g.cx + Math.cos(a) * g.r, y: g.cy + Math.sin(a) * g.r };
    }
    d -= g.len;
  }
  return { x: L + tl, y: T };
}

/** 경로 시작점(포털)으로부터 누적 이동 거리 → 좌표 (몇 바퀴든 순환) */
export function pathPoint(distance: number) {
  const d = (((distance + START_OFFSET) % PATH_LENGTH) + PATH_LENGTH) % PATH_LENGTH;
  return rawPoint(d);
}

export const FIELD_SLOTS = GRID.cols * GRID.rows;

/** 맵 좌표 → 전투 칸 번호 (칸 밖이면 -1) */
export function cellAt(x: number, y: number) {
  for (let i = 0; i < GRID.cols * GRID.rows; i++) {
    const c = cellCenter(i % GRID.cols, Math.floor(i / GRID.cols));
    if (Math.abs(x - c.x) <= GRID.cellW / 2 && Math.abs(y - c.y) <= GRID.cellH / 2) return i;
  }
  return -1;
}
export const STORAGE_SLOTS = 20;

/** 경로 표본 (pathPoint 재사용, 약 5px 간격) — 사거리 부족 안내용 */
const PATH_SAMPLES = Array.from({ length: Math.ceil(PATH_LENGTH / 5) }, (_, i) => pathPoint(i * 5));
/** (x, y)에서 range 안에 몬스터 경로가 한 점이라도 있는지 (공격 대상 판정과 같은 중심 거리 기준) */
export function pathWithinRange(x: number, y: number, range: number) {
  const r2 = range * range;
  return PATH_SAMPLES.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= r2);
}
