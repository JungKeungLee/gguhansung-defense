import { memberById, type SkillDef } from '../data/members';
import { STAR_SKILL_DAMAGE_BONUS, STAR_SKILL_DURATION_BONUS, unitStats } from '../data/units';
import type { Battle, Monster, Unit, UnitCombatStats } from './combat';
import { chainTargets, densestPoint, inRadius, pickTarget, pierceLine } from './targeting';
import { synEffectMult, synRadiusMult } from './synergy';

/** 멤버별 기본 공격·스킬 처리. 시간은 모두 Battle.step(dt)의 게임 시간 기준 */

export const skillOf = (u: Unit): SkillDef => memberById(u.memberId).skill;
export const skillDamageBonus = (star: number) => STAR_SKILL_DAMAGE_BONUS[star - 1];
export const skillDurationBonus = (star: number) => STAR_SKILL_DURATION_BONUS[star - 1];

/** 스킬 피해 = 현재 공격력(등급 배율 이미 적용) × 스킬 배율 × (1 + 등급 스킬 보너스). 등급 배율 중복 없음 */
/** 스킬 피해 = 현재 공격력(등급·전역 공격력 1회 적용) × 스킬 배율 × (1 + 등급 스킬 보너스) × 전역 스킬 효율. 시너지는 dealDamage에서 별도 */
export const skillDamage = (u: Unit, stats: UnitCombatStats, mult: number) => stats.damage * mult * (1 + skillDamageBonus(u.star)) * stats.skillMult;
const duration = (u: Unit, base: number) => base * (1 + skillDurationBonus(u.star));

export const CHAOS_EFFECTS = ['광역 공격', '연속 공격', '적 감속'] as const;

export function basicAttack(b: Battle, u: Unit, stats: UnitCombatStats, target: Monster) {
  const m = memberById(u.memberId);
  const a = m.attack;
  switch (a.kind) {
    case 'single':
    case 'splash':
      b.fireProjectile(u.id, u, target, stats.damage, stats.projectileSpeed, m.color, a.kind === 'splash' ? a.radius * synRadiusMult(b, u) : 0);
      break;
    case 'pierce': {
      const { hits, end } = pierceLine(b.monsters, u, target, stats.range, a.width, a.maxTargets);
      b.emitFx({ kind: 'beam', points: [{ x: u.x, y: u.y }, end], color: m.color, width: 3 });
      for (const h of hits) b.dealDamage(h, stats.damage, u.id, 'attack', 'pierce');
      break;
    }
    case 'chain': {
      const hits = chainTargets(b.monsters, target, a.maxTargets, a.jumpRange);
      b.emitFx({ kind: 'beam', points: [{ x: u.x, y: u.y }, ...hits.map((h) => ({ x: h.x, y: h.y }))], color: m.color, width: 2 });
      hits.forEach((h, i) => b.dealDamage(h, stats.damage * a.falloff ** i, u.id, 'attack', 'chain'));
      break;
    }
  }
}

