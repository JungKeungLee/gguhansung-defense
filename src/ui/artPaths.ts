/** 캐릭터 이미지 경로 규칙 (순수 함수 — Vite 비의존, 테스트 가능) */
export const artKey = (memberId: string, star: number) => `char:${memberId}:${star}`;

/** 파일 경로 목록 → 키별 URL. 규칙: characters/{memberId}/star-{1~5}.(webp|png), webp 우선 */
export function buildArtMap(entries: Record<string, string>) {
  const map = new Map<string, string>();
  for (const [path, url] of Object.entries(entries)) {
    const m = path.match(/characters\/([^/]+)\/star-([1-5])\.(webp|png)$/);
    if (!m) continue;
    const key = artKey(m[1], Number(m[2]));
    if (!map.has(key) || m[3] === 'webp') map.set(key, url);
  }
  return map;
}
