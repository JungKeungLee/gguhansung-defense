import { SYNERGIES, SYNERGY_CAPS, TIER_RULES, type DamageTag, type SynergyDef, type SynergyEffect } from '../data/synergies';
import type { Battle, DamageKind, Monster, Unit } from './combat';
import { densestPoint, inRadius } from './targeting';

/** 시너지 판정·보너스·주기 공격. 전투 칸 유닛만 대상, 시간은 Battle.step(dt) 게임 시간 */

export interface SynergyState {
  active: Set<string>;
  /** 주기 공격 남은 시간 (활성화 시 시작, 해제 시 삭제) */
  timers: Map<string, number>;
}
export const newSynergyState = (): SynergyState => ({ active: new Set(), timers: new Map() });

/** 전투 칸 멤버별 최고 등급 (없으면 0) */
export function fieldMaxStars(b: Battle) {
  const max = new Map<string, number>();
  for (const u of b.units) if (u.area === 'field') max.set(u.memberId, Math.max(max.get(u.memberId) ?? 0, u.star));
  return max;
}

export function isSatisfied(def: SynergyDef, max: Map<string, number>) {
  const rule = TIER_RULES[def.tier];
  const stars = def.members.map((id) => max.get(id) ?? 0);
  return stars.every((s) => s >= rule.minStar) && stars.filter((s) => s >= 3).length >= rule.highCount;
}

/** 매 step 시작 시 활성 시너지 재판정. 판매·합성·이동 직후 다음 프레임에 즉시 반영 */
export function updateSynergies(b: Battle, dt: number) {
  const max = fieldMaxStars(b);
  const st = b.syn;
  for (const def of SYNERGIES) {
    const on = isSatisfied(def, max);
    const was = st.active.has(def.id);
    if (on && !was) {
      st.active.add(def.id);
      const p = periodicOf(def);
      if (p) st.timers.set(def.id, p.interval); // 처음 충족 시 새 쿨타임 시작
      b.onSynergy?.(def, true);
    } else if (!on && was) {
      st.active.delete(def.id);
      st.timers.delete(def.id);
      b.onSynergy?.(def, false);
    }
  }
  for (const [id, t] of st.timers) {
    const def = SYNERGIES.find((d) => d.id === id)!;
    const left = t - dt;
    if (left > 0) { st.timers.set(id, left); continue; }
    st.timers.set(id, firePeriodic(b, def) ? periodicOf(def)!.interval : 0); // 대상 없으면 대기
  }
}

const periodicOf = (def: SynergyDef) => def.effects.find((e): e is Extract<SynergyEffect, { kind: 'periodic' }> => e.kind === 'periodic');
const activeDefs = (b: Battle) => SYNERGIES.filter((d) => b.syn.active.has(d.id));
const applies = (def: SynergyDef, e: { all?: boolean; who?: string[] }, memberId: string) =>
  e.all ? true : (e.who ?? def.members).includes(memberId);

/** 조합당 1회: 참여 멤버별 최고 등급 유닛의 평균 공격력 기준 */
function firePeriodic(b: Battle, def: SynergyDef): boolean {
  const p = periodicOf(def)!;
  const best = def.members
    .map((id) => b.units.filter((u) => u.area === 'field' && u.memberId === id).sort((x, y) => y.star - x.star)[0])
    .filter(Boolean) as Unit[];
  if (!best.length) return false;
  const cands = b.monsters.filter((m) => m.hp > 0 && best.some((u) => (m.x - u.x) ** 2 + (m.y - u.y) ** 2 <= b.statsOf(u).range ** 2));
  if (!cands.length) return false;
  // 시너지 주기 공격: 참여 유닛 현재 공격력(등급·전역 공격력 포함) 평균. 스킬 효율·시너지 배율은 미적용
  const dmg = (best.reduce((s, u) => s + b.statsOf(u).damage, 0) / best.length) * p.mult;
  const owner = best[0].id;
  if (p.mode === 'focus') {
    const t = cands.reduce((a, c) => (c.hp > a.hp ? c : a));
    b.emitFx({ kind: 'beam', points: [{ x: best[0].x, y: best[0].y }, { x: t.x, y: t.y }], color: 0xffd700, width: 7 });
    b.dealDamage(t, dmg, owner, 'skill', 'synergy');
  } else {
    const c = densestPoint(cands, b.monsters, p.radius!)!;
    const cx = c.x, cy = c.y;
    b.emitFx({ kind: 'burst', x: cx, y: cy, radius: p.radius!, color: 0xffd700 });
    for (const m of inRadius(b.monsters, { x: cx, y: cy }, p.radius!)) b.dealDamage(m, dmg, owner, 'skill', 'synergy');
  }
  b.emitFx({ kind: 'cast', x: best[0].x, y: best[0].y, color: 0xffd700, text: def.name });
  return true;
}

