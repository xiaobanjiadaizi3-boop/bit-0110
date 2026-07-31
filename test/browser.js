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

// 起動直後はホーム画面が出る
async function leaveHome(page) {
  if (await page.locator('#home-screen').isVisible()) {
    await page.click('#btn-home-continue');
    await page.waitForTimeout(80);
  }
}

async function closeOver(page) {
  if (await page.locator('#over-modal').isVisible()) await page.click('#btn-over-retry');
}

const nextHint = (page) => page.evaluate(() => window.BitCore.hint(window.BitGame.state));
const snapshot = (page) => page.evaluate(() => ({
  moves: window.BitGame.moves,
  blocks: window.BitGame.state.blocks.length,
  over: !document.getElementById('over-modal').hidden,
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
  await leaveHome(page);
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

  console.log('\n=== ゲームオーバー（詰み） ===');
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

    const fallIn = async () => {
      await tap(page, trap.srcId);
      await tap(page, trap.dstId);
      await settled(page);
      await page.waitForSelector('#over-modal:not([hidden])', { timeout: 3000 }).catch(() => {});
    };

    await fallIn();
    let s = await snapshot(page);
    ok(s.over, '詰むとゲームオーバー画面が出る');
    ok((await page.textContent('.over-mark')).trim() === 'GAME OVER', '「GAME OVER」と表示される');
    ok(await page.locator('#btn-over-retry').isVisible() &&
       await page.locator('#btn-over-stages').isVisible(),
      'やりなおす／ステージ選択のボタンがある');

    await page.click('#btn-over-retry');
    await page.waitForTimeout(120);
    s = await snapshot(page);
    ok(!s.over && s.moves === 0 && s.blocks === initBlocks, '「やりなおす」で初期配置に戻る');

    await fallIn();
    await page.click('#btn-over-stages');
    await page.waitForTimeout(120);
    ok(!(await page.locator('#over-modal').isVisible()) &&
       await page.locator('#stage-modal').isVisible(),
      '「ステージ選択」でステージ一覧へ移動できる');

    await page.click('#btn-stage-close');
    await page.waitForTimeout(120);
    ok(await page.locator('#over-modal').isVisible(),
      'ステージを選ばずに閉じると、詰み画面に戻る');

    await page.click('#btn-over-undo');
    await page.waitForTimeout(120);
    s = await snapshot(page);
    ok(!s.over && s.moves === 0 && s.blocks === initBlocks, '「1手もどす」で詰みから復帰できる');
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
    await leaveHome(p3);

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
    await leaveHome(p3);
    ok(!(await p3.locator('#tutorial-modal').isVisible()), '一度見たチュートリアルは再表示されない');

    // ブロックが初めて盤面に出たタイミングで、そのブロックの説明が出る
    for (const tag of ['NOT', 'AND', 'XOR']) {
      // そのブロックを含む最初のステージ（ワールドの頭とは限らない）
      const first = await p3.evaluate((t) => {
        const L = window.BitLevels;
        for (let i = 0; i < L.length; i++) {
          if (L[i].blocks.some(b => b.type === t.toLowerCase())) return i;
        }
        return -1;
      }, tag);

      await p3.evaluate(([k, n]) => {
        const p = JSON.parse(localStorage.getItem(k));
        p.cleared = Array.from({ length: n }, (_, i) => i);
        localStorage.setItem(k, JSON.stringify(p));
      }, [STORE_KEY, meta.n]);
      await p3.reload();
      await p3.waitForTimeout(100);
      await leaveHome(p3);
      await closeTutorial(p3);

      // 1つ手前のステージでは、まだそのブロックは出ない
      await p3.evaluate(n => window.BitGame.loadLevel(n), Math.max(0, first - 1));
      await p3.waitForTimeout(100);
      const shownEarly = await p3.locator('#tutorial-modal').isVisible();
      await closeTutorial(p3);

      await p3.evaluate(n => window.BitGame.loadLevel(n), first);
      await p3.waitForTimeout(120);
      const shown = await p3.locator('#tutorial-modal').isVisible();
      const kicker = shown ? await p3.textContent('#tut-kicker') : '';
      ok(shown && kicker.indexOf(tag) !== -1,
        `${tag} が初めて出るステージ${first + 1}で ${tag} のチュートリアルが出る`);
      ok(!shownEarly, `その手前のステージ${first} では ${tag} のチュートリアルは出ない`);
      await closeTutorial(p3);

      await p3.evaluate(n => window.BitGame.loadLevel(n), first);
      await p3.waitForTimeout(100);
      ok(!(await p3.locator('#tutorial-modal').isVisible()),
        `${tag} のチュートリアルは2回目には出ない`);
    }

    // ステージ選択で飛んだ先でも、未見のブロックの説明はきちんと出る
    {
      await p3.evaluate(([k]) => {
        const p = JSON.parse(localStorage.getItem(k));
        p.seenTutorials = ['INTRO', 'OR'];
        localStorage.setItem(k, JSON.stringify(p));
      }, [STORE_KEY]);
      await p3.reload();
      await p3.waitForTimeout(100);
      await leaveHome(p3);
      await closeTutorial(p3);
      await p3.evaluate(n => window.BitGame.loadLevel(n), meta.n - 1);  // 最終ステージへ飛ぶ
      await p3.waitForTimeout(150);
      const seen = [];
      for (let i = 0; i < 5 && await p3.locator('#tutorial-modal').isVisible(); i++) {
        seen.push(await p3.textContent('#tut-kicker'));
        await p3.click('#btn-tut-skip');
        await p3.waitForTimeout(80);
      }
      ok(seen.length >= 2, '未見のブロックが複数あれば順に説明が出る（' + seen.join('→') + '）');
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
    await p3.waitForTimeout(1700);   // つかんで運んでいる最中
    const dragging = await p3.evaluate(() => {
      const g = document.querySelector('#tut-demo .demo-ghost');
      const pt = document.querySelector('#tut-demo .demo-pointer');
      const srcBox = document.querySelector('#tut-demo .demo-slot-src .demo-slot-box');
      return {
        ghostShown: !!g && g.classList.contains('show'),
        ghostHasBlock: !!(g && g.querySelector('.block')),
        lifted: !!g && g.classList.contains('lifted'),
        pointerShown: !!pt && pt.classList.contains('show'),
        srcDimmed: !!srcBox && srcBox.classList.contains('demo-slot-dim'),
        moved: !!g && /translate\(/.test(g.style.transform),
        labels: [...document.querySelectorAll('#tut-demo .demo-slot-label')].map(e => e.textContent)
      };
    });
    ok(dragging.ghostShown && dragging.ghostHasBlock && dragging.lifted,
      'ドラッグ中の分身が持ち上がって表示される');
    ok(dragging.pointerShown && dragging.srcDimmed,
      '指マーカーが出て、元のブロックは薄くなる');
    ok(dragging.moved, '分身が対象へ向かって動く');
    ok(dragging.labels.join('/') === '動かす/重ねる先/結果',
      '「動かす・重ねる先・結果」のラベルが並ぶ（' + dragging.labels.join('/') + '）');
    await p3.waitForTimeout(1500);   // 落として結果が出たあと
    const dropped = await p3.evaluate(() => {
      const q = sel => document.querySelector('#tut-demo ' + sel);
      const bitsOf = el => el ? [...el.querySelectorAll('.bit')].map(b => b.textContent).join('') : '';
      return {
        srcSpent: !!q('.demo-slot-src .demo-slot-spent'),
        srcStillShowsBlock: !!q('.demo-slot-src .demo-slot-spent .block'),
        spentLabel: (q('.demo-slot-src .demo-slot-label') || {}).textContent || '',
        dstLabel: (q('.demo-slot-dst .demo-slot-label') || {}).textContent || '',
        dstBits: bitsOf(q('.demo-slot-dst .demo-slot-box')),
        resBits: bitsOf(q('.demo-slot-res .demo-slot-box')),
        resDefeat: !!q('.demo-slot-res .demo-defeat')
      };
    });
    ok(dropped.srcSpent && dropped.srcStillShowsBlock && dropped.spentLabel === '使って消えた',
      '使ったブロックは薄く残るので、何を使ったか式に残る（' + dropped.spentLabel + '）');
    ok(dropped.dstLabel === '0101 → 1111',
      '重ねる先のラベルに before → after が出る（' + dropped.dstLabel + '）');
    ok(dropped.dstBits === '1111', '対象のbitが 0101 → 1111 に変わる（実際は ' + dropped.dstBits + '）');
    ok(dropped.resBits === '1111' && dropped.resDefeat,
      '結果スロットに 1111 と撃破が出て、式がそのまま残る');
    await closeTutorial(p3);

    await ctx3.close();
  }

  console.log('\n=== チュートリアルを自分で動かす ===');
  {
    await page.evaluate(() => window.BitTutorial.open('OR'));
    await page.waitForTimeout(200);

    const grabbable = await page.locator('#tut-demo .demo-slot-src .demo-grabbable').count();
    ok(grabbable === 1, '「動かす」ブロックが自分で掴める状態になっている');
    ok((await page.textContent('#tut-demo .demo-hint')).indexOf('ドラッグ') !== -1,
      'ドラッグを促す案内が出る');

    // 自分の手でゆっくり運ぶ（自動再生に邪魔されないこと）
    const src = await page.locator('#tut-demo .demo-slot-src .demo-slot-box').boundingBox();
    const dst = await page.locator('#tut-demo .demo-slot-dst .demo-slot-box').boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + src.width / 2 + 15, src.y + src.height / 2 - 10, { steps: 4 });
    await page.waitForTimeout(1200);          // ゆっくり持っていても勝手に進まない
    const held = await page.evaluate(() => {
      const g = document.querySelector('#tut-demo .demo-ghost');
      return {
        following: !!g && g.classList.contains('free') && g.classList.contains('show'),
        resStillPending: !!document.querySelector('#tut-demo .demo-slot-res .demo-slot-pending')
      };
    });
    ok(held.following, '掴んだブロックが指に追従する');
    ok(held.resStillPending, '持っている間は自動再生が止まって結果が出ない');

    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 8 });
    const hover = await page.evaluate(() =>
      !!document.querySelector('#tut-demo .demo-slot-dst .demo-slot-hot'));
    ok(hover, '重ねる先の上に来ると光って教えてくれる');

    await page.mouse.up();
    await page.waitForTimeout(200);
    const dropped2 = await page.evaluate(() => {
      const q = s => document.querySelector('#tut-demo ' + s);
      const bits = el => el ? [...el.querySelectorAll('.bit')].map(b => b.textContent).join('') : '';
      return {
        dst: bits(q('.demo-slot-dst .demo-slot-box')),
        defeat: !!q('.demo-slot-res .demo-defeat'),
        hint: (q('.demo-hint') || {}).textContent || ''
      };
    });
    ok(dropped2.dst === '1111' && dropped2.defeat,
      '自分で重ねると演算が起きて結果が出る（' + dropped2.dst + '）');
    ok(dropped2.hint.indexOf('撃破') !== -1, '結果の説明が出る（' + dropped2.hint + '）');

    // 「もう一度」で最初の状態に戻る
    const btn = await page.locator('#btn-tut-replay').boundingBox();
    ok(btn.height >= 30 && btn.width >= 60,
      'もう一度ボタンが押しやすい大きさ（' + Math.round(btn.width) + 'x' + Math.round(btn.height) + '）');
    await page.click('#btn-tut-replay');
    await page.waitForTimeout(150);
    const afterReplay = await page.evaluate(() => {
      const q = s => document.querySelector('#tut-demo ' + s);
      const bits = el => el ? [...el.querySelectorAll('.bit')].map(b => b.textContent).join('') : '';
      return {
        dst: bits(q('.demo-slot-dst .demo-slot-box')),
        pending: !!q('.demo-slot-res .demo-slot-pending'),
        grabbable: !!q('.demo-slot-src .demo-grabbable')
      };
    });
    ok(afterReplay.dst === '0101' && afterReplay.pending,
      '「もう一度」で最初の状態に戻る（' + afterReplay.dst + '）');
    ok(afterReplay.grabbable, '戻したあとも自分で掴める');

    // 対象外の場所で離すと元に戻るだけ
    const src2 = await page.locator('#tut-demo .demo-slot-src .demo-slot-box').boundingBox();
    await page.mouse.move(src2.x + src2.width / 2, src2.y + src2.height / 2);
    await page.mouse.down();
    await page.mouse.move(src2.x + src2.width / 2, src2.y - 40, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    ok(await page.evaluate(() =>
      !!document.querySelector('#tut-demo .demo-slot-res .demo-slot-pending')),
      '関係ない場所で離しても何も起きない');
    await closeTutorial(page);
  }

  console.log('\n=== チュートリアルのループ再生 ===');
  {
    await page.evaluate(() => window.BitTutorial.open('OR'));
    const cycle = await page.evaluate(() => window.BitTutorial._state.demo.cycle);
    ok(cycle > 0, 'デモに繰り返し周期がある（' + cycle + 'ms）');
    ok(await page.locator('#tut-loop').isVisible(), '繰り返しの進行バーが出る');

    // 2周期ぶんサンプリングして、同じ演出が繰り返されるか数える
    const samples = [];
    for (let i = 0; i < Math.ceil(cycle * 2.2 / 100); i++) {
      samples.push(await page.evaluate(() =>
        document.querySelector('#tut-demo .demo-ghost').classList.contains('show') ? 1 : 0));
      await page.waitForTimeout(100);
    }
    let rises = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i] && !samples[i - 1]) rises++;
    ok(rises >= 2, '一定時間ごとにアニメーションが繰り返される（' + rises + '回/2周期）');

    // 手動リプレイ
    await page.click('#btn-tut-replay');
    await page.waitForTimeout(120);
    ok(await page.evaluate(() =>
      !document.querySelector('#tut-demo .demo-ghost').classList.contains('show')),
      'リプレイボタンで最初から再生し直す');
    await closeTutorial(page);
  }

  console.log('\n=== ステージ選択の星 ===');
  {
    const ctx4 = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const p4 = await ctx4.newPage();
    await p4.goto(base);
    await leaveHome(p4);
    await closeTutorial(p4);

    // ステージ1を最短でクリア → 金の星
    await p4.evaluate(() => window.BitGame.loadLevel(0));
    let h = await p4.evaluate(() => window.BitCore.hint(window.BitGame.state));
    await p4.click(`#board .block[data-id="${h.srcId}"]`);
    await p4.click(`#board .block[data-id="${h.dstId}"]`);
    await p4.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 });
    ok(await p4.locator('#clear-star.gold').count() === 1, '最短クリアで金の星が出る');
    await p4.click('#btn-next');

    // 「1手損しても勝てる」ステージを探して遠回りクリア → 青い星
    const detour = await p4.evaluate(() => {
      const C = window.BitCore, L = window.BitLevels;
      for (let i = 1; i < 40; i++) {
        const st = C.createState(L[i]);
        for (const src of st.blocks) for (const dst of st.blocks) {
          if (!C.canApply(src, dst)) continue;
          const ns = C.applyBlock(st, src.id, dst.id);
          // 1手使ったのに残り最短が減っていない = 遠回りだが勝てる
          if (ns && C.solve(ns) === L[i].par) return { level: i, srcId: src.id, dstId: dst.id };
        }
      }
      return null;
    });
    ok(detour !== null, '遠回りしても勝てるステージが見つかる（ステージ' + (detour.level + 1) + '）');

    await p4.evaluate(n => window.BitGame.loadLevel(n), detour.level);
    await closeTutorial(p4);
    await p4.click(`#board .block[data-id="${detour.srcId}"]`);
    await p4.click(`#board .block[data-id="${detour.dstId}"]`);
    await p4.waitForFunction(() => !window.BitGame.busy, null, { timeout: 8000 });
    let guard = 0;
    while (!(await p4.evaluate(() => window.BitCore.isCleared(window.BitGame.state)))) {
      if (++guard > 16) break;
      h = await p4.evaluate(() => window.BitCore.hint(window.BitGame.state));
      if (!h) break;
      await p4.click(`#board .block[data-id="${h.srcId}"]`);
      await p4.click(`#board .block[data-id="${h.dstId}"]`);
      await p4.waitForFunction(() => !window.BitGame.busy, null, { timeout: 8000 });
    }
    await p4.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 });
    const detourMoves = await p4.evaluate(() => window.BitGame.moves);
    const detourPar = await p4.evaluate(n => window.BitLevels[n].par, detour.level);
    ok(detourMoves === detourPar + 1,
      '遠回りで ' + detourMoves + '手クリア（最短' + detourPar + '手）');
    ok(await p4.locator('#clear-star.blue').count() === 1, '最短でないクリアは青い星になる');
    await p4.click('#btn-replay');
    await closeOver(p4);

    // ステージ一覧での星の出かた
    await p4.click('#btn-stages');
    const stars = await p4.evaluate((d) => {
      const btns = [...document.querySelectorAll('.stage-btn')];
      const at = i => {
        const st = btns[i].querySelector('.stage-star');
        return st ? st.className.replace('stage-star ', '') : null;
      };
      const uncleared = btns.findIndex((b, i) => i !== 0 && i !== d && !b.querySelector('.stage-star'));
      return {
        gold: at(0), blue: at(d), none: uncleared, uncle: uncleared >= 0 ? at(uncleared) : 'x',
        text: btns[0].querySelector('.stage-star').textContent,
        corner: getComputedStyle(btns[0].querySelector('.stage-star')).position
      };
    }, detour.level);
    ok(stars.gold === 'gold', 'ステージ1（最短クリア）は金の星（' + stars.gold + '）');
    ok(stars.blue === 'blue',
      'ステージ' + (detour.level + 1) + '（遠回りクリア）は青い星（' + stars.blue + '）');
    ok(stars.uncle === null, '未クリアのステージには星がつかない');
    ok(stars.text === '★' && stars.corner === 'absolute', '星は★でボタンの角に重ねて表示される');
    await p4.click('#btn-stage-close');

    // 星はリロードしても残る
    await p4.reload();
    await leaveHome(p4);
    await closeTutorial(p4);
    await p4.click('#btn-stages');
    const goldAfter = await p4.locator('.stage-btn .stage-star.gold').count();
    ok(goldAfter >= 1, 'リロードしても星が残る（金 ' + goldAfter + ' 個）');
    await ctx4.close();
  }

  console.log('\n=== ホーム画面 ===');
  {
    const ctx5 = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const p5 = await ctx5.newPage();
    await p5.goto(base);

    ok(await p5.locator('#home-screen').isVisible(), '起動するとホーム画面が出る');
    ok(!(await p5.locator('#tutorial-modal').isVisible()),
      'ホーム画面の裏でチュートリアルが開いたりしない');
    ok(await p5.textContent('#home-continue-label') === 'はじめる',
      '初回は「はじめる」と表示される');
    ok((await p5.textContent('#home-continue-sub')).indexOf('STAGE 1') === 0,
      'STAGE 1 から始まる');

    // ホームからステージ選択
    await p5.click('#btn-home-stages');
    await p5.waitForTimeout(100);
    ok(await p5.locator('#stage-modal').isVisible(), 'ホームからステージ選択を開ける');
    await p5.click('#btn-stage-close');
    await p5.waitForTimeout(100);
    ok(await p5.locator('#home-screen').isVisible(), '閉じるとホームに戻る');

    // ホームからあそびかた
    await p5.click('#btn-home-help');
    await p5.waitForTimeout(100);
    ok(await p5.locator('#help-modal').isVisible(), 'ホームからあそびかたを開ける');
    await p5.click('#btn-help-close');

    // はじめる → 遊べる状態になり、チュートリアルが出る
    await p5.click('#btn-home-continue');
    await p5.waitForTimeout(150);
    ok(!(await p5.locator('#home-screen').isVisible()), '「はじめる」でホームが閉じる');
    ok(await p5.locator('#tutorial-modal').isVisible(),
      '遊び始めたタイミングでチュートリアルが出る');
    await closeTutorial(p5);
    ok(await p5.locator('#board .block').count() > 0, '盤面が操作できる状態になる');

    // ステージ1をクリアしてホームへ戻ると「つづきから」になる
    const h5 = await p5.evaluate(() => window.BitCore.hint(window.BitGame.state));
    await p5.click(`#board .block[data-id="${h5.srcId}"]`);
    await p5.click(`#board .block[data-id="${h5.dstId}"]`);
    await p5.waitForSelector('#clear-modal:not([hidden])', { timeout: 3000 });
    await p5.click('#btn-next');
    await p5.click('#btn-home');
    await p5.waitForTimeout(120);
    ok(await p5.locator('#home-screen').isVisible(), 'ヘッダーの「ホーム」でホームに戻れる');
    ok(await p5.textContent('#home-continue-label') === 'つづきから',
      'クリア後は「つづきから」になる');
    ok((await p5.textContent('#home-continue-sub')).indexOf('STAGE 2') === 0,
      'つづきからは STAGE 2 を指す');
    const stats = await p5.evaluate(() => ({
      cleared: document.getElementById('home-cleared').textContent,
      gold: document.getElementById('home-gold').textContent,
      blue: document.getElementById('home-blue').textContent
    }));
    ok(stats.cleared === '1' && stats.gold === '1' && stats.blue === '0',
      'ホームにクリア数と星の数が出る（クリア' + stats.cleared + ' 金' + stats.gold + ' 青' + stats.blue + '）');

    // つづきから → STAGE 2 が始まる
    await p5.click('#btn-home-continue');
    await p5.waitForTimeout(120);
    await closeTutorial(p5);
    ok(await p5.textContent('#stage-no') === '2', '「つづきから」で STAGE 2 が始まる');

    // リロードしてもホームから再開できる
    await p5.reload();
    await p5.waitForTimeout(150);
    ok(await p5.locator('#home-screen').isVisible(), 'リロード後もホーム画面から始まる');

    // データの初期化
    const pos = await p5.evaluate(() => {
      const b = document.getElementById('btn-reset-data').getBoundingClientRect();
      return { right: window.innerWidth - b.right, bottom: window.innerHeight - b.bottom };
    });
    ok(pos.right < 40 && pos.bottom < 40,
      '「データを初期化」がホーム画面の右下にある（右' + Math.round(pos.right) + ' 下' + Math.round(pos.bottom) + '）');

    await p5.click('#btn-reset-data');
    await p5.waitForTimeout(100);
    ok(await p5.locator('#reset-modal').isVisible(), '確認画面が出る');
    await p5.click('#btn-reset-cancel');
    await p5.waitForTimeout(100);
    ok(await p5.textContent('#home-cleared') === '1', 'やめるを選ぶとデータは消えない');

    await p5.click('#btn-reset-data');
    await p5.click('#btn-reset-confirm');
    await p5.waitForTimeout(150);
    const afterReset = await p5.evaluate(([k]) => ({
      cleared: document.getElementById('home-cleared').textContent,
      gold: document.getElementById('home-gold').textContent,
      label: document.getElementById('home-continue-label').textContent,
      sub: document.getElementById('home-continue-sub').textContent,
      stored: localStorage.getItem(k)
    }), [STORE_KEY]);
    ok(afterReset.cleared === '0' && afterReset.gold === '0', '初期化するとクリア数と星が0に戻る');
    ok(afterReset.label === 'はじめる' && afterReset.sub.indexOf('STAGE 1') === 0,
      '初期化後は STAGE 1 から「はじめる」になる');
    ok(JSON.parse(afterReset.stored).cleared.length === 0, '保存データも消える');

    // 初期化したのでチュートリアルもまた出る
    await p5.click('#btn-home-continue');
    await p5.waitForTimeout(150);
    ok(await p5.locator('#tutorial-modal').isVisible(), '初期化後はチュートリアルもまた出る');
    await closeTutorial(p5);

    await p5.reload();
    await p5.waitForTimeout(150);
    ok(await p5.textContent('#home-cleared') === '0', 'リロードしても初期化された状態が残る');
    await ctx5.close();
  }

  console.log('\n=== 進行状況の保存 ===');
  {
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(base);
    await leaveHome(p2);
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
    await leaveHome(p2);
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
