#!/usr/bin/env node
/*
 * test/browser.js — 実際のブラウザで全10ステージを遊んで検証する。
 *   NODE_PATH=/opt/node22/lib/node_modules node test/browser.js
 *
 * 検証内容:
 *   - 全ステージをUI操作だけで最短手数クリアできる
 *   - タップ操作とドラッグ&ドロップの両方が効く
 *   - 無駄打ちすると「詰み」表示が出る／もどす で復帰できる
 *   - やりなおし・ヒント・ステージ選択・進行状況の保存が動く
 *   - コンソールエラーが出ない
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log('   ✓ ' + msg);
  else { console.log('   ✗ ' + msg); failures++; }
  return cond;
}

const settled = (page) => page.waitForFunction(() => !window.BitGame.busy, null, { timeout: 5000 });

async function tap(page, id) {
  await page.click(`#board .block[data-id="${id}"]`);
}

async function drag(page, srcId, dstId) {
  const a = await page.locator(`#board .block[data-id="${srcId}"]`).boundingBox();
  const b = await page.locator(`#board .block[data-id="${dstId}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.mouse.up();
}

async function dragToCell(page, srcId, cx, cy) {
  const a = await page.locator(`#board .block[data-id="${srcId}"]`).boundingBox();
  const c = await page.locator(`.cell[data-x="${cx}"][data-y="${cy}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 10 });
  await page.mouse.up();
}

// ルールモーダルは初回起動時だけ出る
async function closeRules(page) {
  if (await page.locator('#rules-modal').isVisible()) await page.click('#btn-rules-close');
}

const nextHint = (page) => page.evaluate(() => window.BitCore.hint(window.BitGame.state));
const snapshot = (page) => page.evaluate(() => ({
  moves: window.BitGame.moves,
  bads: window.BitGame.state.blocks.filter(b => b.type === 'bad').length,
  blocks: window.BitGame.state.blocks.length,
  stuck: !document.getElementById('stuck').hidden,
  cleared: window.BitCore.isCleared(window.BitGame.state)
}));

(async () => {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } });

  // 全ステージを開放した状態で起動する
  await context.addInitScript(() => {
    localStorage.setItem('bit0110.progress', JSON.stringify({ cleared: [0,1,2,3,4,5,6,7,8,9], last: 0 }));
  });

  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(base);
  await closeRules(page);

  const levels = await page.evaluate(() => window.BitLevels.map(l => ({ name: l.name, par: l.par })));

  console.log('=== 全ステージ 通しプレイ（タップ操作） ===');
  for (let i = 0; i < levels.length; i++) {
    await page.evaluate(n => window.BitGame.loadLevel(n), i);
    let guard = 0;
    while (!(await page.evaluate(() => window.BitCore.isCleared(window.BitGame.state)))) {
      if (++guard > 12) break;
      const h = await nextHint(page);
      if (!h) break;
      await tap(page, h.srcId);
      await tap(page, h.dstId);
      await settled(page);
    }
    const clearShown = await page.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 })
      .then(() => true).catch(() => false);
    const s = await snapshot(page);
    ok(s.cleared && clearShown && s.moves === levels[i].par,
      `ステージ${i + 1} 「${levels[i].name}」 ${s.moves}手でクリア（最短${levels[i].par}手）`);
    if (!s.cleared) console.log('     状態:', JSON.stringify(s));
    await page.click('#btn-replay');
  }

  console.log('\n=== ドラッグ&ドロップ操作 ===');
  await page.evaluate(() => window.BitGame.loadLevel(0));
  {
    const h = await nextHint(page);
    await drag(page, h.srcId, h.dstId);
    await settled(page);
    await page.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 }).catch(() => {});
    ok(await page.evaluate(() => window.BitCore.isCleared(window.BitGame.state)),
      'ドラッグして重ねると演算が発動する');
    await page.click('#btn-replay');
  }
  {
    // 空きマスへの移動は手数に数えない
    const before = await snapshot(page);
    const opId = await page.evaluate(() => window.BitGame.state.blocks.find(b => b.type !== 'bad').id);
    await dragToCell(page, opId, 0, 0);
    const after = await snapshot(page);
    const pos = await page.evaluate(id => {
      const b = window.BitGame.state.blocks.find(x => x.id === id);
      return { x: b.x, y: b.y };
    }, opId);
    ok(pos.x === 0 && pos.y === 0, '空きマスへドラッグして移動できる');
    ok(after.moves === before.moves, '移動は手数に数えない');
  }

  console.log('\n=== 詰み検出・もどす・やりなおし ===');
  await page.evaluate(() => window.BitGame.loadLevel(1)); // ステージ2
  {
    // OR0001 を 悪0011 に当てると変化なし → 詰み
    const ids = await page.evaluate(() => {
      const S = window.BitGame.state;
      return {
        badId: S.blocks.find(b => b.type === 'bad' && window.BitCore.toBits(b.bits) === '0011').id,
        orId: S.blocks.find(b => b.type === 'or' && window.BitCore.toBits(b.bits) === '0001').id
      };
    });
    await tap(page, ids.orId);
    await tap(page, ids.badId);
    await settled(page);
    await page.waitForTimeout(80);
    let s = await snapshot(page);
    ok(s.stuck, '無駄打ちすると「詰み」が表示される');

    await page.click('#btn-stuck-undo');
    await page.waitForTimeout(80);
    s = await snapshot(page);
    ok(!s.stuck && s.moves === 0 && s.blocks === 4, '「もどす」で詰みから復帰できる');

    // 詰みのまま「やりなおし」
    await tap(page, ids.orId);
    await tap(page, ids.badId);
    await settled(page);
    await page.click('#btn-stuck-reset');
    await page.waitForTimeout(80);
    s = await snapshot(page);
    ok(!s.stuck && s.moves === 0 && s.blocks === 4, '「やりなおし」で初期配置に戻る');
  }

  console.log('\n=== ヒント ===');
  await page.evaluate(() => window.BitGame.loadLevel(9)); // 最終ステージ
  await page.click('#btn-hint');
  ok(await page.locator('#board .block.hint-src').count() === 1 && await page.locator('#board .block.hint-dst').count() === 1,
    'ヒントが次の一手を光らせる');
  ok((await page.textContent('#preview')).includes('→'), 'ヒントの内容がプレビューに出る');

  console.log('\n=== ルール上の禁止操作 ===');
  {
    const r = await page.evaluate(() => {
      const C = window.BitCore, S = window.BitGame.state;
      const not = S.blocks.find(b => b.type === 'not');
      const or = S.blocks.find(b => b.type === 'or');
      const bad = S.blocks.find(b => b.type === 'bad');
      return {
        notAsTarget: C.canApply(or, not),      // NOTは対象にできない
        badAsSource: C.canApply(bad, or),      // 悪ブロックは使えない
        self: C.canApply(or, or),              // 自分自身には使えない
        notOnOp: C.canApply(not, or),          // NOTを演算ブロックに → OK
        opOnBad: C.canApply(or, bad)           // 演算ブロックを悪に → OK
      };
    });
    ok(r.notAsTarget === false, 'NOTブロックは演算の対象にできない');
    ok(r.badAsSource === false, '悪ブロックは動かせない・使えない');
    ok(r.self === false, '自分自身には重ねられない');
    ok(r.notOnOp === true && r.opOnBad === true, '許可された組み合わせは実行できる');
  }

  console.log('\n=== 進行状況の保存 ===');
  {
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(base);
    await closeRules(p2);
    await p2.evaluate(() => window.BitGame.loadLevel(0));
    const h = await p2.evaluate(() => window.BitCore.hint(window.BitGame.state));
    await p2.click(`#board .block[data-id="${h.srcId}"]`);
    await p2.click(`#board .block[data-id="${h.dstId}"]`);
    await p2.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 });
    await p2.click('#btn-next');
    ok(await p2.textContent('#stage-no') === '2', 'クリア後に次のステージへ進める');

    await p2.reload();
    ok(await p2.textContent('#stage-no') === '2', 'リロードしても進行状況が残る');

    await p2.click('#btn-stages');
    const unlocked = await p2.locator('.stage-btn:not(:disabled)').count();
    ok(unlocked === 2, 'クリアした次のステージまで開放される（' + unlocked + '面）');
    await ctx2.close();
  }

  console.log('\n=== スクリーンショット ===');
  for (const i of [0, 5, 9]) {
    await page.evaluate(n => window.BitGame.loadLevel(n), i);
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(ROOT, `.shots/stage${i + 1}.png`), fullPage: true });
    console.log('   saved .shots/stage' + (i + 1) + '.png');
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(() => window.BitGame.loadLevel(9));
  await page.waitForTimeout(60);
  await page.screenshot({ path: path.join(ROOT, '.shots/mobile.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'スマホ幅で横スクロールが出ない');

  ok(errors.length === 0, 'コンソールエラーなし' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  server.close();

  console.log('');
  if (failures) { console.error('❌ ' + failures + ' 件の失敗'); process.exit(1); }
  console.log('✅ ブラウザ検証すべてOK');
})();
