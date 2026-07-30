#!/usr/bin/env node
/*
 * test/browser.js — 実際のブラウザで検証する。
 *   NODE_PATH=/opt/node22/lib/node_modules node test/browser.js
 *
 * 検証内容:
 *   - 各ワールドの最初・中間・最後のステージをUI操作だけで最短手数クリア
 *   - タップ操作とドラッグ&ドロップの両方が効く
 *   - 無駄打ちすると「詰み」表示が出る／もどす・やりなおし で復帰できる
 *   - ヒント・ステージ選択（ワールド分け）・進行状況の保存が動く
 *   - コンソールエラーが出ない
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const STORE_KEY = 'bit0110.progress.v2';

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

const settled = (page) => page.waitForFunction(() => !window.BitGame.busy, null, { timeout: 8000 });

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

// チュートリアルは新ブロック解禁のステージで一度だけ出る。
// ステージ1では「あそびかた」→「OR」と続けて出るので、閉じるまでスキップする。
async function closeTutorial(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#tutorial-modal').isVisible())) return;
    await page.click('#btn-tut-skip');
    await page.waitForTimeout(60);
  }
  throw new Error('チュートリアルが閉じられない');
}

const nextHint = (page) => page.evaluate(() => window.BitCore.hint(window.BitGame.state));
const snapshot = (page) => page.evaluate(() => ({
  moves: window.BitGame.moves,
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
  await context.addInitScript(([k]) => {
    localStorage.setItem(k, JSON.stringify({
      cleared: Array.from({ length: 1000 }, (_, i) => i),
      last: 0,
      seenTutorials: ['INTRO', 'OR', 'NOT', 'AND', 'XOR']
    }));
  }, [STORE_KEY]);

  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(base);
  await closeTutorial(page);

  const meta = await page.evaluate(() => ({
    n: window.BitLevels.length,
    worlds: window.BitLevels.worlds,
    levels: window.BitLevels.map(l => ({ name: l.name, par: l.par }))
  }));

  // 各ワールドの最初・中間・最後 + 全体の最終面
  const sample = new Set();
  meta.worlds.forEach(w => {
    sample.add(w.start);
    sample.add(w.start + Math.floor(w.count / 2));
    sample.add(w.start + w.count - 1);
  });
  sample.add(meta.n - 1);

  console.log(`=== サンプルステージ 通しプレイ（タップ操作、全${meta.n}面中${sample.size}面） ===`);
  for (const i of [...sample].sort((a, b) => a - b)) {
    await page.evaluate(n => window.BitGame.loadLevel(n), i);
    let guard = 0;
    while (!(await page.evaluate(() => window.BitCore.isCleared(window.BitGame.state)))) {
      if (++guard > 16) break;
      const h = await nextHint(page);
      if (!h) break;
      await tap(page, h.srcId);
      await tap(page, h.dstId);
      await settled(page);
    }
    const clearShown = await page.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 })
      .then(() => true).catch(() => false);
    const s = await snapshot(page);
    ok(s.cleared && clearShown && s.moves === meta.levels[i].par,
      `ステージ${i + 1} 「${meta.levels[i].name}」 ${s.moves}手でクリア（最短${meta.levels[i].par}手）`);
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
    const spot = await page.evaluate(() => {
      const S = window.BitGame.state, C = window.BitCore;
      const op = S.blocks.find(b => b.type !== 'bad');
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        if (!C.isWall(S, x, y) && !C.blockAt(S, x, y)) return { id: op.id, x, y };
      }
    });
    const before = await snapshot(page);
    await dragToCell(page, spot.id, spot.x, spot.y);
    const after = await snapshot(page);
    const pos = await page.evaluate(id => {
      const b = window.BitGame.state.blocks.find(x => x.id === id);
      return { x: b.x, y: b.y };
    }, spot.id);
    ok(pos.x === spot.x && pos.y === spot.y, '空きマスへドラッグして移動できる');
    ok(after.moves === before.moves, '移動は手数に数えない');
  }

  console.log('\n=== 詰み検出・もどす・やりなおし ===');
  {
    // 初手で詰む手があるステージを探して、その手を実際に打つ
    const trap = await page.evaluate(() => {
      const C = window.BitCore, L = window.BitLevels;
      for (let i = 0; i < L.length; i++) {
        const st = C.createState(L[i]);
        for (const src of st.blocks) {
          for (const dst of st.blocks) {
            if (!C.canApply(src, dst)) continue;
            const ns = C.applyBlock(st, src.id, dst.id);
            if (ns && C.solve(ns) === null) return { level: i, srcId: src.id, dstId: dst.id };
          }
        }
      }
      return null;
    });
    ok(trap !== null, '詰みに落ちる手があるステージが存在する (ステージ' + (trap.level + 1) + ')');
    await page.evaluate(n => window.BitGame.loadLevel(n), trap.level);
    const initBlocks = (await snapshot(page)).blocks;

    await tap(page, trap.srcId);
    await tap(page, trap.dstId);
    await settled(page);
    await page.waitForTimeout(80);
    let s = await snapshot(page);
    ok(s.stuck, '詰み盤面で「詰み」が表示される');

    await page.click('#btn-stuck-undo');
    await page.waitForTimeout(80);
    s = await snapshot(page);
    ok(!s.stuck && s.moves === 0 && s.blocks === initBlocks, '「もどす」で詰みから復帰できる');

    await tap(page, trap.srcId);
    await tap(page, trap.dstId);
    await settled(page);
    await page.click('#btn-stuck-reset');
    await page.waitForTimeout(80);
    s = await snapshot(page);
    ok(!s.stuck && s.moves === 0 && s.blocks === initBlocks, '「やりなおし」で初期配置に戻る');
  }

  console.log('\n=== ヒント ===');
  await page.evaluate(n => window.BitGame.loadLevel(n), meta.n - 1); // 最終ステージ
  await page.click('#btn-hint');
  ok(await page.locator('#board .block.hint-src').count() === 1 &&
     await page.locator('#board .block.hint-dst').count() === 1,
    'ヒントが次の一手を光らせる');
  ok((await page.textContent('#preview')).includes('→'), 'ヒントの内容がプレビューに出る');

  console.log('\n=== ルール上の禁止操作 ===');
  {
    const r = await page.evaluate(() => {
      const C = window.BitCore, L = window.BitLevels;
      // なるべく or・not・悪 が同居するステージで確認する（NOT未登場の段階では or/悪 のみ）
      let best = null;
      for (let i = 0; i < L.length; i++) {
        const S = C.createState(L[i]);
        const not = S.blocks.find(b => b.type === 'not');
        const or = S.blocks.find(b => b.type === 'or');
        const bad = S.blocks.find(b => b.type === 'bad');
        if (!or || !bad) continue;
        const res = {
          hasNot: !!not,
          badAsSource: C.canApply(bad, or),
          self: C.canApply(or, or),
          opOnBad: C.canApply(or, bad)
        };
        if (not) {
          res.notAsTarget = C.canApply(or, not);
          res.notOnOp = C.canApply(not, or);
          return res;
        }
        best = best || res;
      }
      return best;
    });
    ok(r !== null, 'or/悪が同居する検証用ステージがある');
    if (r) {
      ok(r.badAsSource === false, '悪ブロックは動かせない・使えない');
      ok(r.self === false, '自分自身には重ねられない');
      ok(r.opOnBad === true, '許可された組み合わせは実行できる');
      if (r.hasNot) {
        ok(r.notAsTarget === false, 'NOTブロックは演算の対象にできない');
        ok(r.notOnOp === true, 'NOTを演算ブロックに重ねられる');
      } else {
        console.log('   - NOT登場前のためNOT関連チェックはスキップ');
      }
    }
  }

  console.log('\n=== ステージ選択（ワールド分け） ===');
  {
    await page.click('#btn-stages');
    const btns = await page.locator('.stage-btn').count();
    const heads = await page.locator('.world-head').count();
    ok(btns === meta.n, 'ステージボタンが全ステージ分ある (' + btns + ')');
    ok(heads === meta.worlds.length, 'ワールド見出しが ' + meta.worlds.length + ' 個ある');
    await page.click('#btn-stage-close');
  }

  console.log('\n=== チュートリアル ===');
  {
    // まっさらな状態で開くと、ルール説明ではなくチュートリアルが出る
    const ctx3 = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const p3 = await ctx3.newPage();
    const tutErrors = [];
    p3.on('pageerror', e => tutErrors.push(String(e)));
    p3.on('console', m => { if (m.type() === 'error') tutErrors.push(m.text()); });
    await p3.goto(base);

    ok(await p3.locator('#tutorial-modal').isVisible(), '初回起動でチュートリアルが出る');
    ok(!(await p3.locator('#help-modal').isVisible()), '文章だけのルール説明は出ない');
    ok(await p3.evaluate(() => document.body.textContent.indexOf('自分が1のところを1にする。') === -1),
      '長文のルール説明はページから消えている');

    // 「あそびかた」→「OR」の順に、2本続けて出る
    const counts = await p3.evaluate(() => ({
      intro: window.BitTutorial.TUTORIALS.INTRO.steps.length,
      or: window.BitTutorial.TUTORIALS.OR.steps.length
    }));
    ok(await p3.textContent('#tut-kicker') === 'ゲームの基本', '1本目は「あそびかた」');

    const seq = [['INTRO', counts.intro], ['OR', counts.or]];
    for (const [key, n] of seq) {
      for (let s = 0; s < n; s++) {
        const dots = await p3.locator('.tut-dot').count();
        const active = await p3.locator('.tut-dot.active').count();
        const demoBlocks = await p3.locator('#tut-demo .demo-block').count();
        if (dots !== n || active !== 1 || demoBlocks < 1) {
          ok(false, `${key} ステップ${s + 1}: ドット${dots}/${n} アクティブ${active} ブロック${demoBlocks}`);
          break;
        }
        await p3.click('#btn-tut-next');
        await p3.waitForTimeout(80);
      }
      if (key === 'INTRO') {
        ok(await p3.locator('#tutorial-modal').isVisible() &&
           await p3.textContent('#tut-kicker') === 'ORブロック',
          'あそびかたのあとに続けてORのチュートリアルが出る');
      }
    }
    ok(!(await p3.locator('#tutorial-modal').isVisible()), '最後まで進めると閉じる');

    // アニメーションが動いてもエラーが出ないことを確認
    await p3.waitForTimeout(500);
    ok(tutErrors.length === 0, 'チュートリアル中にエラーが出ない' +
      (tutErrors.length ? ': ' + tutErrors.join(' | ') : ''));

    // 一度見たら再表示されない
    await p3.reload();
    await p3.waitForTimeout(150);
    ok(!(await p3.locator('#tutorial-modal').isVisible()), '一度見たチュートリアルは再表示されない');

    // 新ブロック解禁のステージでそれぞれ出る
    for (const w of meta.worlds.slice(1)) {
      await p3.evaluate(([k, n]) => {
        const p = JSON.parse(localStorage.getItem(k));
        p.cleared = Array.from({ length: n }, (_, i) => i);
        localStorage.setItem(k, JSON.stringify(p));
      }, [STORE_KEY, meta.n]);
      await p3.reload();
      await p3.waitForTimeout(100);
      await closeTutorial(p3);
      await p3.evaluate(n => window.BitGame.loadLevel(n), w.start);
      await p3.waitForTimeout(120);
      const shown = await p3.locator('#tutorial-modal').isVisible();
      const badge = shown ? await p3.textContent('#tut-badge') : '';
      const title = shown ? await p3.textContent('#tut-kicker') : '';
      ok(shown && badge === 'NEW BLOCK' && title.indexOf(w.tag) !== -1,
        `ステージ${w.start + 1}（${w.name}の先頭）で ${w.tag} のチュートリアルが出る`);
      await closeTutorial(p3);
      await p3.evaluate(n => window.BitGame.loadLevel(n), w.start);
      await p3.waitForTimeout(100);
      ok(!(await p3.locator('#tutorial-modal').isVisible()),
        `${w.tag} のチュートリアルは2回目には出ない`);
    }

    // 「あそびかた」メニューから見返せる
    await p3.click('#btn-help');
    const menuItems = await p3.locator('#help-list .help-item').count();
    ok(menuItems === 5, 'あそびかたメニューに5項目ある（' + menuItems + '）');
    await p3.click('#help-list [data-tut="XOR"]');
    await p3.waitForTimeout(80);
    ok(await p3.locator('#tutorial-modal').isVisible() &&
       await p3.textContent('#tut-kicker') === 'XORブロック',
      'メニューからチュートリアルを見返せる');
    await p3.click('#btn-tut-skip');

    // ドラッグ演出が動いているか（分身と指マーカーが表示される）
    await p3.click('#btn-help');
    await p3.click('#help-list [data-tut="OR"]');
    await p3.waitForTimeout(900);
    const dragging = await p3.evaluate(() => {
      const g = document.querySelector('#tut-demo .demo-ghost');
      const pt = document.querySelector('#tut-demo .demo-pointer');
      const src = document.querySelector('#tut-demo .demo-src');
      return {
        ghostShown: !!g && g.classList.contains('show'),
        ghostHasBlock: !!(g && g.querySelector('.block')),
        lifted: !!g && g.classList.contains('lifted'),
        pointerShown: !!pt && pt.classList.contains('show'),
        srcDimmed: !!src && src.classList.contains('demo-dragging'),
        moved: !!g && /translate\(/.test(g.style.transform)
      };
    });
    ok(dragging.ghostShown && dragging.ghostHasBlock && dragging.lifted,
      'ドラッグ中の分身が持ち上がって表示される');
    ok(dragging.pointerShown && dragging.srcDimmed,
      '指マーカーが出て、元のブロックは薄くなる');
    ok(dragging.moved, '分身が対象へ向かって動く');
    await p3.waitForTimeout(900);
    const dropped = await p3.evaluate(() => {
      const dst = document.querySelector('#tut-demo .demo-dst');
      const src = document.querySelector('#tut-demo .demo-src');
      return {
        srcConsumed: !!src && src.classList.contains('demo-consumed'),
        dstBits: dst ? [...dst.querySelectorAll('.bit')].map(b => b.textContent).join('') : ''
      };
    });
    ok(dropped.srcConsumed, '落とすと重ねた側のブロックが消える');
    ok(dropped.dstBits === '1111', '対象のbitが 0101 → 1111 に変わる（実際は ' + dropped.dstBits + '）');
    await closeTutorial(p3);

    await ctx3.close();
  }

  console.log('\n=== 進行状況の保存 ===');
  {
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(base);
    await closeTutorial(p2);
    await p2.evaluate(() => window.BitGame.loadLevel(0));
    let guard = 0;
    while (!(await p2.evaluate(() => window.BitCore.isCleared(window.BitGame.state)))) {
      if (++guard > 16) break;
      const h = await p2.evaluate(() => window.BitCore.hint(window.BitGame.state));
      await p2.click(`#board .block[data-id="${h.srcId}"]`);
      await p2.click(`#board .block[data-id="${h.dstId}"]`);
      await p2.waitForFunction(() => !window.BitGame.busy, null, { timeout: 8000 });
    }
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
  const shotIdx = [0, ...meta.worlds.slice(1).map(w => w.start), meta.n - 1];
  for (const i of [...new Set(shotIdx)]) {
    await page.evaluate(n => window.BitGame.loadLevel(n), i);
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(ROOT, `.shots/stage${i + 1}.png`), fullPage: true });
    console.log('   saved .shots/stage' + (i + 1) + '.png');
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(n => window.BitGame.loadLevel(n), meta.n - 1);
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
