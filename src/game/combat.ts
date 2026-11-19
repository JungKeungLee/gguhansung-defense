import { monsterDef, type MonsterDef } from '../data/monsters';
import { EFFECT_CAPS, unitStats } from '../data/units';
import { START_GOLD, waveReward } from '../data/economy';
import { BOSS_GATE_TIME, FINAL_BOSS_TIME, FIRST_PREP_TIME, MAX_ALIVE, PREP_TIME, WAVES, resolveWave, waveSpawnList, type WaveDef } from '../data/waves';
import { FIELD_SLOTS, GRID, STORAGE_SLOTS, cellCenter, pathPoint } from './layout';
import { pickTarget } from './targeting';
import { basicAttack, skillOf, tryCastSkill } from './skills';
import { damageReduction, initTimers, speedMult, updateMonsterAbilities } from './monsterAI';
import { newSynergyState, synAttackSpeed, synCooldown, synergyAfterHit, synergyDamageMult, updateSynergies } from './synergy';
import type { DamageTag, SynergyDef } from '../data/synergies';
import { UPGRADE_IDS, upgradeBonus, type UpgradeId } from '../data/upgrades';
import { DIFFICULTIES, regularHpMult, type DifficultyId } from '../data/difficulty';

export { pickTarget };

/** 지속 효과 (감속·공격속도 증가). 능력치는 매번 계산하므로 만료 시 자동 복구 */
export interface TimedEffect {
  source: string;
  sourceId: number;
  amount: number;
  remain: number;
}

export interface Monster {
  id: number;
  def: MonsterDef;
  hp: number;
  maxHp: number;
  /** 시작점부터 누적 이동 거리. 클수록 앞서 있는 몬스터 */
  distance: number;
  x: number;
  y: number;
  slows: TimedEffect[];
  /** 웨이브 체력 배율 (분열·소환 몬스터에 상속) */
  hpScale: number;
  /** 보스가 소환한 몬스터면 보스 ID */
  summonerId: number | null;
  /** 주기 능력별 남은 시간 */
  timers: number[];
  armorRemain: number;
  armorAmount: number;
  shieldHp: number;
  shieldRemain: number;
  lastStandRemain: number;
  lastStandUsed: boolean;
  /** 매 프레임 계산: 주변 보호 효과·가속 효과 */
  guard: number;
  speedAura: number;
  /** 최종 보스 여부 — 몬스터 ID가 아니라 등장 웨이브로 결정 (50웨이브 보스만 true, 30웨이브 혼돈의 군주는 false) */
  final: boolean;
}

/** attack: 일반 공격(회피·일반 방어 적용), skill: 스킬(회피 불가) */
export type DamageKind = 'attack' | 'skill';
export type DefeatReason = 'overflow' | 'timeout';

export type Area = 'field' | 'storage';

export interface Unit {
  /** 고유 유닛 ID */
  id: number;
  memberId: string;
  /** 1~5 */
  star: number;
  area: Area;
  /** field: row * GRID.cols + col, storage: 0~19 */
  index: number;
  locked: boolean;
  x: number;
  y: number;
  cooldown: number;
  kills: number;
  /** 스킬 남은 쿨타임(초) */
  skillCd: number;
  buffs: TimedEffect[];
  /** 자신의 지속형 스킬(공속 증가·응원가·소환) 남은 시간 */
  activeRemain: number;
  lastChaos?: string;
}

export interface UnitCombatStats {
  damage: number;
  attackSpeed: number;
  range: number;
  projectileSpeed: number;
  /** 스킬 피해 배율 (전역 스킬 효율 강화). 스킬 피해 계산에서만 1회 곱함 */
  skillMult: number;
}

/** 모야 스킬 보조 공격체. 칸을 차지하지 않고 몬스터 수에도 포함되지 않음 */
export interface Helper {
  id: number;
  ownerId: number;
  color: number;
  x: number;
  y: number;
  remain: number;
  cooldown: number;
  damage: number;
  attackSpeed: number;
  range: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  ownerId: number;
  damage: number;
  speed: number;
  color: number;
  /** 0이면 단일, >0이면 착탄 지점 반경 피해 */
  splash: number;
  tag: DamageTag;
}

export type FxEvent =
  | { kind: 'beam'; points: { x: number; y: number }[]; color: number; width: number }
  | { kind: 'burst'; x: number; y: number; radius: number; color: number }
  | { kind: 'cast'; x: number; y: number; color: number; text: string }
  | { kind: 'miss'; x: number; y: number }
  /** 스킬 이미지 연출 (표시 전용): 점 효과는 size(지름), 선 효과는 (x,y)→(x2,y2) */
  | { kind: 'skillArt'; memberId: string; x: number; y: number; size?: number; x2?: number; y2?: number };

