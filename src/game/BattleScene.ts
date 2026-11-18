import Phaser from 'phaser';
import { MAX_ALIVE, WAVES } from '../data/waves';
import { memberById } from '../data/members';
import { skillDamageBonus, skillDurationBonus, skillOf } from './skills';
import { Battle, type Area, type FxEvent, type Monster, type Unit } from './combat';
import { bossWarning, isEnraged, phaseOf } from './monsterAI';
import { synergyViews } from './synergy';
import { buyUpgrade } from './army';
import { UPGRADES, UPGRADE_IDS, UPGRADE_MAX, upgradeBonus } from '../data/upgrades';
import type { DifficultyId } from '../data/difficulty';
import { artKey, artUrl } from '../ui/characterArt';
import { monsterArtUrl } from '../ui/monsterArt';
import { GROUND_MARKER_SIZE, SKILL_FX, skillFxDuration, skillFxKey, type SkillFxSpec } from '../ui/skillFxMap';
import { skillFxUrl } from '../ui/skillFxArt';
import { MONSTER_ART_CONTENT, MONSTER_ART_FILE, monsterArtKey, monsterVisualSize } from '../ui/monsterArtMap';
import { BOSS_POOL, RANDOM_MONSTERS, waveSpawnList } from '../data/waves';
import { saveRecord, type PlayRecord } from '../records/records';
import { buildRecord } from '../records/buildRecord';
import {
  FAIL_TEXT, isFocusUnlocked, mergeAll, mergeWith, mergeableIds, moveUnit, sell, sellMany, sellPrice, summon, toggleLock,
  type ActionResult,
} from './army';
import { DEFAULT_SPEED, gameControls, hudStore, type BossView, type GameSpeed, type HudMessage, type UnitView } from './bridge';
import { FIELD_SLOTS, GRID, MAP_H, MAP_IMAGE, MAP_SCALE, MAP_W, PATH_LENGTH, STORAGE_SLOTS, cellAt, cellCenter, pathPoint, pathWithinRange } from './layout';
import battleMapUrl from '../assets/maps/battle-map.webp';

const C = {
  bg: 0x140a0d,
  path: 0x3a1a20,
  pathEdge: 0x8a6a2a,
  cell: 0x22121a,
  cellHover: 0x3a1c26,
  cellEdge: 0x5a3a28,
  gold: 0xd4af37,
  crimson: 0xc8102e,
  hpBg: 0x000000,
  hp: 0xe04848,
};

