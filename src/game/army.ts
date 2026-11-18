import { MEMBERS } from '../data/members';
import { MAX_STAR, MERGE_COUNT, SELL_PRICE, mergeCount } from '../data/units';
import { FOCUS_COST, FOCUS_RATE, FOCUS_UNLOCK_WAVE, SUMMON_COST } from '../data/economy';
import { FIELD_SLOTS, STORAGE_SLOTS } from './layout';
import { UPGRADES, UPGRADE_MAX, type UpgradeId } from '../data/upgrades';
import type { Area, Battle, Unit } from './combat';

/** 소환·합성·판매·이동·잠금 등 유닛 관리 로직 (Phaser 무관) */

export type FailReason = 'over' | 'gold' | 'space' | 'focusLocked' | 'notFound' | 'locked' | 'maxStar' | 'noMaterial' | 'maxLevel';
export type ActionResult<T> = { ok: true; value: T } | { ok: false; reason: FailReason };
const fail = (reason: FailReason): { ok: false; reason: FailReason } => ({ ok: false, reason });
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

export const FAIL_TEXT: Record<FailReason, string> = {
  over: '게임이 종료되었습니다',
  gold: '골드가 부족합니다',
  space: '빈 칸이 없습니다 (전투·보관함 40칸 가득 참)',
  focusLocked: `집중 소환은 ${FOCUS_UNLOCK_WAVE}웨이브부터 가능합니다`,
  notFound: '유닛을 찾을 수 없습니다',
  locked: '잠금된 유닛입니다',
  maxStar: '5성은 더 이상 합성할 수 없습니다',
  maxLevel: '이미 최대 단계입니다',
  noMaterial: `같은 멤버·같은 등급의 잠금 해제 유닛이 부족합니다 (${MERGE_COUNT.map((n, i) => `${i + 1}성 ${n}개`).join(', ')})`,
};

export const sellPrice = (star: number) => SELL_PRICE[star - 1];
export const isFocusUnlocked = (b: Battle) => b.waveNumber >= FOCUS_UNLOCK_WAVE;

/** focusId가 있으면 FOCUS_RATE(80%) 확률로 선택 멤버, 나머지는 다른 멤버에게 균등 분배 */
export function rollMember(rng: () => number, focusId?: string): string {
  const r = rng();
  if (!focusId) return MEMBERS[Math.min(MEMBERS.length - 1, Math.floor(r * MEMBERS.length))].id;
  if (r < FOCUS_RATE) return focusId;
  const others = MEMBERS.filter((m) => m.id !== focusId);
  return others[Math.min(others.length - 1, Math.floor(((r - FOCUS_RATE) / (1 - FOCUS_RATE)) * others.length))].id;
}

/** 실패 시 골드를 차감하지 않음 */
export function summon(b: Battle, focusId?: string, rng: () => number = Math.random): ActionResult<Unit> {
  if (b.isOver) return fail('over');
  if (focusId !== undefined) {
    if (!isFocusUnlocked(b)) return fail('focusLocked');
    if (!MEMBERS.some((m) => m.id === focusId)) return fail('notFound');
  }
  const cost = focusId !== undefined ? FOCUS_COST : SUMMON_COST;
  if (b.gold < cost) return fail('gold');
  const slot = b.freeSlot();
  if (!slot) return fail('space');
  b.gold -= cost;
  return ok(b.addUnit(rollMember(rng, focusId), 1, slot.area, slot.index));
}

const canMerge = (u: Unit) => !u.locked && u.star < MAX_STAR;
const sameKind = (a: Unit, b: Unit) => a.memberId === b.memberId && a.star === b.star;
/** 전투 칸 우선, 칸 번호 순 */
const fieldFirst = (a: Unit, b: Unit) => (a.area === b.area ? a.index - b.index : a.area === 'field' ? -1 : 1);

/** 합성 가능한(잠금 해제 동일 멤버·등급 재료 수 이상) 유닛 ID */
export function mergeableIds(b: Battle): Set<number> {
  const ids = new Set<number>();
  for (const u of b.units) {
    if (canMerge(u) && b.units.filter((o) => canMerge(o) && sameKind(o, u)).length >= mergeCount(u.star)) ids.add(u.id);
  }
  return ids;
}

