/*
 * tutorial.js — 視覚チュートリアル。
 * 実際のブロックと同じ見た目のミニ盤面で、重ねる→bitが変わる→消える、を
 * アニメーションで見せる。新しいブロックが解禁されるワールドの頭で出る。
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
      title: 'bit-0110 のルール',
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
          title: '重ねると演算が起きる',
          text: '演算ブロックを悪ブロックにドラッグして重ねよう。OR は「自分が 1 のところを 1 にする」。重ねた側は消える。',
          demo: { kind: 'apply', src: { type: 'or', bits: '1000' }, dst: { type: 'bad', bits: '0111' } }
        },
        {
          title: '無駄打ちすると詰む',
          text: '効果のない相手に使っても、ブロックは消えてしまう。道具が足りなくなると倒せなくなる（詰み）ので、当てる前によく考えよう。',
          demo: { kind: 'apply', src: { type: 'or', bits: '0001' }, dst: { type: 'bad', bits: '0011' } }
        },
        {
          title: '悪ブロック以外は自由に動かせる',
          text: '空いているマスへドラッグして置ける（手数には数えない）。タップで選んでから対象をタップしてもOK。',
          demo: { kind: 'move', src: { type: 'or', bits: '1010' } }
        }
      ]
    },

    NOT: {
      badge: 'NEW BLOCK',
      title: 'NOTブロック',
      steps: [
        {
          title: 'NOT — 0と1を全部ひっくり返す',
          text: 'NOT だけは bit を持たない。重ねた相手の 0 と 1 をすべて反転させる。',
          demo: { kind: 'apply', src: { type: 'not' }, dst: { type: 'bad', bits: '0110' } }
        },
        {
          title: '演算ブロックも作り替えられる',
          text: 'NOT は演算ブロックにも重ねられる。OR の bit を反転させれば、欲しい道具が作れる。種類は重ねられた側のまま変わらない。',
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
      steps: [
        {
          title: 'AND — 0のところを0にする',
          text: 'AND は「自分が 0 のところを 0 にする」。1 を削っていくブロックだ。',
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
      steps: [
        {
          title: 'XOR — 1のところを反転する',
          text: 'XOR は「自分が 1 のところだけ反転させる」。0 は 1 に、1 は 0 になる。',
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

  /* ステージ番号 → チュートリアルのキー（ワールドの先頭で出す） */
  function keyForStage(levels, worlds, index) {
    for (var i = 0; i < worlds.length; i++) {
      if (worlds[i].start !== index) continue;
      return i === 0 ? 'INTRO' : worlds[i].tag;
    }
    return null;
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
      var loop = function () {
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
          t(600, loop);
        });
      };
      return { play: loop, stop: clear };
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

    /* --- 空きマスへの移動 --- */
    if (demo.kind === 'move') {
      stage.classList.add('demo-stage-move');
      var cellA = document.createElement('div');
      cellA.className = 'cell demo-cell';
      var cellB = document.createElement('div');
      cellB.className = 'cell demo-cell demo-cell-target';
      var mv = miniBlock(demo.src);
      mv.classList.add('demo-floating');
      stage.appendChild(cellA);
      stage.appendChild(cellB);
      stage.appendChild(mv);
      var ptr = document.createElement('div');
      ptr.className = 'demo-pointer';
      stage.appendChild(ptr);

      var placeMove = function () {
        mv.style.left = cellA.offsetLeft + 'px';
        mv.style.top = cellA.offsetTop + 'px';
        ptr.style.left = (cellA.offsetLeft + cellA.offsetWidth / 2) + 'px';
        ptr.style.top = (cellA.offsetTop + cellA.offsetHeight * 0.72) + 'px';
      };
      var dxMove = function () { return cellB.offsetLeft - cellA.offsetLeft; };
      if (reduced) { placeMove(); return { play: function () {}, stop: clear }; }
      var moveLoop = function () {
        clear();
        placeMove();
        mv.classList.remove('demo-move', 'demo-grabbed');
        mv.style.transform = '';
        ptr.style.transform = '';
        ptr.classList.remove('show', 'demo-move');
        t(400, function () {
          ptr.classList.add('show');
          mv.classList.add('demo-grabbed');
        });
        t(750, function () {
          mv.classList.add('demo-move');
          ptr.classList.add('demo-move');
          mv.style.transform = 'translateX(' + dxMove() + 'px)';
          ptr.style.transform = 'translateX(' + dxMove() + 'px)';
        });
        t(1600, function () {
          mv.classList.remove('demo-grabbed');
          ptr.classList.remove('show');
        });
        t(2700, moveLoop);
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

    var pointer = document.createElement('div');
    pointer.className = 'demo-pointer';
    stage.appendChild(pointer);

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
    var placePointer = function () {
      pointer.style.left = (srcEl.offsetLeft + srcEl.offsetWidth / 2) + 'px';
      pointer.style.top = (srcEl.offsetTop + srcEl.offsetHeight * 0.72) + 'px';
    };

    var reset = function () {
      srcEl.className = 'block block-' + demo.src.type + ' demo-block demo-src';
      srcEl.style.transform = '';
      srcEl.style.removeProperty('--dx');
      dstEl.className = 'block block-' + demo.dst.type + ' demo-block demo-dst';
      if (!forbidden) setBits(dstEl, beforeStr, null);
      badge.className = 'demo-badge';
      badge.textContent = '';
      pointer.className = 'demo-pointer';
      pointer.style.transform = '';
      placePointer();
    };

    if (reduced) {
      reset();
      if (!forbidden) {
        setBits(dstEl, afterStr, changed);
        srcEl.classList.add('demo-consumed');
        badge.textContent = defeated ? '撃破！' : unchanged ? '変化なし' : beforeStr + ' → ' + afterStr;
        badge.classList.add('show', defeated ? 'ok' : unchanged ? 'warn' : 'ok');
      } else {
        badge.textContent = 'このブロックには重ねられない';
        badge.classList.add('show', 'ng');
      }
      return { play: function () {}, stop: clear };
    }

    var loop = function () {
      clear();
      reset();

      t(450, function () {
        pointer.classList.add('show');
        srcEl.classList.add('demo-grabbed');
      });
      t(800, function () {
        srcEl.classList.add('demo-move');
        pointer.classList.add('demo-move');
        var d = forbidden ? dx() - 18 : dx();
        srcEl.style.setProperty('--dx', d + 'px');   // 消えるアニメの移動量
        srcEl.style.transform = 'translateX(' + d + 'px)';
        pointer.style.transform = 'translateX(' + d + 'px)';
      });

      if (forbidden) {
        t(1500, function () {
          srcEl.classList.add('demo-reject');
          srcEl.style.transform = 'translateX(0px)';
          pointer.style.transform = 'translateX(0px)';
          dstEl.classList.add('demo-no');
          badge.textContent = 'このブロックには重ねられない';
          badge.classList.add('show', 'ng');
        });
        t(2000, function () { pointer.classList.remove('show'); });
        t(3100, loop);
        return;
      }

      t(1450, function () {
        srcEl.classList.add('demo-consumed');
        pointer.classList.remove('show');
        setBits(dstEl, afterStr, changed);
        dstEl.classList.add('demo-hit');
      });
      t(2050, function () {
        if (defeated) dstEl.classList.add('demo-vanish');
        badge.textContent = defeated ? '撃破！'
          : unchanged ? '変化なし — ブロックだけ失った'
          : beforeStr + ' → ' + afterStr;
        badge.classList.add('show', defeated ? 'ok' : unchanged ? 'warn' : 'ok');
      });
      t(3250, loop);
    };

    return { play: loop, stop: clear };
  }

  /* ---------------- モーダル制御 ---------------- */
  var state = { key: null, step: 0, demo: null, onClose: null };
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
    $('btn-tut-next').textContent = last ? 'はじめる' : '次へ';
    $('btn-tut-skip').style.visibility = last ? 'hidden' : '';

    if (state.demo) state.demo.stop();
    state.demo = buildDemo($('tut-demo'), step.demo, reducedMotion);
    // レイアウト確定後に再生（offsetLeft を使うため）
    requestAnimationFrame(function () { if (state.demo) state.demo.play(); });
  }

  function open(key, onClose) {
    if (!TUTORIALS[key]) return false;
    state.key = key;
    state.step = 0;
    state.onClose = onClose || null;
    $('tutorial-modal').hidden = false;
    renderStep();
    return true;
  }

  function close() {
    if (state.demo) { state.demo.stop(); state.demo = null; }
    $('tutorial-modal').hidden = true;
    var cb = state.onClose;
    state.onClose = null;
    if (cb) cb();
  }

  function next() {
    var tut = TUTORIALS[state.key];
    if (state.step < tut.steps.length - 1) { state.step++; renderStep(); }
    else close();
  }

  function prev() {
    if (state.step > 0) { state.step--; renderStep(); }
  }

  function init() {
    $('btn-tut-next').addEventListener('click', next);
    $('btn-tut-prev').addEventListener('click', prev);
    $('btn-tut-skip').addEventListener('click', close);
    document.addEventListener('keydown', function (ev) {
      if ($('tutorial-modal').hidden) return;
      if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); next(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); prev(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    });
  }

  return {
    TUTORIALS: TUTORIALS,
    keyForStage: keyForStage,
    init: init,
    open: open,
    close: close,
    isOpen: function () { return !$('tutorial-modal').hidden; },
    _state: state
  };
});