/** prep: 다음 웨이브 대기, spawning: 소환 중, clearing: 마지막 웨이브 소환 완료 후 잔여 처치 */
export type Phase = 'prep' | 'spawning' | 'clearing' | 'victory' | 'defeat';

/** Phaser와 무관한 순수 전투 상태. Scene은 step()을 호출하고 결과를 그리기만 한다. */
export class Battle {
  monsters: Monster[] = [];
  units: Unit[] = [];
  helpers: Helper[] = [];
  projectiles: Projectile[] = [];
  waveIndex = -1;
  phase: Phase = 'prep';
  timer = FIRST_PREP_TIME;
  spawned = 0;
  kills = 0;
  gold = START_GOLD;
  rng: () => number = Math.random;
  /** 시너지 적용 여부 (밸런스 비교용, 게임에서는 항상 true) */
  synergyEnabled = true;
  syn = newSynergyState();
  onSynergy?: (def: SynergyDef, active: boolean) => void;
  /** 최종 보스 남은 제한시간. 등장 전 null */
  finalTimer: number | null = null;
  defeatReason: DefeatReason | null = null;
  /** 경과 게임 시간(초, 배속 반영) — 기록 표시용, 전투 판정에 미사용 */
  time = 0;
  /** 최종 보스 처치 여부 — 기록용 */
  finalBossKilled = false;
  /** 플레이 중 달성한 최고 등급 — 기록용 (판정 미사용) */
  maxStarReached = 0;
  /** 분열·보스 소환 대기열 (프레임 끝에 생성, 웨이브 출현 수와 별개) */
  pending: { id: string; distance: number; hpScale: number; summonerId: number | null }[] = [];
  private waveList: string[] = [];
  /** 이번 웨이브 실제 구성 (랜덤 웨이브는 시작 시 1회 확정) */
  private curWave: WaveDef | null = null;
  /** 처치해야 다음 웨이브로 넘어가는 보스 ID (30·35·40·45웨이브). null이면 대기 없음 */
  gateBossId: number | null = null;
  /** 보스 대기 남은 게임 시간(초). 보스 등장 시 BOSS_GATE_TIME에서 시작, step(dt)로만 감소(일시정지 중 정지·배속 반영) */
  gateTimer: number | null = null;
  onHit?: (x: number, y: number, killed: boolean, monsterId: number) => void;
  onFx?: (fx: FxEvent) => void;
  private nextId = 1;
  /** 전역 강화 단계 (재시작 = 새 Battle → 초기화) */
  upgrades: Record<UpgradeId, number> = Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Record<UpgradeId, number>;
  readonly difficulty: DifficultyId;

  constructor(difficulty: DifficultyId = 'normal') {
    this.difficulty = difficulty;
  }
  get diff() {
    return DIFFICULTIES[this.difficulty];
  }

  get waveNumber() {
    return this.waveIndex + 1;
  }
  get isOver() {
    return this.phase === 'victory' || this.phase === 'defeat';
  }

  newId() {
    return this.nextId++;
  }

  unitAtSlot(area: Area, index: number) {
    return this.units.find((u) => u.area === area && u.index === index) ?? null;
  }

  /** 전투 칸 우선, 가득 차면 보관함 */
  freeSlot(): { area: Area; index: number } | null {
    for (let i = 0; i < FIELD_SLOTS; i++) if (!this.unitAtSlot('field', i)) return { area: 'field', index: i };
    for (let i = 0; i < STORAGE_SLOTS; i++) if (!this.unitAtSlot('storage', i)) return { area: 'storage', index: i };
    return null;
  }

  addUnit(memberId: string, star: number, area: Area, index: number): Unit {
    const unit: Unit = {
      id: this.nextId++, memberId, star, area, index, locked: false, x: 0, y: 0, cooldown: 0, kills: 0,
      skillCd: 0, buffs: [], activeRemain: 0,
    };
    unit.skillCd = skillOf(unit).cooldown; // 배치 후 첫 쿨타임을 채운 뒤 발동
    this.maxStarReached = Math.max(this.maxStarReached, star); // 소환·합성 결과 모두 addUnit 경유
    this.setSlot(unit, area, index);
    this.units.push(unit);
    return unit;
  }

  setSlot(unit: Unit, area: Area, index: number) {
    if (area === 'storage' && unit.area === 'field') this.clearFieldEffects(unit);
    unit.area = area;
    unit.index = index;
    if (area === 'field') Object.assign(unit, cellCenter(index % GRID.cols, Math.floor(index / GRID.cols)));
  }