/** 재료 제거 후 결과 1개를 재료 중 한 칸에 생성 → 칸 부족·복제 불가 */
function combine(b: Battle, mats: Unit[], area: Area, index: number): Unit {
  b.removeUnits(mats.map((m) => m.id));
  return b.addUnit(mats[0].memberId, mats[0].star + 1, area, index);
}

/** 수동 합성: 선택 유닛 + 같은 종류 재료(보관함 유닛을 재료로 우선 사용) */
export function mergeWith(b: Battle, baseId: number): ActionResult<Unit> {
  if (b.isOver) return fail('over');
  const base = b.units.find((u) => u.id === baseId);
  if (!base) return fail('notFound');
  if (base.locked) return fail('locked');
  if (base.star >= MAX_STAR) return fail('maxStar');
  const others = b.units
    .filter((o) => o.id !== base.id && canMerge(o) && sameKind(o, base))
    .sort((x, y) => -fieldFirst(x, y))
    .slice(0, mergeCount(base.star) - 1);
  if (others.length < mergeCount(base.star) - 1) return fail('noMaterial');
  const mats = [base, ...others];
  const at = base.area === 'field' ? base : (mats.find((m) => m.area === 'field') ?? base);
  return ok(combine(b, mats, at.area, at.index));
}

/** 원클릭/자동 합성: 낮은 등급부터 가능한 만큼 연쇄 합성. 결과 유닛 목록 반환 */
export function mergeAll(b: Battle): Unit[] {
  const results: Unit[] = [];
  if (b.isOver) return results;
  for (let star = 1; star < MAX_STAR; star++) {
    for (const m of MEMBERS) {
      for (;;) {
        const group = b.units.filter((u) => canMerge(u) && u.memberId === m.id && u.star === star).sort(fieldFirst);
        if (group.length < mergeCount(star)) break;
        const mats = group.slice(0, mergeCount(star));
        results.push(combine(b, mats, mats[0].area, mats[0].index));
      }
    }
  }
  // 이후 상위 합성의 재료로 소모된 중간 결과는 제외
  return results.filter((r) => b.units.includes(r));
}

/** 판매: 유닛이 이미 없으면 notFound → 중복 지급 불가 */
export function sell(b: Battle, id: number): ActionResult<number> {
  if (b.isOver) return fail('over');
  const u = b.units.find((x) => x.id === id);
  if (!u) return fail('notFound');
  if (u.locked) return fail('locked');
  const price = sellPrice(u.star);
  b.removeUnits([id]);
  b.gold += price;
  return ok(price);
}

/** 일괄 판매: 실행 직전 상태로 재검증 (없어진 유닛·잠금 유닛은 건너뜀, 판매 금액은 개별 판매와 동일) */
export function sellMany(b: Battle, ids: number[]): { sold: number; gold: number; skipped: number } {
  let sold = 0, gold = 0, skipped = 0;
  for (const id of new Set(ids)) {
    const r = sell(b, id);
    if (r.ok) { sold++; gold += r.value; } else skipped++;
  }
  return { sold, gold, skipped };
}

export function toggleLock(b: Battle, id: number): ActionResult<boolean> {
  const u = b.units.find((x) => x.id === id);
  if (!u) return fail('notFound');
  u.locked = !u.locked;
  return ok(u.locked);
}

/** 이동: 대상 칸에 유닛이 있으면 서로 교환 */
export function moveUnit(b: Battle, id: number, area: Area, index: number): ActionResult<Unit> {
  if (b.isOver) return fail('over');
  const u = b.units.find((x) => x.id === id);
  if (!u) return fail('notFound');
  if (index < 0 || index >= (area === 'field' ? FIELD_SLOTS : STORAGE_SLOTS)) return fail('notFound');
  const other = b.unitAtSlot(area, index);
  if (other && other !== u) b.setSlot(other, u.area, u.index);
  b.setSlot(u, area, index);
  return ok(u);
}

/** 전역 강화 구매: 최대 단계·골드 부족 시 실패(골드 차감 없음) */
export function buyUpgrade(b: Battle, id: UpgradeId): ActionResult<number> {
  if (b.isOver) return fail('over');
  const lv = b.upgrades[id];
  if (lv >= UPGRADE_MAX) return fail('maxLevel');
  const cost = UPGRADES[id].costs[lv];
  if (b.gold < cost) return fail('gold');
  b.gold -= cost;
  b.upgrades[id] = lv + 1;
  return ok(lv + 1);
}