// ── 보너스 (시너지 합산 → 시너지 상한, 기존 전투 상한과 별개) ──
function sumEffects(b: Battle, u: Unit, kind: 'attackSpeed' | 'cooldown' | 'radius' | 'skillEffect') {
  if (!b.synergyEnabled || u.area !== 'field') return 0;
  let s = 0;
  for (const def of activeDefs(b)) for (const e of def.effects) if (e.kind === kind && applies(def, e as { all?: boolean; who?: string[] }, u.memberId)) s += e.amount;
  return s;
}
export const synAttackSpeed = (b: Battle, u: Unit) => Math.min(SYNERGY_CAPS.attackSpeed, sumEffects(b, u, 'attackSpeed'));
export const synCooldown = (b: Battle, u: Unit) => Math.min(SYNERGY_CAPS.cooldown, sumEffects(b, u, 'cooldown'));
export const synRadiusMult = (b: Battle, u: Unit) => 1 + sumEffects(b, u, 'radius');
export const synEffectMult = (b: Battle, u: Unit) => 1 + sumEffects(b, u, 'skillEffect');

/** 피해 배율 = 1 + min(공격력계, 20%) + min(스킬·광역계, 20%). 한 시너지 효과는 피해 1건에 1회만 */
export function synergyDamageMult(b: Battle, owner: Unit | undefined, m: Monster, kind: DamageKind, tag: DamageTag) {
  if (!b.synergyEnabled || !owner || owner.area !== 'field' || tag === 'synergy' || tag === 'bonus' || !b.syn.active.size) return 1;
  let atk = 0, skill = 0;
  for (const def of activeDefs(b)) {
    for (const e of def.effects) {
      if (e.kind !== 'damage' || !applies(def, e, owner.memberId)) continue;
      if (e.tags && !e.tags.includes(tag)) continue;
      if (e.skillOnly && kind !== 'skill') continue;
      if (e.vsSlowed && !m.slows.length) continue;
      if (e.vsHpBelow !== undefined && m.hp / m.maxHp > e.vsHpBelow) continue;
      if (e.vsBoss && !m.def.boss) continue;
      if (e.bucket === 'atk') atk += e.amount; else skill += e.amount;
    }
  }
  return 1 + Math.min(SYNERGY_CAPS.damageTotal, Math.min(SYNERGY_CAPS.atk, atk) + Math.min(SYNERGY_CAPS.skill, skill));
}

/** 적중 후 확률 효과 (회피 시 미발동). 추가 피해는 bonus 태그라 재귀·중복 배율 없음 */
export function synergyAfterHit(b: Battle, owner: Unit | undefined, m: Monster, kind: DamageKind, tag: DamageTag, dealt: number) {
  if (!b.synergyEnabled || !owner || owner.area !== 'field' || tag === 'synergy' || tag === 'bonus' || !b.syn.active.size) return;
  for (const def of activeDefs(b)) {
    for (const e of def.effects) {
      if (e.kind === 'procSlow' && kind === 'attack' && e.who.includes(owner.memberId) && m.hp > 0 && b.rng() < e.chance) {
        b.applySlow(m, 'syn:' + def.id, owner.id, e.slow, e.duration);
      } else if (e.kind === 'procExtra' && e.who.includes(owner.memberId) && e.tags.includes(tag) && m.hp > 0 && b.rng() < e.chance) {
        b.dealDamage(m, dealt * e.mult, owner.id, 'skill', 'bonus');
      }
    }
  }
}

// ── UI 상태 ──
export interface SynergyView {
  id: string;
  name: string;
  tier: number;
  desc: string;
  active: boolean;
  members: { id: string; star: number }[];
  /** 미완성 시 부족 조건 (멤버 ID → 표시 이름은 UI에서 변환) */
  missing: string[];
  needHigh: number;
}
export function synergyViews(b: Battle): SynergyView[] {
  const max = fieldMaxStars(b);
  return SYNERGIES.map((def) => {
    const rule = TIER_RULES[def.tier];
    const members = def.members.map((id) => ({ id, star: max.get(id) ?? 0 }));
    const missing = members.filter((x) => x.star < rule.minStar).map((x) => x.id);
    const high = members.filter((x) => x.star >= 3).length;
    return {
      id: def.id, name: def.name, tier: def.tier, desc: def.desc, active: isSatisfied(def, max), members, missing,
      needHigh: Math.max(0, rule.highCount - high),
    };
  });
}