interface HitFx { x: number; y: number; t: number; kind: 'hit' | 'kill' | 'merge' }
const FX_DUR = { hit: 0.25, kill: 0.25, merge: 0.6 };
const BFX_DUR = { beam: 0.18, burst: 0.35, cast: 0.5, miss: 0.35, skillArt: 0 };
/** 동시에 표시할 스킬 이미지 최대 수 (초과분은 기존 원·선 이펙트만) */
const MAX_SKILL_SPRITES = 30;
/** 정다각형 꼭짓점 */
function poly(x: number, y: number, r: number, sides: number, rot = -Math.PI / 2) {
  return Array.from({ length: sides }, (_, i) => ({ x: x + Math.cos(rot + (i * 2 * Math.PI) / sides) * r, y: y + Math.sin(rot + (i * 2 * Math.PI) / sides) * r }));
}
const SHAPE_SIDES = { triangle: 3, square: 4, diamond: 4, hex: 6 } as const;
const stars = (n: number) => '★'.repeat(n);
/** 칸 중심 기준 하단 정보 띠(별·이름) 세로 위치 — 칸 높이 약 81px, 아래 끝에서 약 13px 위 (잠금 점선 테두리와 겹치지 않게) */
const INFO_Y = GRID.cellH / 2 - 13;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private speed: GameSpeed = DEFAULT_SPEED;
  private paused = false;
  private selectedId: number | null = null;
  private fx: HitFx[] = [];
  private bfx: { fx: FxEvent; t: number }[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private hudElapsed = 0;
  private autoMerge = false;
  private moveMode = false;
  /** 다중 판매 모드: 클릭 = 선택/해제, 드래그·이동·수동 합성·잠금 비활성 */
  private multiSell = false;
  private picked = new Set<number>();
  /** 드래그 중 유닛 ID. 이동은 endDrag → moveUnit 한 경로로만 처리 */
  private dragId: number | null = null;
  /** 난이도 선택 대기 중 (전투 진행 없음) */
  private waiting = true;
  /** 이번 판 기록 저장 완료 여부 (종료 확정 시 1회만 저장) */
  private recorded = false;
  private result: PlayRecord | null = null;
  private recordFailed = false;
  /** 실제 플레이 시간(ms): 시작 후 일시정지 제외 */
  private realMs = 0;
  private unitImgs: Phaser.GameObjects.Image[] = [];
  /** 몬스터 이미지: 살아 있는 몬스터 ID → 스프라이트 (표시 전용, 좌표·판정은 Battle) */
  private monSprites = new Map<number, Phaser.GameObjects.Image>();
  /** 사망 연출이 끝난 스프라이트 재사용 풀 */
  private monPool: Phaser.GameObjects.Image[] = [];
  private monFx = new Map<number, { born: number; hitUntil: number; boss: boolean }>();
  private monArtRequested = new Set<string>();
  private prefetchedWave = -2;
  /** 스킬 이미지 연출 (표시 전용) */
  private skillSprites: { s: Phaser.GameObjects.Image; t: number; dur: number; spec: SkillFxSpec; scale: number; memberId: string; x: number; y: number; size: number; marker: boolean }[] = [];
  private skillPool: Phaser.GameObjects.Image[] = [];
  private skillArtRequested = new Set<string>();
  /** 스킬 이름 떠오르는 글자 (재시작 시 즉시 정리) */
  private castTexts = new Set<Phaser.GameObjects.Text>();
  /** 투사체·이펙트·몬스터 체력바 (몬스터 그림 위) */
  private top!: Phaser.GameObjects.Graphics;
  /** 유닛 위 표식(잠금·합성 가능) — 캐릭터 이미지보다 위 */
  private ov!: Phaser.GameObjects.Graphics;
  /** 칸 하단 정보 띠(별·이름 배경) — 캐릭터(1) 위, 글자(2) 아래 */
  private infoG!: Phaser.GameObjects.Graphics;
  private press: { id: number; x: number; y: number } | null = null;
  private message: HudMessage | null = null;
  private msgSeq = 0;
  private mergeable = new Set<number>();
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private starTexts: Phaser.GameObjects.Text[] = [];

  /** 존재하는 캐릭터 이미지만 로드 (누락 파일 요청 없음) */
  preload() {
    this.load.image('battle-map', battleMapUrl); // 실패 시 drawStatic에서 기존 방식으로 대체 그림
  }

  /** 캐릭터 이미지는 시작 시 일괄 로딩하지 않고, 전투 칸에 처음 등장할 때 해당 멤버·등급만 1회 로딩 */
  private artRequested = new Set<string>();
  /** 몬스터 이미지: 종류별 1회만 로딩 (같은 텍스처를 모든 개체가 공유) */
  private ensureMonsterArt(monsterId: string) {
    const key = monsterArtKey(monsterId);
    if (this.monArtRequested.has(key) || this.textures.exists(key)) return;
    this.monArtRequested.add(key);
    const url = monsterArtUrl(monsterId);
    if (!url) return; // 이미지 없음 → 기존 도형
    this.load.image(key, url);
    if (!this.load.isLoading()) this.load.start();
  }

  /** 현재·다음 웨이브의 몬스터 종류를 미리 로딩 (등장 순간 도형으로 보이는 시간 최소화) */
  private prefetchWaveArt() {
    const w = this.battle.waveIndex;
    if (w === this.prefetchedWave) return;
    this.prefetchedWave = w;
    for (const i of [w, w + 1]) {
      const wd = WAVES[i];
      if (!wd) continue;
      // 랜덤 웨이브(31~50)는 구성을 시작 시 정하므로 후보 전체를 미리 불러옴
      const ids = wd.random ? [...RANDOM_MONSTERS, ...(wd.bossPool ? BOSS_POOL : wd.boss ? [wd.boss] : [])] : waveSpawnList(wd);
      for (const id of new Set(ids)) this.ensureMonsterArt(id);
    }
  }

  private ensureSkillArt(memberId: string) {
    const key = skillFxKey(memberId);
    if (this.skillArtRequested.has(key) || this.textures.exists(key)) return;
    this.skillArtRequested.add(key);
    const url = skillFxUrl(memberId);
    if (!url) return; // 이미지 없음 → 기존 이펙트만
    this.load.image(key, url);
    if (!this.load.isLoading()) this.load.start();
  }

  /** 스킬 이미지 1개 배치: 판정과 같은 좌표·크기 (바닥형은 몬스터·캐릭터 아래, 나머지는 위) */
  private spawnSkillArt(fx: Extract<FxEvent, { kind: 'skillArt' }>) {
    const spec = SKILL_FX[fx.memberId];
    const key = skillFxKey(fx.memberId);
    if (!spec || !this.textures.exists(key) || this.skillSprites.length >= MAX_SKILL_SPRITES) return;
    // 바닥 원: 같은 멤버의 큰 원이 이미 겹쳐 떠 있으면 새 큰 원 대신 작은 시전 표시 (판정 범위는 무관)
    let size = fx.size ?? 0;
    let marker = false;
    if (spec.mode === 'ground') {
      const overlap = this.skillSprites.some((e) => !e.marker && e.memberId === fx.memberId && e.spec.mode === 'ground' && Math.hypot(e.x - fx.x, e.y - fx.y) < (e.size + size) / 2);
      if (overlap) { size = GROUND_MARKER_SIZE; marker = true; }
    }
    const s = this.skillPool.pop() ?? this.add.image(0, 0, key);
    s.setTexture(key).setVisible(true).setAlpha(0).setAngle(0).clearTint().setCrop();
    let scale: number;
    if (spec.mode === 'line') {
      // 굵기 고정: 그림 a→b 전체를 len0 px로. 끝점 b를 실제 끝 좌표에 두고, 짧으면 앞부분을 잘라냄
      const [ax, ay] = spec.a, [bx, by] = spec.b;
      const len = Math.hypot(bx - ax, by - ay), dist = Math.hypot(fx.x2! - fx.x, fx.y2! - fx.y) || 1;
      scale = spec.len0 / len;
      s.setOrigin(bx / 512, by / 512).setPosition(fx.x2!, fx.y2!)
        .setRotation(Math.atan2(fx.y2! - fx.y, fx.x2! - fx.x) - Math.atan2(by - ay, bx - ax)).setDepth(1.55);
      if (dist < spec.len0) { const cx = bx - (dist / spec.len0) * (bx - ax); s.setCrop(cx, 0, 512 - cx, 512); }
    } else {
      scale = size / spec.width;
      s.setOrigin(0.5, spec.mode === 'impact' ? spec.originY : 0.5).setPosition(fx.x, fx.y)
        .setDepth(spec.mode === 'ground' && !marker ? 0.45 : 1.55);
    }
    s.setScale(scale);
    this.skillSprites.push({ s, t: 0, dur: skillFxDuration(spec), spec, scale, memberId: fx.memberId, x: fx.x, y: fx.y, size, marker });
  }

  /** 표시 연출 진행: 짧게 나타났다가 사라짐 (점 효과는 살짝 커짐). 끝나면 풀로 반환 */
  private updateSkillArt(dt: number) {
    for (const e of this.skillSprites) {
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      const alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      e.s.setAlpha(alpha * (e.spec.mode === 'ground' && !e.marker ? 0.6 : 0.95)); // 큰 바닥 원은 옅게 (겹쳐도 과하게 밝아지지 않도록)
      if (e.spec.mode !== 'line') e.s.setScale(e.scale * (0.88 + 0.14 * k));
    }
    const done = this.skillSprites.filter((e) => e.t >= e.dur);
    if (done.length) {
      for (const e of done) { e.s.setVisible(false); this.skillPool.push(e.s); }
      this.skillSprites = this.skillSprites.filter((e) => e.t < e.dur);
    }
  }

  private clearMonsterSprites() {
    for (const s of [...this.monSprites.values(), ...this.monPool, ...this.skillSprites.map((e) => e.s), ...this.skillPool]) { this.tweens.killTweensOf(s); s.destroy(); }
    this.skillSprites = [];
    this.skillPool = [];
    for (const t of this.castTexts) { this.tweens.killTweensOf(t); t.destroy(); }
    this.castTexts.clear();
    this.monSprites.clear();
    this.monPool = [];
    this.monFx.clear();
    this.prefetchedWave = -2;
  }

  private ensureArt(key: string) {
    if (this.artRequested.has(key) || this.textures.exists(key)) return;
    this.artRequested.add(key); // 실패해도 재요청하지 않음 → 임시 캐릭터 유지
    const url = artUrl(key);
    if (!url) return;
    this.load.image(key, url);
    if (!this.load.isLoading()) this.load.start();
  }

  constructor() {
    super('battle');
  }

  create() {
    this.drawStatic();
    this.createCells();
    this.g = this.add.graphics();
    this.ov = this.add.graphics().setDepth(3);
    this.infoG = this.add.graphics().setDepth(1.9);
    this.top = this.add.graphics().setDepth(1.6); // 깊이: 맵·칸·g(0) < 몬스터(0.5~0.55) < 캐릭터(1) < 체력바·투사체(1.6) < 별·이름(2) < 표식(3)
    this.resetBattle();
    gameControls.current = {
      setSpeed: (s) => { this.speed = s; this.publish(); },
      togglePause: () => { if (!this.battle.isOver) this.paused = !this.paused; this.publish(); },
      restart: () => { this.resetBattle(this.battle.difficulty); this.waiting = true; this.publish(); }, // 난이도 다시 선택
      start: (d) => { if (!this.waiting) return; this.resetBattle(d); this.waiting = false; this.publish(); },
      buyUpgrade: (id) => {
        if (!this.idle()) return;
        const r = buyUpgrade(this.battle, id);
        if (!r.ok) return this.notify(r.reason === 'gold' ? `골드가 부족합니다 (${UPGRADES[id].costs[this.battle.upgrades[id]]}G 필요)` : FAIL_TEXT[r.reason], 'error');
        this.notify(`전역 강화: ${UPGRADES[id].name} Lv${r.value} (+${Math.round(upgradeBonus(id, r.value) * 100)}%)`, 'good');
      },
      clickSlot: (area, index) => this.clickSlot(area, index),
      summon: (focusId) => { if (this.idle()) this.doSummon(focusId); },
      mergeSelected: () => {
        if (this.selectedId !== null && this.idle() && !this.multiSell) this.applyMerge(mergeWith(this.battle, this.selectedId));
      },
      mergeAll: () => {
        if (!this.idle()) return;
        if (this.multiSell) return this.notify('다중 판매 모드에서는 수동 합성을 할 수 없습니다 (모드를 끄고 사용)', 'error');
        if (!this.runMergeAll().length) this.notify('합성 가능한 유닛이 없습니다', 'error');
      },
      toggleAutoMerge: () => {
        if (!this.idle()) return;
        this.autoMerge = !this.autoMerge;
        if (this.autoMerge) this.runMergeAll();
        this.publish();
      },
      toggleLock: () => {
        if (this.selectedId === null || !this.idle() || this.multiSell) return;
        const r = toggleLock(this.battle, this.selectedId);
        if (r.ok) this.notify(r.value ? '잠금: 합성·판매에서 제외됩니다' : '잠금 해제', 'info');
        else this.notify(FAIL_TEXT[r.reason], 'error');
      },
      toggleMoveMode: () => {
        if (this.selectedId === null || this.battle.isOver || !this.idle() || this.multiSell) return;
        this.moveMode = !this.moveMode;
        this.publish();
      },
      sell: (id) => {
        if (!this.idle()) return; // 드래그 중 실수 판매 방지
        const u = this.battle.units.find((x) => x.id === id);
        const r = sell(this.battle, id);
        if (!r.ok) return this.notify(FAIL_TEXT[r.reason], 'error');
        if (this.selectedId === id) { this.selectedId = null; this.moveMode = false; }
        this.notify(`판매: ${memberById(u!.memberId).name} ${stars(u!.star)}  +${r.value}G`, 'good');
      },
      toggleMultiSell: () => {
        if (!this.idle() || this.battle.isOver) return;
        this.multiSell = !this.multiSell;
        this.picked.clear();
        this.selectedId = null;
        this.moveMode = false;
        this.press = null;
        if (this.multiSell) this.notify('다중 판매: 판매할 유닛을 클릭해 선택하세요 (잠금 유닛 제외)', 'info');
        else this.publish();
      },
      clearMultiSell: () => { this.picked.clear(); this.publish(); },
      sellMany: (ids) => {
        if (!this.idle() || !this.multiSell) return;
        const r = sellMany(this.battle, ids); // 실행 직전 재검증: 사라졌거나 잠긴 유닛은 건너뜀
        this.picked.clear();
        if (!r.sold) return this.notify('판매할 수 있는 유닛이 없습니다 (상태가 바뀌었거나 잠금됨)', 'error');
        this.notify(`일괄 판매: ${r.sold}개  +${r.gold.toLocaleString()}G${r.skipped ? ` (상태가 바뀐 ${r.skipped}개 제외)` : ''}`, 'good');
      },
      beginDrag: (id) => this.beginDrag(id),
      endDrag: (target) => this.endDrag(target),
    };
    // 전투 칸에서 누른 채 8px 이상 움직이면 드래그 시작 (클릭 선택·이동 모드는 그대로)
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.press && p.isDown && Phaser.Math.Distance.Between(p.x, p.y, this.press.x, this.press.y) > 8) {
        this.beginDrag(this.press.id);
        this.press = null;
      }
    });
    this.input.on('pointerup', () => { this.press = null; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { gameControls.current = null; });
    if (import.meta.env.DEV) (window as unknown as { __scene?: BattleScene }).__scene = this; // 개발 서버 테스트용 (배포 빌드에서 제거)
  }

  private resetBattle(difficulty: DifficultyId = 'normal') {
    this.battle = new Battle(difficulty);
    this.battle.onHit = (x, y, killed, id) => {
      this.fx.push({ x, y, t: 0, kind: killed ? 'kill' : 'hit' });
      const f = this.monFx.get(id);
      if (f && !killed) f.hitUntil = this.time.now + 90; // 피격 시 짧은 붉은 기
    };
    this.clearMonsterSprites();
    this.battle.onFx = (fx) => this.onBattleFx(fx);
    this.battle.onSynergy = (def, on) => { if (on) this.notify(`시너지 활성화: ${def.name}`, 'good'); };
    this.fx = [];
    this.bfx = [];
    this.selectedId = null;
    this.paused = false;
    this.speed = DEFAULT_SPEED;
    this.autoMerge = false;
    this.moveMode = false;
    this.multiSell = false;
    this.picked.clear();
    this.message = null;
    this.dragId = null;
    this.press = null;
    this.recorded = false;
    this.result = null;
    this.recordFailed = false;
    this.realMs = 0;
    this.publish();
  }

  private hasMap = false;

  private drawStatic() {
    if (this.textures.exists('battle-map')) {
      this.hasMap = true;
      // 원본 1499×1049 → 1000×699.8 (가로·세로 같은 배율, 늘림·잘림 없음). 가장 먼저 추가해 모든 표시 요소 아래에 위치
      this.add.image(0, 0, 'battle-map').setOrigin(0).setDisplaySize(MAP_W, MAP_IMAGE.height * MAP_SCALE);
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(C.bg).fillRect(0, 0, MAP_W, MAP_H);
    // 대체: 경로 중심선을 따라 길을 그림 (layout.ts와 동일 좌표)
    const pts = Array.from({ length: 241 }, (_, i) => pathPoint((i * PATH_LENGTH) / 240));
    g.lineStyle(48, C.pathEdge).strokePoints(pts, true);
    g.lineStyle(44, C.path).strokePoints(pts, true);
  }

  private createCells() {
    const style = { fontFamily: 'Malgun Gothic, sans-serif', fontStyle: 'bold', fontSize: '13px' };
    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.cols; col++) {
        const { x, y } = cellCenter(col, row);
        // 판정 영역 = 맵 이미지의 칸 (layout.ts GRID). 맵이 있으면 칸 그림은 이미지가 담당하고 마우스 오버만 밝게 표시
        const cell = this.add.rectangle(x, y, GRID.cellW, GRID.cellH, C.cell, this.hasMap ? 0 : 1).setInteractive({ useHandCursor: true });
        if (!this.hasMap) cell.setStrokeStyle(2, C.cellEdge);
        cell.on('pointerover', () => cell.setFillStyle(this.hasMap ? 0xffffff : C.cellHover, this.hasMap ? 0.12 : 1));
        cell.on('pointerout', () => cell.setFillStyle(C.cell, this.hasMap ? 0 : 1));
        cell.on('pointerdown', (p: Phaser.Input.Pointer) => {
          const wasMove = this.moveMode;
          this.clickSlot('field', row * GRID.cols + col);
          const u = this.battle.unitAtSlot('field', row * GRID.cols + col);
          this.press = u && !wasMove && !this.battle.isOver && !this.multiSell ? { id: u.id, x: p.x, y: p.y } : null;
        });
        // 별·이름: 칸 하단 정보 띠에 한 줄로 [★★★ 이름] (얼굴·머리를 가리지 않도록). 위치는 drawFrame에서 글자 폭에 맞춰 가운데 정렬
        this.starTexts.push(this.add.text(x, y + INFO_Y, '', { ...style, fontSize: '11px', color: '#ffd84a', stroke: '#140a0d', strokeThickness: 3 }).setOrigin(0, 0.5).setDepth(2));
        this.nameTexts.push(this.add.text(x, y + INFO_Y, '', { ...style, fontSize: '12px', color: '#ffffff', stroke: '#140a0d', strokeThickness: 3 }).setOrigin(0, 0.5).setDepth(2));
        this.unitImgs.push(this.add.image(x, y, '__DEFAULT').setVisible(false).setDepth(1));
      }
    }
  }

  /** 전투 칸·보관함 공통 클릭: 이동 모드면 이동/교환, 아니면 선택 */
  private clickSlot(area: Area, index: number) {
    if (this.multiSell) {
      const u = this.battle.unitAtSlot(area, index);
      if (!u || this.battle.isOver || this.waiting) return;
      if (u.locked) return this.notify('잠금된 유닛은 일괄 판매에서 제외됩니다', 'error');
      if (this.picked.has(u.id)) this.picked.delete(u.id);
      else this.picked.add(u.id);
      return this.publish();
    }
    const sel = this.selectedUnit();
    if (this.moveMode && sel) {
      this.moveMode = false;
      const r = moveUnit(this.battle, sel.id, area, index);
      if (!r.ok) this.notify(FAIL_TEXT[r.reason], 'error');
    } else {
      this.moveMode = false;
      this.selectedId = this.battle.unitAtSlot(area, index)?.id ?? null;
    }
    this.publish();
  }

  private idle() {
    return this.dragId === null && !this.waiting;
  }

  private beginDrag(id: number) {
    if (this.battle.isOver || this.waiting || this.multiSell || !this.battle.units.some((u) => u.id === id)) return;
    this.dragId = id;
    this.selectedId = id; // 드래그 시작 시 유닛 정보 표시
    this.moveMode = false;
    this.publish();
  }

  private endDrag(target: { area: Area; index: number } | null) {
    const id = this.dragId;
    this.dragId = null;
    if (id !== null && target) {
      const r = moveUnit(this.battle, id, target.area, target.index); // 교환 포함, ID·등급·잠금 유지
      if (!r.ok) this.notify(FAIL_TEXT[r.reason], 'error');
    } // 잘못된 위치: 아무것도 바꾸지 않음 = 원위치
    this.publish();
  }

  private selectedUnit() {
    return this.battle.units.find((u) => u.id === this.selectedId) ?? null;
  }

  private doSummon(focusId?: string) {
    const r = summon(this.battle, focusId);
    if (!r.ok) return this.notify(FAIL_TEXT[r.reason], 'error');
    const u = r.value;
    this.notify(`소환: ${memberById(u.memberId).name} ★ → ${u.area === 'field' ? '전투 칸' : '보관함'}`, 'info');
    if (this.autoMerge) this.runMergeAll();
  }

  private applyMerge(r: ActionResult<Unit>) {
    if (!r.ok) return this.notify(FAIL_TEXT[r.reason], 'error');
    this.afterMerge([r.value]);
  }

  private runMergeAll() {
    const res = mergeAll(this.battle);
    if (res.length) this.afterMerge(res);
    return res;
  }

  private afterMerge(results: Unit[]) {
    for (const u of results) if (u.area === 'field') this.fx.push({ x: u.x, y: u.y, t: 0, kind: 'merge' });
    if (this.selectedId !== null && !this.selectedUnit()) this.selectedId = results[0].id;
    this.moveMode = false;
    const list = results.map((u) => `${memberById(u.memberId).name} ${stars(u.star)}`).join(', ');
    this.notify(`합성 완료: ${list}`, 'good');
  }

  private onBattleFx(fx: FxEvent) {
    if (fx.kind === 'skillArt') return this.spawnSkillArt(fx);
    this.bfx.push({ fx, t: 0 });
    if (fx.kind === 'cast') {
      const txt = this.add.text(fx.x, fx.y - 52, fx.text, {
        fontFamily: 'Malgun Gothic, sans-serif', fontStyle: 'bold', fontSize: '15px', color: hex(fx.color), stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(5);
      this.castTexts.add(txt);
      this.tweens.add({ targets: txt, y: fx.y - 80, alpha: 0, duration: 900, onComplete: () => { this.castTexts.delete(txt); txt.destroy(); } });
    }
  }

  private notify(text: string, kind: HudMessage['kind']) {
    this.message = { id: ++this.msgSeq, text, kind };
    this.publish();
  }

  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.1);
    const running = !this.paused && !this.waiting;
    if (running) { // 배속 적용: 전투 계산은 최대 0.1초 단위로 나눠 진행 (3배속에서도 1배속과 같은 판정 간격)
      const total = dt * this.speed, n = Math.ceil(total / 0.1);
      for (let i = 0; i < n && !this.battle.isOver; i++) this.battle.step(total / n);
    }
    // 표시 연출은 일시정지 중에도 실제 시간으로 마저 끝냄 (보스 등장 고리 등이 멈춘 채 남지 않도록)
    const fxDt = running ? dt * this.speed : dt;
    for (const f of this.fx) f.t += fxDt;
    this.fx = this.fx.filter((f) => f.t < FX_DUR[f.kind]);
    for (const f of this.bfx) f.t += fxDt;
    this.bfx = this.bfx.filter((f) => f.t < BFX_DUR[f.fx.kind]);
    this.updateSkillArt(fxDt);
    if (!this.paused && !this.waiting && !this.battle.isOver) this.realMs += Math.min(delta, 250); // 휴면 후 첫 프레임의 긴 간격 제외
    if (this.battle.isOver && !this.recorded) this.recordResult();
    this.drawFrame();
    this.hudElapsed += delta;
    if (this.hudElapsed >= 100) {
      this.hudElapsed = 0;
      this.publish();
    }
  }

  /** 승패 확정 시 1회: 결과 생성 → localStorage 저장 (실패해도 게임 계속) */
  private recordResult() {
    this.recorded = true;
    this.result = buildRecord(this.battle, Math.round(this.realMs / 1000));
    this.recordFailed = !saveRecord(this.result);
    if (this.recordFailed) this.notify('기록 저장 실패: 브라우저 저장소를 사용할 수 없습니다 (게임은 정상 진행)', 'error');
    this.publish();
  }

  private drawFrame() {
    const g = this.g.clear();
    const ov = this.ov.clear();
    const top = this.top.clear();
    const b = this.battle;
    const sel = this.selectedUnit();
    if (sel?.area === 'field') {
      const range = b.statsOf(sel).range;
      // 밝은 맵 위에서도 보이도록 채움·테두리 강화
      g.fillStyle(0xfff3c4, 0.12).fillCircle(sel.x, sel.y, range);
      g.lineStyle(2.5, 0xffd84a, 0.9).strokeCircle(sel.x, sel.y, range);
      const sk = skillOf(sel);
      if (sk.kind === 'aura') g.lineStyle(2, 0x2ecc71, 0.8).strokeCircle(sel.x, sel.y, sk.radius); // 지원 범위
    }
    const pulse = 0.55 + 0.45 * Math.sin(this.time.now / 180);
    let auraFilled = false;
    for (const u of b.units) {
      if (u.area !== 'field' || u.activeRemain <= 0) continue;
      const sk = skillOf(u);
      if (sk.kind === 'aura') { // 응원가 지속 범위: 채움은 1개만, 나머지는 테두리만 (여러 꾸티뉴가 겹쳐도 화면을 덮지 않도록)
        if (!auraFilled) { g.fillStyle(0x2ecc71, 0.06).fillCircle(u.x, u.y, sk.radius); auraFilled = true; }
        g.lineStyle(2.5, 0x2ecc71, 0.35 + 0.35 * pulse).strokeCircle(u.x, u.y, sk.radius);
      }
    }
    if (this.moveMode || this.dragId !== null) {
      const ap = this.input.activePointer;
      const hover = this.dragId !== null ? cellAt(ap.x, ap.y) : -1;
      for (let i = 0; i < FIELD_SLOTS; i++) {
        const { x, y } = cellCenter(i % GRID.cols, Math.floor(i / GRID.cols));
        const hot = i === hover;
        g.lineStyle(hot ? 4 : 2, hot ? 0xffffff : 0x6fd3ff, hot ? 0.95 : 0.6).strokeRect(x - GRID.cellW / 2 + 4, y - GRID.cellH / 2 + 4, GRID.cellW - 8, GRID.cellH - 8);
      }
    }
    const byIndex: (Unit | undefined)[] = [];
    for (const u of b.units) {
      if (u.area !== 'field') continue;
      byIndex[u.index] = u;
      if (this.mergeable.has(u.id)) g.lineStyle(4, 0x7dff8a, pulse).strokeCircle(u.x, u.y, 35);
      g.fillStyle(0x140a0d, 0.22).fillRoundedRect(u.x - GRID.cellW / 2 + 5, u.y - GRID.cellH / 2 + 5, GRID.cellW - 10, GRID.cellH - 10, 8); // 밝은 캐릭터·밝은 칸 대비
      g.fillStyle(0x000000, 0.3).fillEllipse(u.x, u.y + 30, 54, 14); // 발밑 그림자
      this.ensureArt(artKey(u.memberId, u.star));
      this.ensureSkillArt(u.memberId); // 전투 칸에 나온 멤버의 스킬 이미지만 미리 로딩
      if (!this.textures.exists(artKey(u.memberId, u.star))) { // 이미지 없음·로딩 중 → 임시 캐릭터
        g.fillStyle(memberById(u.memberId).color).fillCircle(u.x, u.y, 28);
        g.lineStyle(3, C.gold).strokeCircle(u.x, u.y, 28);
        g.fillStyle(0xffffff, 0.85).fillTriangle(u.x - 10, u.y + 8, u.x + 10, u.y + 8, u.x, u.y - 12);
      }
      if (u.buffs.length) g.lineStyle(2, 0x6fffe0, pulse).strokeCircle(u.x, u.y, 31); // 공격속도 강화 중
      const cw = GRID.cellW, ch = GRID.cellH, left = u.x - cw / 2, top = u.y - ch / 2;
      if (this.mergeable.has(u.id)) { // 합성 가능: 좌하단(하단 정보 띠 바로 위) 초록 ▲ 배지
        const by = top + ch - 33;
        ov.fillStyle(0x0b2a12, 0.9).fillCircle(left + 13, by, 10);
        ov.fillStyle(0x7dff8a).fillTriangle(left + 13, by - 7, left + 7, by + 4, left + 19, by + 4);
      }
      if (u.locked) { // 잠금: 금색 점선 테두리 + 우상단 자물쇠
        const sides: [number, number, number, number, number][] = [
          [left + 4, top + 4, 1, 0, cw - 8], [left + cw - 4, top + 4, 0, 1, ch - 8], [left + cw - 4, top + ch - 4, -1, 0, cw - 8], [left + 4, top + ch - 4, 0, -1, ch - 8],
        ];
        for (const [x0, y0, dx, dy, len] of sides) {
          for (let d = 0; d < len; d += 12) ov.lineStyle(2, C.gold, 0.9).lineBetween(x0 + dx * d, y0 + dy * d, x0 + dx * Math.min(len, d + 6), y0 + dy * Math.min(len, d + 6));
        }
        ov.fillStyle(0x140a0d, 0.9).fillCircle(left + cw - 13, top + 13, 10);
        ov.fillStyle(C.gold).fillRect(left + cw - 19, top + 12, 12, 9);
        ov.lineStyle(2.5, C.gold).strokeCircle(left + cw - 13, top + 10, 4);
      }
      if (!pathWithinRange(u.x, u.y, b.statsOf(u).range)) { // 사거리 부족: 좌상단 주황 경고 (기본 공격 사거리 기준)
        ov.fillStyle(0x140a0d, 0.9).fillCircle(left + 13, top + 13, 10);
        ov.fillStyle(0xff9a3c).fillTriangle(left + 13, top + 5, left + 5, top + 19, left + 21, top + 19);
        ov.fillStyle(0x140a0d).fillRect(left + 12, top + 9, 2, 6).fillRect(left + 12, top + 16, 2, 2);
      }
      if (this.picked.has(u.id)) { // 다중 판매 선택: 붉은 굵은 테두리 + 우상단 체크 (잠금 유닛은 선택 불가라 자물쇠와 겹치지 않음)
        ov.lineStyle(4, 0xff4d5e, 0.95).strokeRect(left + 3, top + 3, cw - 6, ch - 6);
        ov.fillStyle(0xff4d5e, 0.12).fillRect(left + 3, top + 3, cw - 6, ch - 6);
        ov.fillStyle(0xc8102e).fillCircle(left + cw - 14, top + 14, 10);
        ov.lineStyle(3, 0xffffff).lineBetween(left + cw - 19, top + 14, left + cw - 15, top + 18).lineBetween(left + cw - 15, top + 18, left + cw - 8, top + 9);
      }
      if (u.id === this.selectedId) { // 선택: 흰 테두리 + 금색 안쪽 테두리
        g.lineStyle(3, 0xffffff).strokeRect(left + 2, top + 2, cw - 4, ch - 4);
        g.lineStyle(1.5, 0xffd84a).strokeRect(left + 5, top + 5, cw - 10, ch - 10);
      }
    }
    const info = this.infoG.clear();
    for (let i = 0; i < FIELD_SLOTS; i++) {
      const u = byIndex[i];
      const st = this.starTexts[i].setText(u ? stars(u.star) : '');
      const nt = this.nameTexts[i].setText(u ? memberById(u.memberId).name : '');
      if (u) { // 하단 정보 띠: [별 이름]을 칸 가운데 정렬, 칸 폭 안으로 제한 (5성 + 5글자 이름도 한 줄)
        const { x: cx, y: cy } = cellCenter(i % GRID.cols, Math.floor(i / GRID.cols));
        const raw = st.width + 2 + nt.width;
        const k = Math.min(1, (GRID.cellW - 16) / raw); // 칸 폭을 넘는 경우(5성 + 긴 이름)만 글자 축소
        st.setScale(k); nt.setScale(k);
        const w = raw * k;
        const x0 = cx - w / 2;
        st.setPosition(x0, cy + INFO_Y);
        nt.setPosition(x0 + (st.width + 2) * k, cy + INFO_Y);
        const bw = w + 8;
        info.fillStyle(0x140a0d, 0.72).fillRoundedRect(cx - bw / 2, cy + INFO_Y - 8, bw, 16, 6);
      }
      // 캐릭터 이미지: 멤버+등급 텍스처가 있으면 비율 유지해 칸 안(60px)에 맞춤, 합성으로 등급이 바뀌면 자동 교체
      const img = this.unitImgs[i];
      const key = u ? artKey(u.memberId, u.star) : '';
      if (u && this.textures.exists(key)) {
        if (img.texture.key !== key) img.setTexture(key);
        // 전투용 이미지는 인물 여백을 정리한 256 정사각(비율 유지) → 84px 표시 (행 간격 약 91px, 열 간격 약 129px라 이웃 칸과 겹치지 않음)
        const src = img.texture.getSourceImage() as { width: number; height: number };
        img.setScale(Math.min(84 / src.width, 84 / src.height)).setVisible(true);
      } else img.setVisible(false);
    }
    const blink = Math.floor(this.time.now / 200) % 2 === 0;
    this.prefetchWaveArt();
    const alive = new Set<number>();
    for (const m of b.monsters) { alive.add(m.id); this.drawMonster(g, top, m, pulse, blink); }
    this.releaseDeadMonsters(alive);
    for (const h of b.helpers) {
      top.fillStyle(h.color).fillTriangle(h.x, h.y - 13, h.x + 11, h.y, h.x - 11, h.y);
      top.fillTriangle(h.x, h.y + 13, h.x + 11, h.y, h.x - 11, h.y);
      top.lineStyle(2, 0xffffff, 0.8).strokeCircle(h.x, h.y, 16);
    }
    for (const p of b.projectiles) {
      top.fillStyle(p.color, 0.35).fillCircle(p.x, p.y, 8);
      top.fillStyle(p.color).fillCircle(p.x, p.y, 4.5);
    }
    for (const { fx, t } of this.bfx) {
      const k = t / BFX_DUR[fx.kind];
      if (fx.kind === 'beam') {
        top.lineStyle(fx.width, fx.color, 1 - k);
        for (let i = 1; i < fx.points.length; i++) top.lineBetween(fx.points[i - 1].x, fx.points[i - 1].y, fx.points[i].x, fx.points[i].y);
      } else if (fx.kind === 'burst') {
        top.fillStyle(fx.color, 0.25 * (1 - k)).fillCircle(fx.x, fx.y, fx.radius);
        top.lineStyle(3, fx.color, 1 - k).strokeCircle(fx.x, fx.y, fx.radius * (0.6 + 0.4 * k));
      } else if (fx.kind === 'miss') {
        top.lineStyle(2, 0xffffff, 1 - k).strokeCircle(fx.x, fx.y - 10 - k * 14, 6 + k * 6);
        top.lineBetween(fx.x - 6, fx.y - 24 - k * 14, fx.x + 6, fx.y - 12 - k * 14);
      } else if (fx.kind === 'cast') {
        top.lineStyle(4, fx.color, 1 - k).strokeCircle(fx.x, fx.y, 30 + k * 26);
      }
    }
    for (const f of this.fx) {
      const k = f.t / FX_DUR[f.kind];
      if (f.kind === 'merge') {
        top.lineStyle(5, 0xffe27a, 1 - k).strokeCircle(f.x, f.y, 30 + k * 40);
        top.fillStyle(0xffe27a, 0.35 * (1 - k)).fillCircle(f.x, f.y, 30 + k * 20);
      } else {
        const killed = f.kind === 'kill';
        top.lineStyle(2, killed ? C.crimson : C.gold, 1 - k).strokeCircle(f.x, f.y, (killed ? 14 : 8) + k * 16);
      }
    }
  }

  /** 몬스터 1마리 표시: 아래 효과(g) → 그림(스프라이트) → 상태 링·체력바(top). 실제 좌표 m.x/m.y는 Battle 값 그대로 */
  private drawMonster(g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics, m: Monster, pulse: number, blink: boolean) {
    const d = m.def;
    const r = d.radius;
    const { x, y } = m;
    const now = this.time.now;
    this.ensureMonsterArt(d.id);
    const key = monsterArtKey(d.id);
    const hasArt = this.textures.exists(key);
    const vis = hasArt ? monsterVisualSize(d) : r * 2; // 화면상 그림 크기 (충돌 반경과 별개)
    const half = vis / 2;
    for (const a of d.abilities ?? []) if (a.kind === 'guard') g.lineStyle(1, 0x4f7cc4, 0.3).strokeCircle(x, y, a.radius);
    if (isEnraged(m)) g.fillStyle(0xff2020, 0.15 + 0.3 * pulse).fillCircle(x, y, half * 0.85 + 8);
    if (hasArt) {
      g.fillStyle(0x000000, 0.22).fillEllipse(x, y + half * 0.72, vis * 0.7, vis * 0.2); // 바닥 그림자
      let s = this.monSprites.get(m.id);
      if (!s) {
        s = this.monPool.pop() ?? this.add.image(0, 0, key);
        s.setTexture(key).setVisible(true).setAlpha(1).clearTint().setDepth(d.boss ? 0.55 : 0.5);
        this.monSprites.set(m.id, s);
        this.monFx.set(m.id, { born: now, hitUntil: 0, boss: !!d.boss });
        if (d.boss) this.fx.push({ x, y, t: 0, kind: 'merge' }); // 보스 등장: 금빛 고리
      }
      const fx = this.monFx.get(m.id)!;
      const base = vis / MONSTER_ART_CONTENT[MONSTER_ART_FILE[d.id]]; // 투명 여백 제외한 그림 기준 배율
      const appear = Math.min(1, (now - fx.born) / (fx.boss ? 450 : 220)); // 등장: 짧게 커지며 나타남
      const grow = fx.boss ? 1.25 - 0.25 * appear : 0.7 + 0.3 * appear;
      const bob = Math.sin(now / (fx.boss ? 420 : 240) + m.id) * (fx.boss ? 1.2 : 1.6); // 표시 전용 상하 움직임
      s.setPosition(x, y + bob).setScale(base * grow).setAlpha(appear * (d.evasion ? 0.8 : 1));
      if (now < fx.hitUntil) s.setTint(0xff9a9a); else s.clearTint();
    } else {
      // 이미지 없음·로딩 중: 기존 도형
      const outline = m.slows.length ? 0x7fd6ff : d.boss ? 0xffd700 : 0x1a1a1a;
      g.fillStyle(d.color, d.evasion ? 0.55 : 1);
      g.lineStyle(d.boss ? 3 : 2, outline);
      if (d.shape === 'circle') {
        g.fillCircle(x, y, r).strokeCircle(x, y, r);
      } else {
        const pts = poly(x, y, d.shape === 'square' ? r * 1.25 : r * 1.15, SHAPE_SIDES[d.shape], d.shape === 'square' ? -Math.PI / 4 : -Math.PI / 2);
        g.fillPoints(pts, true).strokePoints(pts, true);
      }
      if (d.abilities?.some((a) => a.kind === 'heal')) g.fillStyle(0xffffff, 0.9).fillRect(x - 2, y - 6, 4, 12).fillRect(x - 6, y - 2, 12, 4);
      if (d.split) g.fillStyle(0xffffff, 0.7).fillCircle(x - 4, y, 2.5).fillCircle(x + 4, y, 2.5);
    }
    // 상태 링 (그림 위)
    if (hasArt && m.slows.length) top.lineStyle(2, 0x7fd6ff, 0.85).strokeEllipse(x, y + half * 0.72, vis * 0.8, vis * 0.26);
    if (m.armorRemain > 0 || m.lastStandRemain > 0) top.lineStyle(3, 0xd4af37, 0.9).strokeCircle(x, y, half * 0.8 + 5);
    if (m.shieldHp > 0) top.lineStyle(4, 0x6fd3ff, 0.8).strokeCircle(x, y, half * 0.8 + 9);
    // 체력바: 그림 위쪽, 보스는 크고 금색 테두리
    const w = d.boss ? Math.max(64, vis * 0.9) : Math.max(r * 2, vis * 0.75);
    const h = d.boss ? 7 : 4;
    const by = y - half - (d.boss ? 9 : 5);
    top.fillStyle(C.hpBg).fillRect(x - w / 2, by, w, h);
    top.fillStyle(d.boss ? 0xff3b3b : C.hp).fillRect(x - w / 2, by, (w * Math.max(0, m.hp)) / m.maxHp, h);
    if (d.boss) {
      top.lineStyle(1.5, 0xffd700).strokeRect(x - w / 2, by, w, h);
      if (bossWarning(m) && blink) {
        top.fillStyle(0xff2020).fillTriangle(x, by - 22, x - 10, by - 4, x + 10, by - 4);
        top.fillStyle(0xffffff).fillRect(x - 1.5, by - 17, 3, 7).fillRect(x - 1.5, by - 8, 3, 3);
      }
    }
  }

  /** 사라진 몬스터: 짧은 축소·페이드 후 풀로 반환 (트윈은 해당 스프라이트에만 1개) */
  private releaseDeadMonsters(alive: Set<number>) {
    for (const [id, s] of this.monSprites) {
      if (alive.has(id)) continue;
      this.monSprites.delete(id);
      this.monFx.delete(id);
      s.clearTint();
      this.tweens.add({
        targets: s, alpha: 0, scale: s.scale * 0.55, duration: 220, ease: 'Quad.easeIn',
        onComplete: () => { s.setVisible(false); this.monPool.push(s); },
      });
    }
  }

  private bossViews(): BossView[] {
    return this.battle.monsters
      .filter((m) => m.def.boss && m.hp > 0)
      .slice(0, 2)
      .map((m) => ({
        id: m.id,
        name: m.def.name,
        color: hex(m.def.color),
        hpPct: Math.max(0, Math.round((m.hp / m.maxHp) * 1000) / 10),
        phase: phaseOf(m),
        maxPhase: (m.def.phases?.length ?? 0) + 1,
        warning: bossWarning(m),
        armor: m.armorRemain > 0 || m.lastStandRemain > 0,
        shield: m.shieldHp > 0,
        enraged: isEnraged(m),
      }));
  }

  private view(u: Unit): UnitView {
    const m = memberById(u.memberId);
    return {
      id: u.id, memberId: u.memberId, name: m.name, color: hex(m.color), star: u.star,
      area: u.area, index: u.index, locked: u.locked, mergeable: this.mergeable.has(u.id), picked: this.picked.has(u.id),
    };
  }

  private selectedInfo(u: Unit) {
    const m = memberById(u.memberId);
    const sk = m.skill;
    const stats = this.battle.statsOf(u);
    const parts: string[] = [];
    if (sk.scaling !== 'duration') parts.push(`스킬 피해 +${Math.round(skillDamageBonus(u.star) * 100)}%`);
    if (sk.scaling !== 'damage') parts.push(`지속시간 +${Math.round(skillDurationBonus(u.star) * 100)}%`);
    const bestBuff = new Map<string, (typeof u.buffs)[number]>();
    for (const e of u.buffs) if ((bestBuff.get(e.source)?.amount ?? -1) < e.amount || (bestBuff.get(e.source)!.amount === e.amount && bestBuff.get(e.source)!.remain < e.remain)) bestBuff.set(e.source, e);
    const effects = [...bestBuff.values()].map((e) => `${e.source === 'aura' ? '응원가' : '폭주 연사'} 공속 +${Math.round(e.amount * 100)}% (${e.remain.toFixed(1)}초)`);
    if (bestBuff.size > 1) effects.push(`합계 공속 +${Math.round(this.battle.hasteOf(u) * 100)}% (상한 50%)`);
    if (sk.kind === 'summon' && u.activeRemain > 0) effects.push(`보조 공격체 (${u.activeRemain.toFixed(1)}초)`);
    if (u.lastChaos) effects.push(`최근 혼돈 효과: ${u.lastChaos}`);
    return {
      ...this.view(u),
      damage: stats.damage,
      attackSpeed: Math.round(stats.attackSpeed * 100) / 100,
      range: Math.round(stats.range * 10) / 10,
      /** 현재 전투 칸에서 기본 공격 사거리가 몬스터 경로에 닿는지 (보관함이면 true) */
      rangeReaches: u.area !== 'field' || pathWithinRange(u.x, u.y, stats.range),
      sellPrice: sellPrice(u.star),
      kills: u.kills,
      role: m.role,
      attackDesc: m.attackDesc,
      skillName: sk.name,
      skillDesc: sk.desc,
      skillCooldown: sk.cooldown,
      skillCd: Math.ceil(u.skillCd * 10) / 10,
      starBonus: u.star === 1 ? '기본 스킬 효과' : parts.join(' · '),
      effects,
    };
  }

  private publish() {
    const b = this.battle;
    this.mergeable = mergeableIds(b);
    if (b.isOver && this.multiSell) { this.multiSell = false; this.picked.clear(); } // 게임 종료 시 선택 초기화
    for (const id of this.picked) { // 합성 재료로 사라졌거나 잠긴 유닛은 선택에서 제외
      const pu = b.units.find((x) => x.id === id);
      if (!pu || pu.locked) this.picked.delete(id);
    }
    const u = this.selectedUnit();
    const storage: (UnitView | null)[] = Array(STORAGE_SLOTS).fill(null);
    for (const s of b.units) if (s.area === 'storage') storage[s.index] = this.view(s);
    hudStore.set({
      wave: b.waveNumber,
      totalWaves: WAVES.length,
      bossGate: b.phase === 'prep' && b.gateBossId !== null,
      alive: b.monsters.length,
      maxAlive: MAX_ALIVE,
      phase: b.phase,
      phaseTimer: Math.max(0, Math.ceil(b.timer)),
      finalTimer: b.finalTimer === null ? null : Math.max(0, Math.ceil(b.finalTimer)),
      defeatReason: b.defeatReason,
      bosses: this.bossViews(),
      synergies: synergyViews(b),
      started: !this.waiting,
      difficulty: b.difficulty,
      gameTime: Math.floor(b.time),
      playTime: Math.floor(this.realMs / 1000),
      result: this.result,
      recordFailed: this.recordFailed,
      upgrades: UPGRADE_IDS.map((id) => ({
        id, name: UPGRADES[id].name, level: b.upgrades[id], max: UPGRADE_MAX, bonus: upgradeBonus(id, b.upgrades[id]),
        perLevel: UPGRADES[id].perLevel, nextCost: b.upgrades[id] >= UPGRADE_MAX ? null : UPGRADES[id].costs[b.upgrades[id]],
      })),
      speed: this.speed,
      paused: this.paused,
      kills: b.kills,
      gold: b.gold,
      focusUnlocked: isFocusUnlocked(b),
      autoMerge: this.autoMerge,
      moveMode: this.moveMode,
      multiSell: {
        on: this.multiSell,
        ids: [...this.picked],
        total: [...this.picked].reduce((a, id) => a + sellPrice(b.units.find((x) => x.id === id)!.star), 0),
      },
      dragging: (() => { const d = this.battle.units.find((u) => u.id === this.dragId); return d ? this.view(d) : null; })(),
      anyMergeable: this.mergeable.size > 0,
      storage,
      selected: u ? this.selectedInfo(u) : null,
      message: this.message,
    });
  }
}