/** 발동했으면 true. 사거리 내 적이 없거나 조건 미충족이면 false → 쿨타임 소모 없이 대기 */
export function tryCastSkill(b: Battle, u: Unit, stats: UnitCombatStats): boolean {
  const near = inRadius(b.monsters, u, stats.range);
  if (!near.length) return false;
  const m = memberById(u.memberId);
  const s = m.skill;
  const color = m.color;
  const beam = (pts: { x: number; y: number }[], width: number) =>
    b.emitFx({ kind: 'beam', points: [{ x: u.x, y: u.y }, ...pts.map((p) => ({ x: p.x, y: p.y }))], color, width });
  const burst = (x: number, y: number, radius: number) => b.emitFx({ kind: 'burst', x, y, radius, color });
  /** 스킬 이미지 연출 (표시 전용, 판정과 같은 좌표·크기 값 사용) */
  const art = (x: number, y: number, size: number) => b.emitFx({ kind: 'skillArt', memberId: u.memberId, x, y, size });
  const artLine = (x: number, y: number, x2: number, y2: number) => b.emitFx({ kind: 'skillArt', memberId: u.memberId, x, y, x2, y2 });

  switch (s.kind) {
    case 'haste': {
      const d = duration(u, s.duration);
      b.addBuff(u, 'haste', u.id, s.bonus, d);
      u.activeRemain = d;
      art(u.x, u.y, 110);
      break;
    }
    case 'frostNova': {
      burst(u.x, u.y, stats.range);
      art(u.x, u.y, stats.range * 2);
      const dmg = skillDamage(u, stats, s.damageMult);
      for (const t of near) {
        b.applySlow(t, 'frost', u.id, s.slow, duration(u, s.slowDuration));
        b.dealDamage(t, dmg, u.id, 'skill', 'area');
      }
      break;
    }
    case 'blast': {
      const radius = s.radius * synRadiusMult(b, u);
      const c = densestPoint(near, b.monsters, radius)!;
      const cx = c.x, cy = c.y;
      burst(cx, cy, radius);
      art(cx, cy, radius * 2);
      const dmg = skillDamage(u, stats, s.damageMult);
      for (const t of inRadius(b.monsters, { x: cx, y: cy }, radius)) b.dealDamage(t, dmg, u.id, 'skill', 'area');
      break;
    }
    case 'summon': {
      const d = duration(u, s.duration);
      b.helpers = b.helpers.filter((h) => h.ownerId !== u.id);
      b.helpers.push({
        id: b.newId(), ownerId: u.id, color, x: u.x + 34, y: u.y - 34, remain: d, cooldown: 0,
        // 보조 공격체: 스킬 효율 적용, 사거리는 전역 사거리 강화 비율 적용
        damage: stats.damage * s.damageMult * stats.skillMult, attackSpeed: s.attackSpeed, range: s.range * (stats.range / unitStats(u.memberId, u.star).range), // 전역 사거리 강화 비율만 반영 (맵 보정 미적용)
      });
      art(u.x + 34, u.y - 34, 84);
      u.activeRemain = d;
      break;
    }
    case 'snipe': {
      const t = near.reduce((a, c) => (c.hp > a.hp ? c : a));
      beam([t], 5);
      artLine(u.x, u.y, t.x, t.y);
      b.dealDamage(t, skillDamage(u, stats, s.damageMult), u.id, 'skill', 'single');
      break;
    }
    case 'pierce': {
      const first = pickTarget(u, b.monsters, stats.range)!;
      const { hits, end } = pierceLine(b.monsters, u, first, stats.range, s.width, s.maxTargets);
      beam([end], 9);
      artLine(u.x, u.y, end.x, end.y);
      const dmg = skillDamage(u, stats, s.damageMult);
      for (const h of hits) b.dealDamage(h, dmg, u.id, 'skill', 'pierce');
      break;
    }
    case 'chaos': {
      const pick = Math.min(2, Math.floor(b.rng() * 3));
      u.lastChaos = CHAOS_EFFECTS[pick];
      if (pick === 0) {
        const t = pickTarget(u, b.monsters, stats.range)!;
        const cx = t.x, cy = t.y;
        burst(cx, cy, s.blastRadius);
        art(cx, cy, s.blastRadius * 2);
        const dmg = skillDamage(u, stats, s.blastMult);
        for (const h of inRadius(b.monsters, { x: cx, y: cy }, s.blastRadius)) b.dealDamage(h, dmg, u.id, 'skill', 'area');
      } else if (pick === 1) {
        const dmg = skillDamage(u, stats, s.barrageMult);
        for (let i = 0; i < s.barrageHits; i++) {
          const t = pickTarget(u, b.monsters, stats.range); // 처치된 대상은 제외하고 재선정
          if (!t) break;
          if (i === 0) art(t.x, t.y, 72);
          beam([t], 2);
          b.dealDamage(t, dmg, u.id, 'skill', 'single');
        }
      } else {
        burst(u.x, u.y, stats.range);
        art(u.x, u.y, stats.range * 1.2);
        const dmg = skillDamage(u, stats, s.slowMult);
        for (const t of near) {
          b.applySlow(t, 'chaos', u.id, s.slow * synEffectMult(b, u), duration(u, s.slowDuration));
          b.dealDamage(t, dmg, u.id, 'skill', 'area');
        }
      }
      break;
    }
    case 'aura': {
      const d = duration(u, s.duration);
      burst(u.x, u.y, s.radius);
      art(u.x, u.y, s.radius * 2);
      const r2 = s.radius * s.radius;
      for (const ally of b.units) {
        if (ally.area === 'field' && (ally.x - u.x) ** 2 + (ally.y - u.y) ** 2 <= r2) b.addBuff(ally, 'aura', u.id, s.bonus, d);
      }
      u.activeRemain = d;
      break;
    }
    case 'execute': {
      const cands = near.filter((t) => t.hp / t.maxHp <= s.threshold);
      if (!cands.length) return false; // 낭비하지 않음
      const t = cands.reduce((a, c) => (c.hp / c.maxHp < a.hp / a.maxHp ? c : a));
      beam([t], 6);
      art(t.x, t.y, 90);
      b.dealDamage(t, skillDamage(u, stats, s.damageMult), u.id, 'skill', 'single');
      break;
    }
    case 'chain': {
      const first = pickTarget(u, b.monsters, stats.range)!;
      const hits = chainTargets(b.monsters, first, s.maxTargets, s.jumpRange);
      beam(hits, 4);
      if (hits.length > 1) artLine(hits[0].x, hits[0].y, hits[hits.length - 1].x, hits[hits.length - 1].y); else art(hits[0].x, hits[0].y, 80);
      const dmg = skillDamage(u, stats, s.damageMult);
      hits.forEach((h, i) => b.dealDamage(h, dmg * s.falloff ** i, u.id, 'skill', 'chain'));
      break;
    }
  }
  b.emitFx({ kind: 'cast', x: u.x, y: u.y, color, text: s.name });
  return true;
}
