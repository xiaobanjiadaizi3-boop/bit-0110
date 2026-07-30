/*
 * tutorial.js — 視覚チュートリアル。
 * 盤面と同じ見た目のミニブロックで、実際のドラッグ操作
 * （つかむ → 分身が指について動く → 重ねる → bitが変わる → 消える）を再現する。
 * 新しいブロックが解禁されるワールドの頭で自動的に開く。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BitTutorial = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var Core = (typeof window !== 'undefined') ? window.BitCore : null;
  var LABEL = { bad: '悪', or: 'OR', and: 'AND', xor: 'XOR', not: 'NOT' };

  /* ---------------- チュートリアルの中身 ---------------- */
  var TUTORIALS = {
    INTRO: {
      badge: 'あそびかた',
      title: 'ゲームの基本',
      menu: { name: 'あそびかた', desc: 'bit・撃破の条件・操作方法', icon: '?' },
      steps: [
        {
          title: 'ブロックは4桁のbitを持つ',
          text: '0と1が4つ並んだものが bit。赤く光っているところが 1 だ。',
          demo: { kind: 'bits', block: { type: 'bad', bits: '0101' } }
        },
        {
          title: '悪ブロックを 0000 か 1111 にする',
          text: '悪ブロックの bit を 0000 か 1111 にすると消える。盤面から悪ブロックを全部消せばクリア。',
          demo: { kind: 'goal' }
        },
        {
          title: '悪ブロック以外はドラッグで動かせる',
          text: '空いているマスへドラッグして置ける（手数には数えない）。タップで選んでから置きたいマスをタップしてもOK。',
          demo: { kind: 'move', src: { type: 'or', bits: '1010' } }
        },
        {
          title: '重ねると演算が起きる',
          text: '演算ブロックを悪ブロックの上へドラッグすると演算が起きて、重ねた側のブロックは消える。',
          demo: { kind: 'apply', src: { type: 'or', bits: '1000' }, dst: { type: 'bad', bits: '0111' } }
        },
        {
          title: '無駄打ちすると詰む',
          text: '効果のない相手に使っても、ブロックは消えてしまう。道具が足りなくなると倒せなくなる（詰み）ので、当てる前によく考えよう。',
          demo: { kind: 'apply', src: { type: 'or', bits: '0001' }, dst: { type: 'bad', bits: '0011' } }
        }
      ]
    },

    OR: {
      badge: 'NEW BLOCK',
      title: 'ORブロック',
      menu: { name: 'OR', desc: '自分が1のところを1にする' },
      steps: [
        {
          title: 'OR — 1のところを1にする',
          text: 'OR は「自分が 1 になっているけたを、相手も 1 にする」。0 のけたには何もしない。',
          demo: { kind: 'apply', src: { type: 'or', bits: '1010' }, dst: { type: 'bad', bits: '0101' } }
        },
        {
          title: '演算ブロック同士も重ねられる',
          text: '演算ブロックは他の演算ブロックにも重ねられる。種類は重ねられた側のまま、bit だけが変わる。強い道具を作ってから当てよう。',
          demo: { kind: 'apply', src: { type: 'or', bits: '0011' }, dst: { type: 'or', bits: '1100' } }
        }
      ]
    },

    NOT: {
      badge: 'NEW BLOCK',
      title: 'NOTブロック',
      menu: { name: 'NOT', desc: '相手の0と1を全部ひっくり返す' },
      steps: [
        {
          title: 'NOT — 0と1を全部ひっくり返す',
          text: 'NOT だけは bit を持たない。重ねた相手の 0 と 1 をすべて反転させる。',
          demo: { kind: 'apply', src: { type: 'not' }, dst: { type: 'bad', bits: '0110' } }
        },
        {
          title: '演算ブロックを作り替える',
          text: 'NOT は演算ブロックにも重ねられる。OR の bit を反転させれば、欲しい道具がその場で作れる。',
          demo: { kind: 'apply', src: { type: 'not' }, dst: { type: 'or', bits: '0110' } }
        },
        {
          title: 'NOT を対象にはできない',
          text: 'NOT は bit を持たないので、他のブロックを NOT に重ねることはできない。',
          demo: { kind: 'forbid', src: { type: 'or', bits: '1010' }, dst: { type: 'not' } }
        }
      ]
    },

    AND: {
      badge: 'NEW BLOCK',
      title: 'ANDブロック',
      menu: { name: 'AND', desc: '自分が0のところを0にする' },
      steps: [
        {
          title: 'AND — 0のところを0にする',
          text: 'AND は「自分が 0 になっているけたを、相手も 0 にする」。1 を削っていくブロックだ。',
          demo: { kind: 'apply', src: { type: 'and', bits: '1101' }, dst: { type: 'bad', bits: '0110' } }
        },
        {
          title: '0000 にして撃破',
          text: '1111 を作るだけが道じゃない。AND で 1 を全部削り落として 0000 にすれば撃破できる。',
          demo: { kind: 'apply', src: { type: 'and', bits: '1001' }, dst: { type: 'bad', bits: '0110' } }
        }
      ]
    },

    XOR: {
      badge: 'NEW BLOCK',
      title: 'XORブロック',
      menu: { name: 'XOR', desc: '自分が1のところを反転する' },
      steps: [
        {
          title: 'XOR — 1のところを反転する',
          text: 'XOR は「自分が 1 になっているけただけ反転させる」。0 は 1 に、1 は 0 になる。',
          demo: { kind: 'apply', src: { type: 'xor', bits: '0011' }, dst: { type: 'bad', bits: '0110' } }
        },
        {
          title: '同じbitを当てれば一撃',
          text: '相手とまったく同じ bit の XOR を当てると、全部のけたが打ち消しあって 0000 になる。',
          demo: { kind: 'apply', src: { type: 'xor', bits: '0101' }, dst: { type: 'bad', bits: '0101' } }
        }
      ]
    }
  };

  var MENU_ORDER = ['INTRO', 'OR', 'NOT', 'AND', 'XOR'];

  /* ステージ番号 → そこで出すチュートリアルのキー配列 */
  function keyForStage(levels, worlds, index) {
    for (var i = 0; i < worlds.length; i++) {
      if (worlds[i].start !== index) continue;
      return i === 0 ? ['INTRO', 'OR'] : [worlds[i].tag];
    }
    return [];
  }

  /* ---------------- ミニブロックの描画 ---------------- */
  function bitsHTML(bitsStr, changed) {
    var html = '<div class="bits">';
    for (var i = 0; i < bitsStr.length; i++) {
      html += '<span class="bit bit-' + bitsStr[i] +
        (changed && changed[i] ? ' bit-changed' : '') + '">' + bitsStr[i] + '</span>';
    }
    return html + '</div>';
  }

  function miniBlock(spec) {
    var el = document.createElement('div');
    el.className = 'block block-' + spec.type + ' demo-block';
    var h = '<span class="block-label">' + LABEL[spec.type] + '</span>';
    h += spec.type === 'not' ? '<span class="not-mark">~</span>' : bitsHTML(spec.bits);
    el.innerHTML = h;
    return el;
  }

  function setBits(el, bitsStr, changed) {
    var old = el.querySelector('.bits');
    if (old) old.outerHTML = bitsHTML(bitsStr, changed);
  }

  function diffMask(a, b) {
    var m = [];
    for (var i = 0; i < a.length; i++) m.push(a[i] !== b[i]);
    return m;
  }

  /* ---------------- ドラッグ演出の共通部品 ----------------
   * 実際のゲームと同じ挙動にする:
   *   元のブロックは薄くその場に残り、分身(ゴースト)が指について動く。 */
  function makeDragRig(stage) {
    var ghostWrap = document.createElement('div');
    ghostWrap.className = 'demo-ghost';
    var pointer = document.createElement('div');
    pointer.className = 'demo-pointer';
    stage.appendChild(ghostWrap);
    stage.appendChild(pointer);

    return {
      ghost: ghostWrap,
      pointer: pointer,
      // 元ブロックの位置にゴーストと指を置く
      anchor: function (fromEl, spec) {
        ghostWrap.innerHTML = '';
        ghostWrap.appendChild(miniBlock(spec));
        ghostWrap.style.left = fromEl.offsetLeft + 'px';
        ghostWrap.style.top = fromEl.offsetTop + 'px';
        pointer.style.left = (fromEl.offsetLeft + fromEl.offsetWidth / 2) + 'px';
        pointer.style.top = (fromEl.offsetTop + fromEl.offsetHeight * 0.78) + 'px';
        ghostWrap.style.transform = '';
        pointer.style.transform = '';
      },
      grab: function () {
        ghostWrap.classList.add('show', 'lifted');
        pointer.classList.add('show', 'pressed');
      },
      // 掴んだまま (dx,dy) へ動かす
      moveBy: function (dx, dy) {
        ghostWrap.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        pointer.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      },
      drop: function () {
        ghostWrap.classList.remove('lifted');
        pointer.classList.remove('pressed');
        pointer.classList.add('released');
      },
      hide: function () {
        ghostWrap.classList.remove('show', 'lifted');
        pointer.classList.remove('show', 'pressed', 'released');
      },
      reset: function () {
        ghostWrap.className = 'demo-ghost';
        pointer.className = 'demo-pointer';
        ghostWrap.style.transform = '';
        pointer.style.transform = '';
      }
    };
  }

  /* ---------------- デモのアニメーション ---------------- */
  // 各デモは {play, stop} を返す。play はループする。
  function buildDemo(host, demo, reduced) {
    host.innerHTML = '';
    var timers = [];
    var t = function (ms, fn) { timers.push(setTimeout(fn, ms)); };
    var clear = function () { timers.forEach(clearTimeout); timers = []; };

    var stage = document.createElement('div');
    stage.className = 'demo-stage';
    host.appendChild(stage);

    /* --- bit の説明 --- */
    if (demo.kind === 'bits') {
      var blk = miniBlock(demo.block);
      blk.classList.add('demo-big');
      stage.appendChild(blk);
      var legend = document.createElement('div');
      legend.className = 'demo-legend';
      legend.innerHTML = '<span><i class="swatch swatch-1"></i>1</span><span><i class="swatch swatch-0"></i>0</span>';
      host.appendChild(legend);
      var cells = blk.querySelectorAll('.bit');
      if (reduced) return { play: function () {}, stop: clear };
      var bitLoop = function () {
        clear();
        for (var i = 0; i < cells.length; i++) {
          (function (i) {
            t(300 + i * 380, function () {
              for (var j = 0; j < cells.length; j++) cells[j].classList.toggle('bit-focus', j === i);
            });
          })(i);
        }
        t(300 + cells.length * 380 + 500, function () {
          for (var j = 0; j < cells.length; j++) cells[j].classList.remove('bit-focus');
          t(600, bitLoop);
        });
      };
      return { play: bitLoop, stop: clear };
    }

    /* --- 撃破条件 --- */
    if (demo.kind === 'goal') {
      stage.classList.add('demo-stage-goal');
      var made = ['0000', '1111'].map(function (b) {
        var wrap = document.createElement('div');
        wrap.className = 'demo-goal-item';
        var el = miniBlock({ type: 'bad', bits: b });
        var tagEl = document.createElement('span');
        tagEl.className = 'demo-goal-tag';
        tagEl.textContent = '撃破';
        wrap.appendChild(el);
        wrap.appendChild(tagEl);
        stage.appendChild(wrap);
        return { el: el, tag: tagEl };
      });
      if (reduced) {
        made.forEach(function (m) { m.tag.classList.add('show'); });
        return { play: function () {}, stop: clear };
      }
      var goalLoop = function () {
        clear();
        made.forEach(function (m) {
          m.el.classList.remove('demo-vanish');
          m.tag.classList.remove('show');
        });
        t(500, function () { made.forEach(function (m) { m.el.classList.add('demo-hit'); }); });
        t(1000, function () { made.forEach(function (m) { m.tag.classList.add('show'); }); });
        t(1500, function () {
          made.forEach(function (m) { m.el.classList.remove('demo-hit'); m.el.classList.add('demo-vanish'); });
        });
        t(2800, goalLoop);
      };
      return { play: goalLoop, stop: clear };
    }

    /* --- 空きマスへドラッグして移動 --- */
    if (demo.kind === 'move') {
      stage.classList.add('demo-stage-move');
      var cellA = document.createElement('div');
      cellA.className = 'cell demo-cell';
      var cellB = document.createElement('div');
      cellB.className = 'cell demo-cell';
      var mv = miniBlock(demo.src);
      mv.classList.add('demo-floating');
      stage.appendChild(cellA);
      stage.appendChild(cellB);
      stage.appendChild(mv);
      var mrig = makeDragRig(stage);

      var placeMv = function () {
        mv.style.left = cellA.offsetLeft + 'px';
        mv.style.top = cellA.offsetTop + 'px';
      };
      if (reduced) {
        placeMv();
        cellB.classList.add('demo-cell-target');
        return { play: function () {}, stop: clear };
      }
      var moveLoop = function () {
        clear();
        placeMv();
        mv.classList.remove('demo-dragging');
        cellB.classList.remove('demo-cell-target');
        mrig.reset();
        mrig.anchor(mv, demo.src);
        var dx = function () { return cellB.offsetLeft - cellA.offsetLeft; };

        t(350, function () { mrig.grab(); mv.classList.add('demo-dragging'); });
        t(700, function () { mrig.moveBy(dx() * 0.5, -16); });
        // 少し上にずらして持つ。移動先のマスが隠れないようにするため
        t(1050, function () { mrig.moveBy(dx() - 8, -12); cellB.classList.add('demo-cell-target'); });
        t(1450, function () {
          mrig.drop();
          mv.classList.remove('demo-dragging');
          mv.style.left = cellB.offsetLeft + 'px';
          cellB.classList.remove('demo-cell-target');
        });
        t(1600, mrig.hide);
        t(2900, moveLoop);
      };
      return { play: moveLoop, stop: clear };
    }

    /* --- 重ねる（apply / forbid） --- */
    var srcEl = miniBlock(demo.src);
    srcEl.classList.add('demo-src');
    var arrow = document.createElement('div');
    arrow.className = 'demo-arrow';
    arrow.textContent = '▶';
    var dstEl = miniBlock(demo.dst);
    dstEl.classList.add('demo-dst');
    stage.appendChild(srcEl);
    stage.appendChild(arrow);
    stage.appendChild(dstEl);
    var rig = makeDragRig(stage);

    var badge = document.createElement('div');
    badge.className = 'demo-badge';
    host.appendChild(badge);

    var forbidden = demo.kind === 'forbid';
    var beforeStr = demo.dst.bits || '';
    var afterStr = '', changed = null, defeated = false, unchanged = false;

    if (!forbidden) {
      var srcBits = demo.src.bits === undefined ? null : parseInt(demo.src.bits, 2);
      var dstBits = parseInt(demo.dst.bits, 2);
      var after = Core.operate(demo.src.type, dstBits, srcBits);
      afterStr = Core.toBits(after);
      changed = diffMask(beforeStr, afterStr);
      defeated = demo.dst.type === 'bad' && Core.isDefeated(after);
      unchanged = after === dstBits;
    }

    var dx = function () { return dstEl.offsetLeft - srcEl.offsetLeft; };

    var reset = function () {
      srcEl.className = 'block block-' + demo.src.type + ' demo-block demo-src';
      dstEl.className = 'block block-' + demo.dst.type + ' demo-block demo-dst';
      if (!forbidden) setBits(dstEl, beforeStr, null);
      badge.className = 'demo-badge';
      badge.textContent = '';
      rig.reset();
      rig.anchor(srcEl, demo.src);
    };

    if (reduced) {
      reset();
      if (!forbidden) {
        setBits(dstEl, afterStr, changed);
        srcEl.classList.add('demo-gone');
        badge.textContent = defeated ? '撃破！' : unchanged ? '変化なし' : beforeStr + ' → ' + afterStr;
        badge.classList.add('show', defeated ? 'ok' : unchanged ? 'warn' : 'ok');
      } else {
        dstEl.classList.add('demo-no');
        badge.textContent = 'このブロックには重ねられない';
        badge.classList.add('show', 'ng');
      }
      return { play: function () {}, stop: clear };
    }

    var loop = function () {
      clear();
      reset();

      // つかむ
      t(350, function () {
        rig.grab();
        srcEl.classList.add('demo-dragging');
      });
      // 持ち上げて弧を描いて運ぶ
      t(700, function () { rig.moveBy(dx() * 0.5, -18); });
      // 対象の少し上でホバーさせる。真上に重ねると対象が完全に隠れてしまうため
      t(1050, function () {
        rig.moveBy(forbidden ? dx() - 16 : dx() - 10, -12);
        dstEl.classList.add(forbidden ? 'demo-no' : 'demo-target-ok');
      });

      if (forbidden) {
        // 受け付けないので、つかんだまま元の位置へ戻る
        t(1550, function () {
          rig.moveBy(0, 0);
          badge.textContent = 'このブロックには重ねられない';
          badge.classList.add('show', 'ng');
        });
        t(2050, function () {
          rig.hide();
          srcEl.classList.remove('demo-dragging');
        });
        t(3300, loop);
        return;
      }

      // 落として演算
      t(1450, function () {
        rig.drop();
        srcEl.classList.remove('demo-dragging');
        srcEl.classList.add('demo-consumed');
        dstEl.classList.remove('demo-target-ok');
        setBits(dstEl, afterStr, changed);
        dstEl.classList.add('demo-hit');
      });
      t(1620, rig.hide);
      t(2000, function () {
        if (defeated) dstEl.classList.add('demo-vanish');
        badge.textContent = defeated ? '撃破！'
          : unchanged ? '変化なし — ブロックだけ失った'
          : beforeStr + ' → ' + afterStr;
        badge.classList.add('show', defeated ? 'ok' : unchanged ? 'warn' : 'ok');
      });
      t(3300, loop);
    };

    return { play: loop, stop: clear };
  }

  /* ---------------- モーダル制御 ---------------- */
  var state = { key: null, step: 0, demo: null, queue: [], onClose: null };
  var $ = function (id) { return document.getElementById(id); };
  var reducedMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderStep() {
    var tut = TUTORIALS[state.key];
    var step = tut.steps[state.step];

    $('tut-badge').textContent = tut.badge;
    $('tut-badge').className = 'tut-badge' + (state.key === 'INTRO' ? '' : ' tut-badge-new');
    $('tut-kicker').textContent = tut.title;
    $('tut-title').textContent = step.title;
    $('tut-text').textContent = step.text;

    var dots = $('tut-dots');
    dots.innerHTML = '';
    tut.steps.forEach(function (_s, i) {
      var d = document.createElement('span');
      d.className = 'tut-dot' + (i === state.step ? ' active' : '') + (i < state.step ? ' done' : '');
      dots.appendChild(d);
    });

    $('btn-tut-prev').disabled = state.step === 0;
    var last = state.step === tut.steps.length - 1;
    $('btn-tut-next').textContent = last ? (state.queue.length ? '次へ' : 'はじめる') : '次へ';
    $('btn-tut-skip').style.visibility = (last && !state.queue.length) ? 'hidden' : '';

    if (state.demo) state.demo.stop();
    state.demo = buildDemo($('tut-demo'), step.demo, reducedMotion);
    // レイアウト確定後に再生（offsetLeft を使うため）
    requestAnimationFrame(function () { if (state.demo) state.demo.play(); });
  }

  // keys: 単一キーでも配列でもよい。順番に表示する。
  function open(keys, onClose) {
    var list = (Array.isArray(keys) ? keys : [keys]).filter(function (k) { return TUTORIALS[k]; });
    if (!list.length) return false;
    state.key = list[0];
    state.queue = list.slice(1);
    state.step = 0;
    state.onClose = onClose || null;
    $('tutorial-modal').hidden = false;
    renderStep();
    return true;
  }

  function close() {
    if (state.demo) { state.demo.stop(); state.demo = null; }
    state.queue = [];
    $('tutorial-modal').hidden = true;
    var cb = state.onClose;
    state.onClose = null;
    if (cb) cb();
  }

  function next() {
    var tut = TUTORIALS[state.key];
    if (state.step < tut.steps.length - 1) { state.step++; renderStep(); return; }
    if (state.queue.length) {          // 次のチュートリアルへ
      state.key = state.queue.shift();
      state.step = 0;
      renderStep();
      return;
    }
    close();
  }

  function prev() {
    if (state.step > 0) { state.step--; renderStep(); }
  }

  // スキップは今のチュートリアルだけを飛ばす（続きがあれば次へ）
  function skip() {
    if (state.queue.length) {
      state.key = state.queue.shift();
      state.step = 0;
      renderStep();
    } else close();
  }

  /* 「あそびかた」メニューの中身を作る */
  function buildMenu(host, onPick) {
    host.innerHTML = '';
    MENU_ORDER.forEach(function (key) {
      var tut = TUTORIALS[key];
      if (!tut || !tut.menu) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'help-item';
      b.dataset.tut = key;
      var icon = key === 'INTRO'
        ? '<span class="help-icon">' + tut.menu.icon + '</span>'
        : '<span class="chip chip-' + key.toLowerCase() + '">' + key + '</span>';
      b.innerHTML = icon +
        '<span class="help-body"><span class="help-name">' + tut.menu.name + '</span>' +
        '<span class="help-desc">' + tut.menu.desc + '</span></span>';
      b.addEventListener('click', function () { onPick(key); });
      host.appendChild(b);
    });
  }

  function init() {
    $('btn-tut-next').addEventListener('click', next);
    $('btn-tut-prev').addEventListener('click', prev);
    $('btn-tut-skip').addEventListener('click', skip);
    document.addEventListener('keydown', function (ev) {
      if ($('tutorial-modal').hidden) return;
      if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); next(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); prev(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
  }

  return {
    TUTORIALS: TUTORIALS,
    MENU_ORDER: MENU_ORDER,
    keyForStage: keyForStage,
    buildMenu: buildMenu,
    init: init,
    open: open,
    close: close,
    isOpen: function () { return !$('tutorial-modal').hidden; },
    _state: state
  };
});
