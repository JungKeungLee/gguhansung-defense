/**
 * 스킬 이펙트 실행용 이미지 생성 (원본 보존)
 *   입력: src/assets/effects/skills/{memberId}.webp      — 원본 1254×1254, 수정하지 않음
 *   출력: src/assets/effects/skills-512/{memberId}.webp  — 512×512 (구도 그대로 축소), 투명 배경, 손실 WebP
 * 화면 표시 최대 약 380px(서리 파동 사거리 지름)이라 512로 충분. 측정한 그림 영역은 tools/assets/effects-report.json
 * 선형 스킬(ROTATE)은 광선이 수평이 되도록 회전 — 게임에서 굵기는 고정하고 길이만 잘라 쓰기 위함. 회전 후 시작·끝점은 리포트 a/b
 * 실행: node tools/assets/optimize-effects.cjs   (Chrome canvas 사용, 패키지 설치 없음. playwright-core 경로: PLAYWRIGHT_CORE)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Users/User/gguhansung-jump-king/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '../../src/assets/effects');
const SRC = path.join(ROOT, 'skills');
const OUT = path.join(ROOT, 'skills-512');
const SIZE = 512, Q = 0.85;
/** 원본을 512로 줄였을 때 그림 속 광선 시작점 a → 끝점 b (512 좌표) */
const ROTATE = { yuntami: [[72, 59], [394, 321]], damyu: [[26, 328], [460, 295]] };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage();
  const report = {};
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.webp')).sort()) {
    const src = fs.readFileSync(path.join(SRC, f));
    const rot = ROTATE[f.replace('.webp', '')] || null;
    const r = await p.evaluate(async ({ url, SIZE, Q, rot }) => {
      const img = new Image(); img.src = url; await img.decode();
      const o = document.createElement('canvas'); o.width = SIZE; o.height = SIZE;
      const g = o.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
      // 2단계 축소 (계단 현상 감소)
      const m = document.createElement('canvas'); m.width = SIZE * 2; m.height = SIZE * 2; const mg = m.getContext('2d'); mg.imageSmoothingQuality = 'high';
      mg.drawImage(img, 0, 0, m.width, m.height); g.drawImage(m, 0, 0, SIZE, SIZE);
      let ab = null;
      if (rot) { // 광선을 수평으로: 중심 기준 -θ 회전, 그림이 잘리지 않도록 k배 축소
        const [[ax, ay], [bx, by]] = rot; const th = Math.atan2(by - ay, bx - ax); const c0 = SIZE / 2;
        const src = g.getImageData(0, 0, SIZE, SIZE).data; let far = 0;
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (src[(y * SIZE + x) * 4 + 3] >= 24) { const dx = x - c0, dy = y - c0; const rx = dx * Math.cos(-th) - dy * Math.sin(-th), ry = dx * Math.sin(-th) + dy * Math.cos(-th); far = Math.max(far, Math.abs(rx), Math.abs(ry)); }
        const k = Math.min(1, (c0 - 2) / far);
        const copy = document.createElement('canvas'); copy.width = SIZE; copy.height = SIZE; copy.getContext('2d').drawImage(o, 0, 0);
        g.clearRect(0, 0, SIZE, SIZE); g.save(); g.translate(c0, c0); g.rotate(-th); g.scale(k, k); g.drawImage(copy, -c0, -c0); g.restore();
        const tp = ([x, y]) => { const dx = (x - c0) * k, dy = (y - c0) * k; return [Math.round(c0 + dx * Math.cos(-th) - dy * Math.sin(-th)), Math.round(c0 + dx * Math.sin(-th) + dy * Math.cos(-th))]; };
        ab = [tp([ax, ay]), tp([bx, by])];
      }
      const d = g.getImageData(0, 0, SIZE, SIZE).data; let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (d[(y * SIZE + x) * 4 + 3] >= 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { url: o.toDataURL('image/webp', Q), bbox: [x0, y0, x1, y1], ab };
    }, { url: 'data:image/webp;base64,' + src.toString('base64'), SIZE, Q, rot });
    const buf = Buffer.from(r.url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, f), buf);
    report[f.replace('.webp', '')] = { bbox512: r.bbox, ...(r.ab ? { a: r.ab[0], b: r.ab[1] } : {}), kbBefore: Math.round(src.length / 1024), kbAfter: Math.round(buf.length / 1024) };
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'effects-report.json'), JSON.stringify(report, null, 1));
  const kb = Object.values(report).reduce((s, r) => [s[0] + r.kbBefore, s[1] + r.kbAfter], [0, 0]);
  console.log(`변환 ${Object.keys(report).length}장: ${kb[0]}KB → ${kb[1]}KB`);
  for (const [k, r] of Object.entries(report)) console.log(' ', k, 'bbox', r.bbox512.join(','), r.a ? `a ${r.a} b ${r.b}` : '', `${r.kbBefore}→${r.kbAfter}KB`);
})();
