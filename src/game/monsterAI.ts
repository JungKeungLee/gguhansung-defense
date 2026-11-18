import { BOSS_MINION_CAP, BOSS_WARN_TIME, MAX_DAMAGE_REDUCTION, type MonsterAbility } from '../data/monsters';
import type { Battle, DamageKind, Monster } from './combat';
import { inRadius } from './targeting';

/** 몬스터 특수 능력·보스 패턴. 시간은 Battle.step(dt)의 게임 시간 기준 */

type Timed = Extract<MonsterAbility, { interval: number }>;
const isTimed = (a: MonsterAbility): a is Timed => 'interval' in a;

export const hpRatio = (m: Monster) => m.hp / m.maxHp;

export function phaseOf(m: Monster) {
  let p = 1;
  for (const t of m.def.phases ?? []) if (hpRatio(m) <= t) p++;
  return p;
}
const isActive = (a: MonsterAbility, m: Monster) => !a.phases || a.phases.includes(phaseOf(m));

export const isEnraged = (m: Monster) => !!m.def.enrage && hpRatio(m) <= m.def.enrage.threshold;

export function speedMult(m: Monster) {
  return 1 + (isEnraged(m) ? m.def.enrage!.bonus : 0) + m.speedAura;
}

/** 받는 피해 감소 합계 (상한 50%). 일반 공격 방어는 스킬에 미적용 */
export function damageReduction(m: Monster, kind: DamageKind) {
  let r = m.guard;
  if (kind === 'attack') r += m.def.attackArmor ?? 0;
  if (m.armorRemain > 0) r += m.armorAmount;
  if (m.lastStandRemain > 0) r += m.def.lastStand!.reduction;
  return Math.min(MAX_DAMAGE_REDUCTION, r);
}

/** 곧 사용할 보스 주기 스킬 이름 (경고 표시용) */
export function bossWarning(m: Monster): string | null {
  if (!m.def.boss) return null;
  const abs = m.def.abilities ?? [];
  for (let i = 0; i < abs.length; i++) {
    const a = abs[i];
    if (isTimed(a) && isActive(a, m) && m.timers[i] <= BOSS_WARN_TIME) return a.name;
  }
  return null;
}

export function initTimers(m: Monster) {
  m.timers = (m.def.abilities ?? []).map((a) => (isTimed(a) ? a.interval : 0));
}

export function updateMonsterAbilities(b: Battle, dt: number) {
  const ms = b.monsters;
  const auras: { m: Monster; a: Extract<MonsterAbility, { kind: 'guard' | 'hasteAura' }> }[] = [];
  for (const m of ms) {
    if (m.hp <= 0 || !m.def.abilities) continue;
    for (const a of m.def.abilities) if ((a.kind === 'guard' || a.kind === 'hasteAura') && isActive(a, m)) auras.push({ m, a });
  }

  for (const m of ms) {
    if (m.hp <= 0) continue;
    // 지속 보호·가속: 같은 종류는 중첩 없이 최댓값만 (자기 자신 제외)
    m.guard = 0;
    m.speedAura = 0;
    for (const { m: src, a } of auras) {
      if (src === m || (src.x - m.x) ** 2 + (src.y - m.y) ** 2 > a.radius ** 2) continue;
      if (a.kind === 'guard') m.guard = Math.max(m.guard, a.reduction);
      else if (a.kind === 'hasteAura') m.speedAura = Math.max(m.speedAura, a.bonus);
    }

    m.armorRemain = Math.max(0, m.armorRemain - dt);
    m.lastStandRemain = Math.max(0, m.lastStandRemain - dt);
    if (m.shieldHp > 0 && (m.shieldRemain -= dt) <= 0) m.shieldHp = 0;
    const ls = m.def.lastStand;
    if (ls && !m.lastStandUsed && hpRatio(m) <= ls.threshold) {
      m.lastStandUsed = true; // 1회만 발동
      m.lastStandRemain = ls.duration;
      b.emitFx({ kind: 'burst', x: m.x, y: m.y, radius: 50, color: 0xffd700 });
    }

    const abs = m.def.abilities;
    if (!abs) continue;
    for (let i = 0; i < abs.length; i++) {
      const a = abs[i];
      if (!isTimed(a) || !isActive(a, m)) continue;
      if ((m.timers[i] -= dt) > 0) continue;
      m.timers[i] += a.interval;
      perform(b, m, a);
    }
  }
}

function perform(b: Battle, m: Monster, a: Timed) {
  switch (a.kind) {
    case 'summon': {
      const alive = b.monsters.filter((c) => c.summonerId === m.id && c.hp > 0).length + b.pendingFrom(m.id);
      const n = Math.min(a.count, BOSS_MINION_CAP - alive);
      for (let k = 0; k < n; k++) b.queueSpawn(a.monster, m.distance - 18 * (k + 1), m.hpScale, m.id);
      b.emitFx({ kind: 'burst', x: m.x, y: m.y, radius: 45, color: m.def.color });
      break;
    }
    case 'heal':
      for (const c of inRadius(b.monsters, m, a.radius)) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * a.pct);
      b.emitFx({ kind: 'burst', x: m.x, y: m.y, radius: a.radius, color: 0x5ad16f });
      break;
    case 'armorUp':
      m.armorRemain = a.duration;
      m.armorAmount = a.reduction;
      b.emitFx({ kind: 'burst', x: m.x, y: m.y, radius: 50, color: 0xd4af37 });
      break;
    case 'shield':
      m.shieldHp = m.maxHp * a.pct;
      m.shieldRemain = a.duration;
      b.emitFx({ kind: 'burst', x: m.x, y: m.y, radius: 50, color: 0x6fd3ff });
      break;
  }
}
