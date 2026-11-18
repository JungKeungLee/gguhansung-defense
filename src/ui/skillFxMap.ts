/**
 * 멤버별 스킬 이펙트 이미지 배치 규칙 — 순수 데이터 (src/assets/effects/skills-512/{memberId}.webp, 512×512)
 * 수치는 tools/assets/effects-report.json 측정값(그림 영역)과 이미지 구도 기준.
 *  ground: 바닥 원형 — 그림 가로폭을 판정 지름(size)에 맞춤, 캐릭터·몬스터 아래 깊이
 *  impact: 타격 — 그림 가로폭을 size에 맞추고 originY 지점을 타격 위치에
 *  line:   선형 — 굵기 고정(그림 a→b 전체 길이를 len0 px로 표시), 끝점 b를 실제 끝 좌표에 맞춰 회전.
 *          실제 거리가 len0보다 짧으면 그림 앞부분을 잘라내고, 길면 기존 판정 광선(선)이 나머지를 잇는다.
 *          (윤타미·다뮤_ 실행용 이미지는 광선이 수평이 되도록 회전해 생성 — tools/assets/optimize-effects.cjs)
 */
export type SkillFxSpec =
  | { mode: 'ground'; width: number }
  | { mode: 'impact'; width: number; originY: number }
  | { mode: 'line'; a: [number, number]; b: [number, number]; len0: number };

export const SKILL_FX: Record<string, SkillFxSpec> = {
  yappu: { mode: 'ground', width: 425 },                     // 가속 소용돌이 — 폭주 연사(자기 강화)
  harunotsuki: { mode: 'ground', width: 480 },               // 얼음 원 — 서리 파동(사거리 내 전체)
  kkutinho: { mode: 'ground', width: 458 },                  // 음표 원 — 응원가(지원 반경)
  manjo: { mode: 'impact', width: 495, originY: 0.5 },       // 폭발 — 대폭발 중심
  nanwony: { mode: 'impact', width: 494, originY: 0.46 },    // 별 폭발 — 혼돈의 주사위 효과 지점
  kimokdok: { mode: 'impact', width: 395, originY: 0.88 },   // 기둥 — 처형 대상 (기둥 바닥을 대상 위치에)
  moya: { mode: 'impact', width: 399, originY: 0.84 },       // 고양이 정령 — 보조 공격체 소환 위치
  yuntami: { mode: 'line', a: [80, 262], b: [400, 236], len0: 200 },  // 저격 광선 — 윤타미 → 대상 (끝 폭발이 대상)
  yamuji: { mode: 'line', a: [12, 264], b: [501, 264], len0: 225 },   // 관통 창 — 시작 → 관통 끝 (창끝이 끝점)
  damyu: { mode: 'line', a: [70, 345], b: [450, 318], len0: 200 },    // 연쇄 번개 — 첫 대상 → 마지막 대상
};

/** 같은 멤버의 바닥 원이 이미 떠 있는 자리와 겹칠 때 대신 표시할 작은 시전 표시 지름 */
export const GROUND_MARKER_SIZE = 96;

export const skillFxKey = (memberId: string) => `sfx:${memberId}`;
/** 지속(초, 게임 연출 시간): 바닥형은 조금 길게 */
export const skillFxDuration = (spec: SkillFxSpec) => (spec.mode === 'ground' ? 0.7 : spec.mode === 'line' ? 0.4 : 0.55);