  /** 판매·합성으로 제거: 해당 유닛이 만든 버프·보조 공격체도 함께 정리 */
  removeUnits(ids: number[]) {
    for (const u of this.units) if (ids.includes(u.id)) this.clearFieldEffects(u);
    this.units = this.units.filter((u) => !ids.includes(u.id));
  }

  /** 전투 칸을 떠날 때: 자신의 버프·지속 스킬·보조 공격체와 다른 아군에게 준 버프 정리 */
  private clearFieldEffects(u: Unit) {
    u.buffs = [];
    u.activeRemain = 0;
    u.cooldown = 0;
    this.helpers = this.helpers.filter((h) => h.ownerId !== u.id);
    for (const o of this.units) if (o.buffs.length) o.buffs = o.buffs.filter((b) => b.sourceId !== u.id);
  }

  // ── 효과 ──
  /** 같은 계열(source)은 시전자가 여럿이어도 최댓값만, 계열 합계는 상한 적용 */
  hasteOf(u: Unit) {
    const best = new Map<string, number>();
    for (const b of u.buffs) best.set(b.source, Math.max(best.get(b.source) ?? 0, b.amount));
    let sum = 0;
    best.forEach((v) => (sum += v));
    return Math.min(EFFECT_CAPS.maxHaste, sum);
  }
  slowOf(m: Monster) {
    return Math.min(EFFECT_CAPS.maxSlow, m.slows.reduce((s, e) => s + e.amount, 0)) * (1 - (m.def.slowResist ?? 0));
  }
  statsOf(u: Unit): UnitCombatStats {
    const base = unitStats(u.memberId, u.star); // 등급 배율은 여기서 1회만
    const up = this.upgrades;
    // 기존 버프(상한 50%)와 시너지 공속(상한 15%)은 각자 상한 후 합산
    // 공격속도 = 기본 × (1 + 버프[상한50%] + 시너지[상한8%] + 전역 강화) — 각자 상한 후 합산
    return {
      ...base,
      damage: base.damage * (1 + upgradeBonus('attack', up.attack)),
      attackSpeed: base.attackSpeed * (1 + this.hasteOf(u) + synAttackSpeed(this, u) + upgradeBonus('attackSpeed', up.attackSpeed)),
      range: base.range * (1 + upgradeBonus('range', up.range)),
      skillMult: 1 + upgradeBonus('skill', up.skill),
    };
  }

  /** 시전자별로 따로 저장(한 시전자 제거 시 다른 시전자 효과 유지), 합산은 hasteOf에서 계열별 최댓값 */
  addBuff(u: Unit, source: string, sourceId: number, amount: number, duration: number) {
    upsert(u.buffs, source, sourceId, amount, duration);
  }
  /** 같은 유닛의 같은 감속은 갱신, 서로 다른 감속은 합산 후 상한 적용 */
  applySlow(m: Monster, source: string, sourceId: number, amount: number, duration: number) {
    if (m.hp > 0) upsert(m.slows, source, sourceId, amount, duration * (m.def.slowDurationMult ?? 1));
  }

  /** 모든 피해의 단일 경로: 죽은 몬스터 무시, 회피·피해 감소·보호막, 처치 골드·분열 1회 */
  dealDamage(m: Monster, amount: number, ownerId: number, kind: DamageKind, tag: DamageTag = 'single'): boolean {
    if (m.hp <= 0 || amount <= 0) return false;
    if (kind === 'attack' && m.def.evasion && this.rng() < m.def.evasion) {
      this.emitFx({ kind: 'miss', x: m.x, y: m.y });
      return false;
    }
    const owner = this.units.find((u) => u.id === ownerId);
    amount *= synergyDamageMult(this, owner, m, kind, tag);
    const dealt = amount;
    amount *= 1 - damageReduction(m, kind);
    if (m.shieldHp > 0) {
      const absorbed = Math.min(m.shieldHp, amount);
      m.shieldHp -= absorbed;
      amount -= absorbed;
    }
    m.hp -= amount;
    const killed = m.hp <= 0;
    if (killed) {
      this.kills++;
      this.gold += m.def.gold;
      if (m.final) this.finalBossKilled = true;
      if (owner) owner.kills++;
      const sp = m.def.split;
      if (sp) for (let k = 0; k < sp.count; k++) this.queueSpawn(sp.monster, m.distance - 14 * k, m.hpScale, m.summonerId);
    }
    this.onHit?.(m.x, m.y, killed, m.id);
    synergyAfterHit(this, owner, m, kind, tag, dealt);
    return killed;
  }

