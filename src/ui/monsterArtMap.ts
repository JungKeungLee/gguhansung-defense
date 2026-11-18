/**
 * 몬스터 ID ↔ 이미지 파일 연결 (몬스터 ID는 변경하지 않고 매핑만 둠) — 순수 데이터, Vite 비의존
 * 파일: src/assets/monsters/{regular|bosses}/{파일명}.webp (768×768, 투명 배경, 그림이 프레임 중앙)
 */
import type { MonsterDef } from '../data/monsters';

export const MONSTER_ART_FILE: Record<string, string> = {
  slime: 'regular/slime',
  miniSlime: 'regular/mini-slime',
  goblin: 'regular/swift-goblin',
  golem: 'regular/armored-golem',
  splitter: 'regular/splitting-slime',
  shaman: 'regular/healing-shaman',
  ghost: 'regular/shadow-ghost',
  guard: 'regular/shield-guardian',
  berserker: 'regular/berserk-beast',
  slimeKing: 'bosses/slime-king',
  golemBoss: 'bosses/iron-golem-boss',
  frenzyKnight: 'bosses/berserk-knight',
  darkMage: 'bosses/dark-wizard',
  chaosGuardian: 'bosses/chaos-guardian',
  chaosLord: 'bosses/chaos-lord',
};

/** 768 프레임 안 실제 그림의 긴 변(px) — 투명 여백을 제외하고 표시 크기를 맞추기 위한 측정값 (6-E-1) */
export const MONSTER_ART_CONTENT: Record<string, number> = {
  'regular/slime': 649, 'regular/mini-slime': 647, 'regular/swift-goblin': 652, 'regular/armored-golem': 652,
  'regular/splitting-slime': 653, 'regular/healing-shaman': 649, 'regular/shadow-ghost': 650, 'regular/shield-guardian': 653,
  'regular/berserk-beast': 652, 'bosses/slime-king': 686, 'bosses/iron-golem-boss': 686, 'bosses/berserk-knight': 688,
  'bosses/dark-wizard': 684, 'bosses/chaos-guardian': 685, 'bosses/chaos-lord': 687,
};

export const monsterArtKey = (id: string) => `mon:${id}`;

/**
 * 화면 표시 크기(그림 긴 변, 논리 px). 충돌 반경(radius)은 그대로 두고 그림만 크기를 정함.
 * 일반: 반경 × 2.9 (길 폭 약 45px 안), 보스: 반경 × 2.6, 최종 보스: 86 (위아래 칸 경계에 닿지 않는 최대치)
 */
export function monsterVisualSize(def: MonsterDef) {
  if (def.final) return 86;
  return Math.round(def.radius * (def.boss ? 2.6 : 2.9));
}
