import type { Monster } from './combat';

/** 대상 판정 공통 함수 (순수 기하 계산). 모두 hp > 0 인 몬스터만 대상으로 한다. */

interface Point { x: number; y: number }
const d2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function inRadius(monsters: Monster[], c: Point, r: number): Monster[] {
  const r2 = r * r;
  return monsters.filter((m) => m.hp > 0 && d2(m, c) <= r2);
}

/** 가장 앞서 있는(누적 이동 거리가 가장 긴) 사거리 내 몬스터 */
export function pickTarget(from: Point, monsters: Monster[], range: number): Monster | null {
  const r2 = range * range;
  let best: Monster | null = null;
  for (const m of monsters) {
    if (m.hp <= 0 || d2(m, from) > r2) continue;
    if (!best || m.distance > best.distance) best = m;
  }
  return best;
}

/** from → target 방향 길이 length의 실제 직선 경로에 닿는 몬스터 (가까운 순, 최대 max) */
export function pierceLine(monsters: Monster[], from: Point, target: Point, length: number, width: number, max: number) {
  const len = Math.hypot(target.x - from.x, target.y - from.y) || 1;
  const dx = (target.x - from.x) / len;
  const dy = (target.y - from.y) / len;
  const hits: { m: Monster; t: number }[] = [];
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const t = (m.x - from.x) * dx + (m.y - from.y) * dy;
    if (t < 0 || t > length) continue;
    const perp = Math.abs((m.x - from.x) * dy - (m.y - from.y) * dx);
    if (perp <= width / 2 + m.def.radius) hits.push({ m, t });
  }
  hits.sort((a, b) => a.t - b.t);
  return { hits: hits.slice(0, max).map((h) => h.m), end: { x: from.x + dx * length, y: from.y + dy * length } };
}

/** first부터 가장 가까운 미피격 몬스터로 이어지는 연쇄 (중복 없음) */
export function chainTargets(monsters: Monster[], first: Monster, max: number, jump: number): Monster[] {
  const chain = [first];
  const j2 = jump * jump;
  while (chain.length < max) {
    const last = chain[chain.length - 1];
    let next: Monster | null = null;
    let best = j2;
    for (const m of monsters) {
      if (m.hp <= 0 || chain.includes(m)) continue;
      const d = d2(m, last);
      if (d <= best) { best = d; next = m; }
    }
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

/** 후보 중 반경 r 안에 적이 가장 많은 몬스터 위치 */
export function densestPoint(candidates: Monster[], all: Monster[], r: number): Monster | null {
  let best: Monster | null = null;
  let bestCount = -1;
  for (const c of candidates) {
    const n = inRadius(all, c, r).length;
    if (n > bestCount || (n === bestCount && best && c.distance > best.distance)) { best = c; bestCount = n; }
  }
  return best;
}