  queueSpawn(id: string, distance: number, hpScale: number, summonerId: number | null) {
    this.pending.push({ id, distance: Math.max(0, distance), hpScale, summonerId });
  }
  pendingFrom(summonerId: number) {
    return this.pending.filter((p) => p.summonerId === summonerId).length;
  }

  private defeat(reason: DefeatReason) {
    if (this.isOver) return; // 결과 중복 처리 방지
    this.phase = 'defeat';
    this.defeatReason = reason;
  }

  fireProjectile(ownerId: number, from: { x: number; y: number }, target: Monster, damage: number, speed: number, color: number, splash = 0, tag: DamageTag = splash > 0 ? 'area' : 'single') {
    this.projectiles.push({ id: this.nextId++, x: from.x, y: from.y, targetId: target.id, ownerId, damage, speed, color, splash, tag });
  }

  emitFx(fx: FxEvent) {
    this.onFx?.(fx);
  }

  step(dt: number) {
    if (this.isOver) return;
    this.updateWave(dt);
    if (this.isOver) return;
    this.time += dt;
    if (this.finalTimer !== null) this.finalTimer -= dt;

    updateMonsterAbilities(this, dt);
    if (this.synergyEnabled) updateSynergies(this, dt);
    for (const m of this.monsters) {
      m.distance += m.def.speed * this.diff.speedMult * speedMult(m) * (1 - this.slowOf(m)) * dt;
      const p = pathPoint(m.distance);
      m.x = p.x;
      m.y = p.y;
      if (m.slows.length) m.slows = tick(m.slows, dt);
    }

    for (const u of this.units) {
      if (u.area !== 'field') continue; // 보관함 유닛은 공격·스킬·쿨타임 진행 없음
      if (u.buffs.length) u.buffs = tick(u.buffs, dt);
      u.activeRemain = Math.max(0, u.activeRemain - dt);
      let stats = this.statsOf(u);
      u.skillCd = Math.max(0, u.skillCd - dt);
      if (u.skillCd <= 0 && tryCastSkill(this, u, stats)) {
        u.skillCd = skillOf(u).cooldown * (1 - synCooldown(this, u));
        stats = this.statsOf(u); // 자기 강화 스킬 즉시 반영
      }
      u.cooldown = Math.max(0, u.cooldown - dt);
      if (u.cooldown > 0) continue;
      const target = pickTarget(u, this.monsters, stats.range);
      if (!target) continue;
      basicAttack(this, u, stats, target);
      u.cooldown = 1 / stats.attackSpeed;
    }

    this.updateHelpers(dt);
    this.updateProjectiles(dt);
    this.monsters = this.monsters.filter((m) => m.hp > 0);

    // 판정 순서: ① 분열·소환 생성 → 80마리 패배 ② 승리(이번 구간 전투 결과 우선) ③ 제한시간 만료 패배
    for (const p of this.pending.splice(0)) this.spawn(monsterDef(p.id), p.hpScale, p.distance, p.summonerId);
    if (this.monsters.length >= MAX_ALIVE) return this.defeat('overflow');
    if (this.phase === 'clearing' && this.monsters.length === 0) {
      this.phase = 'victory';
      return;
    }
    if (this.finalTimer !== null && this.finalTimer <= 0) this.defeat('timeout');
  }

  private updateHelpers(dt: number) {
    if (!this.helpers.length) return;
    this.helpers = this.helpers.filter((h) => (h.remain -= dt) > 0); // 사라진 보조 공격체는 공격하지 않음
    for (const h of this.helpers) {
      h.cooldown = Math.max(0, h.cooldown - dt);
      if (h.cooldown > 0) continue;
      const t = pickTarget(h, this.monsters, h.range);
      if (!t) continue;
      this.fireProjectile(h.ownerId, h, t, h.damage, 600, h.color, 0, 'summon'); // 보조 공격체 공격은 일반 공격 판정
      h.cooldown = 1 / h.attackSpeed;
    }
  }

