/**
 * 캐릭터 전투용 이미지 생성 (원본 보존)
 *   입력: src/assets/characters-full/{memberId}/star-{1~5}.(webp|png)  — 고화질 원본, 수정하지 않음
 *   출력: src/assets/characters/{memberId}/star-{1~5}.webp           — 256×256, 투명 배경, 손실 압축
 * 처리: 투명 여백만 잘라냄(인물 픽셀은 자르지 않음, 여백 3% 유지) → 비율 유지 축소(늘리기 없음) → 정사각 캔버스 중앙 배치
 *       → WebP 품질을 0.86부터 낮춰 40KB 이하를 목표 (최저 0.62, 그 이하로는 화질 우선)
 * 실행: node tools/assets/optimize-characters.cjs
 *   이미지 처리 패키지를 설치하지 않고 Chrome canvas를 사용 (playwright-core 경로: 환경변수 PLAYWRIGHT_CORE)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/Users/User/gguhansung-jump-king/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '../../src/assets');
const SRC = path.join(ROOT, 'characters-full');
const OUT = path.join(ROOT, 'characters');
const SIZE = 256, TARGET = 40 * 1024, ALPHA_MIN = 12, PAD = 0.03;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  const report = [];
  for (const id of fs.readdirSync(SRC).filter((d) => fs.statSync(path.join(SRC, d)).isDirectory()).sort()) {
    for (let star = 1; star <= 5; star++) {
      const file = ['webp', 'png'].map((e) => path.join(SRC, id, `star-${star}.${e}`)).find(fs.existsSync);
      if (!file) { report.push({ id, star, error: '원본 없음' }); continue; }
      const mime = file.endsWith('.png') ? 'image/png' : 'image/webp';
      const dataUrl = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
      const r = await page.evaluate(async ({ dataUrl, SIZE, TARGET, ALPHA_MIN, PAD }) => {
        const img = new Image(); img.src = dataUrl; await img.decode();
        const W = img.naturalWidth, H = img.naturalHeight;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, W, H).data;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] >= ALPHA_MIN) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < 0) return { error: '완전 투명' };
        const pad = Math.round(PAD * Math.max(x1 - x0 + 1, y1 - y0 + 1));
        const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cx1 = Math.min(W - 1, x1 + pad), cy1 = Math.min(H - 1, y1 + pad);
        const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
        const s = Math.min(SIZE / cw, SIZE / ch); // 비율 유지 (늘리지 않음)
        const dw = Math.round(cw * s), dh = Math.round(ch * s);
        // 큰 축소는 2단계로 나눠 계단 현상 감소
        let srcC = c, sx = cx0, sy = cy0, sw = cw, sh = ch;
        if (s < 0.5) {
          const m = document.createElement('canvas'); m.width = Math.round(cw * s * 2); m.height = Math.round(ch * s * 2);
          const mg = m.getContext('2d'); mg.imageSmoothingQuality = 'high'; mg.drawImage(c, cx0, cy0, cw, ch, 0, 0, m.width, m.height);
          srcC = m; sx = 0; sy = 0; sw = m.width; sh = m.height;
        }
        const o = document.createElement('canvas'); o.width = SIZE; o.height = SIZE;
        const og = o.getContext('2d'); og.imageSmoothingQuality = 'high';
        og.drawImage(srcC, sx, sy, sw, sh, Math.round((SIZE - dw) / 2), Math.round((SIZE - dh) / 2), dw, dh);
        let q = 0.86, url = '', used = q;
        for (; q >= 0.62 - 1e-9; q -= 0.04) { used = q; url = o.toDataURL('image/webp', q); if (url.length * 0.75 <= TARGET) break; }
        // 인물 경계가 출력 캔버스 안에 온전히 들어왔는지 (잘림 검사): 테두리 1px에 불투명 픽셀이 없어야 함
        const od = og.getImageData(0, 0, SIZE, SIZE).data; let edge = 0;
        for (let i = 0; i < SIZE; i++) for (const [x, y] of [[i, 0], [i, SIZE - 1], [0, i], [SIZE - 1, i]]) if (od[(y * SIZE + x) * 4 + 3] >= 128) edge++;
        const touchesOriginalEdge = x0 === 0 || y0 === 0 || x1 === W - 1 || y1 === H - 1;
        return { url, q: +used.toFixed(2), W, H, box: [x1 - x0 + 1, y1 - y0 + 1], fill: +Math.max(dw, dh) / SIZE, draw: [dw, dh], edge, touchesOriginalEdge,
          coverage: +(((x1 - x0 + 1) * (y1 - y0 + 1)) / (W * H)).toFixed(2) };
      }, { dataUrl, SIZE, TARGET, ALPHA_MIN, PAD });
      if (r.error) { report.push({ id, star, error: r.error }); continue; }
      const buf = Buffer.from(r.url.split(',')[1], 'base64');
      fs.mkdirSync(path.join(OUT, id), { recursive: true });
      fs.writeFileSync(path.join(OUT, id, `star-${star}.webp`), buf);
      report.push({ id, star, src: `${r.W}x${r.H}`, figure: r.box.join('x'), coverage: r.coverage, draw: r.draw.join('x'), q: r.q, kb: +(buf.length / 1024).toFixed(1), edge: r.edge, originalEdge: r.touchesOriginalEdge });
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'optimize-report.json'), JSON.stringify(report, null, 1));
  const ok = report.filter((r) => !r.error);
  console.log(`변환 ${ok.length}/${report.length}, 합계 ${(ok.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(2)}MB, 40KB 초과 ${ok.filter((r) => r.kb > 40).length}장`);
  for (const r of report.filter((r) => r.error || r.originalEdge || r.edge)) console.log('  확인 필요:', JSON.stringify(r));
})();