  private updateWave(dt: number) {
    if (this.gateBossId !== null) {
      // 보스 대기 (30·35·40·45): 처치하거나 게임 시간 30초가 지나면 대기 해제 → 준비 시간 6초 후 다음 웨이브 (1회만).
      // 만료 시 보스는 제거하지 않고 계속 전투. 대기 중에는 다음 웨이브·보상·소환 없음
      this.gateTimer = (this.gateTimer ?? BOSS_GATE_TIME) - dt;
      const alive = this.monsters.some((m) => m.id === this.gateBossId && m.hp > 0);
      if (alive && this.gateTimer > 0) { if (this.phase === 'prep') return; }
      else {
        this.gateBossId = null;
        this.gateTimer = null;
        if (this.phase === 'prep') this.timer = PREP_TIME;
      }
    }
    this.timer -= dt;
    if (this.phase === 'prep' && this.timer <= 0) {
      this.waveIndex++;
      this.spawned = 0;
      this.curWave = resolveWave(WAVES[this.waveIndex], this.waveNumber, this.rng); // 랜덤 구성은 여기서 1회만 확정
      this.waveList = waveSpawnList(this.curWave, this.diff.countMult);
      this.phase = 'spawning';
    }
    if (this.phase !== 'spawning') return;
    const wave = this.curWave ?? WAVES[this.waveIndex];
    const count = this.waveList.length;
    while (this.timer <= 0 && this.spawned < count) {
      const isBoss = !!wave.boss && this.spawned === count - 1; // 보스는 목록 마지막
      const m = this.spawn(monsterDef(this.waveList[this.spawned]), wave.hpScale, 0, null, isBoss ? { baseHp: wave.bossHp, final: !!wave.final } : undefined);
      if (isBoss && wave.gate) { this.gateBossId = m.id; this.gateTimer = BOSS_GATE_TIME; } // 등장 순간부터 30초
      this.spawned++;
      if (this.monsters.length >= MAX_ALIVE) return this.defeat('overflow');
      this.timer += wave.interval;
    }
    if (this.spawned >= count) {
      this.gold += waveReward(this.waveNumber, this.difficulty); // 출현 완료 시 1회 지급 (직후 phase 변경), 난이도별 추가분 포함
      const last = this.waveIndex >= WAVES.length - 1;
      this.phase = last ? 'clearing' : 'prep';
      this.timer = last ? 0 : PREP_TIME;
    }
  }

  /** 이번 웨이브 예정 출현 수 (보스 포함, 분열·소환 제외) */
  get waveTotal() {
    return this.waveList.length;
  }

  /** opts.baseHp: 웨이브별 보스 기본 체력(난이도 보스 배율 1회 적용), opts.final: 최종 보스(50웨이브) */
  spawn(def: MonsterDef, hpScale: number, distance = 0, summonerId: number | null = null, opts?: { baseHp?: number; final?: boolean }): Monster {
    const hp = Math.round(def.boss ? (opts?.baseHp ?? def.hp) * this.diff.bossHpMult : def.hp * hpScale * regularHpMult(this.diff, this.waveNumber));
    const final = !!opts?.final;
    const p = pathPoint(distance);
    const m: Monster = {
      id: this.nextId++, def, hp, maxHp: hp, distance, x: p.x, y: p.y, slows: [], hpScale, summonerId, timers: [],
      armorRemain: 0, armorAmount: 0, shieldHp: 0, shieldRemain: 0, lastStandRemain: 0, lastStandUsed: false, guard: 0, speedAura: 0, final,
    };
    initTimers(m);
    this.monsters.push(m);
    if (final && this.finalTimer === null) this.finalTimer = FINAL_BOSS_TIME; // 50웨이브 최종 보스 실제 등장 순간에만 시작
    return m;
  }

  private updateProjectiles(dt: number) {
    const alive: Projectile[] = [];
    for (const p of this.projectiles) {
      const t = this.monsters.find((m) => m.id === p.targetId && m.hp > 0);
      if (!t) continue; // 대상이 이미 처치됨
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const dist = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (dist <= move + t.def.radius) {
        if (p.splash > 0) {
          this.emitFx({ kind: 'burst', x: t.x, y: t.y, radius: p.splash, color: p.color });
          const r2 = p.splash * p.splash;
          for (const m of this.monsters) {
            if ((m.x - t.x) ** 2 + (m.y - t.y) ** 2 <= r2) this.dealDamage(m, p.damage, p.ownerId, 'attack', p.tag);
          }
        } else {
          this.dealDamage(t, p.damage, p.ownerId, 'attack', p.tag);
        }
        continue;
      }
      p.x += (dx / dist) * move;
      p.y += (dy / dist) * move;
      alive.push(p);
    }
    this.projectiles = alive;
  }
}

function tick(effects: TimedEffect[], dt: number) {
  return effects.filter((e) => (e.remain -= dt) > 0);
}

/** 같은 시전자의 같은 효과는 갱신, 다른 시전자는 별도 항목 */
function upsert(list: TimedEffect[], source: string, sourceId: number, amount: number, duration: number) {
  const e = list.find((x) => x.source === source && x.sourceId === sourceId);
  if (e) {
    e.amount = Math.max(e.amount, amount);
    e.remain = Math.max(e.remain, duration);
  } else {
    list.push({ source, sourceId, amount, remain: duration });
  }
}
