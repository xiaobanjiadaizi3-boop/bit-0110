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

  // すべてのデモはこの周期でぴったり繰り返す（見せ終わってから少し余韻を置く）
  var CYCLE = 4400;

  /* そのステージで出すべきチュートリアルのキー配列。
   * ワールドの区切りではなく「盤面にそのブロックが実際に出てきたか」で決めるので、
   * ステージ選択で飛んだ先でも、初めて見るブロックの説明がきちんと出る。 */
  var BLOCK_KEYS = ['OR', 'NOT', 'AND', 'XOR'];

  function keysForLevel(level) {
    var keys = ['INTRO'];
    var present = {};
    level.blocks.forEach(function (b) { present[b.type] = true; });
    BLOCK_KEYS.forEach(function (k) { if (present[k.toLowerCase()]) keys.push(k); });
    return keys;
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

  /* ---------------- 「動かす / 重ねる先 / 結果」のスロット ---------------- */
  function addSign(stage, text) {
    var el = document.createElement('div');
    el.className = 'demo-sign';
    el.textContent = text;
    stage.appendChild(el);
    return el;
  }

  function makeSlot(stage, labelText, role) {
    var wrap = document.createElement('div');
    wrap.className = 'demo-slot' + (role ? ' demo-slot-' + role : '');
    var box = document.createElement('div');
    box.className = 'demo-slot-box';
    var label = document.createElement('span');
    label.className = 'demo-slot-label';
    label.textContent = labelText;
    wrap.appendChild(box);
    wrap.appendChild(label);
    stage.appendChild(wrap);

    var api = {
      inner: function () { return box.firstChild || box; },
      setBlock: function (node, pop) {
        box.className = 'demo-slot-box';
        box.innerHTML = '';
        if (!node) return;
        if (pop) node.classList.add('demo-pop');
        box.appendChild(node);
      },
      // 空きマス（移動先）
      setEmptyCell: function () {
        box.className = 'demo-slot-box';
        box.innerHTML = '<div class="cell demo-cell"></div>';
      },
      // 結果待ち
      setPending: function () {
        box.className = 'demo-slot-box demo-slot-pending';
        box.innerHTML = '<span class="demo-qmark">?</span>';
        label.textContent = labelText;
        label.className = 'demo-slot-label';
      },
      // 使って消えたブロック。何を使ったのか分かるよう薄く残す。
      setSpent: function (node, text) {
        box.className = 'demo-slot-box demo-slot-spent';
        box.innerHTML = '';
        if (node) box.appendChild(node);
        label.textContent = text;
        label.className = 'demo-slot-label demo-slot-label-spent';
      },
      // 出ていって空になったマス
      setGone: function (text) {
        box.className = 'demo-slot-box demo-slot-gone';
        box.innerHTML = '<span class="demo-gone-mark">' + text + '</span>';
      },
      setLabel: function (text, cls) {
        label.textContent = text;
        label.className = 'demo-slot-label' + (cls ? ' demo-slot-label-' + cls : '');
      },
      setForbidden: function () {
        box.className = 'demo-slot-box demo-slot-forbidden';
        box.innerHTML = '<span class="demo-ng-mark">×</span>';
        label.textContent = '重ねられない';
        label.className = 'demo-slot-label demo-slot-label-ng';
      },
      warn: function (text) {
        label.textContent = text;
        label.className = 'demo-slot-label demo-slot-label-warn';
      },
      dim: function (on) { box.classList.toggle('demo-slot-dim', on); },
      highlight: function (on) { box.classList.toggle('demo-slot-hot', on); },
      reject: function (on) { box.classList.toggle('demo-slot-no', on); }
    };
    return api;
  }

  /* ---------------- ドラッグ演出の共通部品 ----------------
   * 実際のゲームと同じ挙動にする:
   *   元のブロックは薄くその場に残り、分身(ゴースト)が指について動く。
   * 自動再生でも、プレイヤーが自分で掴んで動かす場合でも同じ分身を使う。 */
  function makeDragRig(stage) {
    var ghostWrap = document.createElement('div');
    ghostWrap.className = 'demo-ghost';
    var pointer = document.createElement('div');
    pointer.className = 'demo-pointer';
    stage.appendChild(ghostWrap);
    stage.appendChild(pointer);
    var home = { x: 0, y: 0 };

    return {
      ghost: ghostWrap,
      pointer: pointer,
      // 元ブロックの位置にゴーストと指を置く
      anchor: function (fromEl, spec) {
        ghostWrap.innerHTML = '';
        ghostWrap.appendChild(miniBlock(spec));
        home.x = fromEl.offsetLeft;
        home.y = fromEl.offsetTop;
        ghostWrap.style.left = home.x + 'px';
        ghostWrap.style.top = home.y + 'px';
        pointer.style.left = (home.x + fromEl.offsetWidth / 2) + 'px';
        pointer.style.top = (home.y + fromEl.offsetHeight * 0.78) + 'px';
        ghostWrap.style.transform = '';
        pointer.style.transform = '';
      },
      grab: function () {
        ghostWrap.classList.add('show', 'lifted');
        pointer.classList.add('show', 'pressed');
      },
      // 自動再生: 掴んだまま (dx,dy) へ動かす
      moveBy: function (dx, dy) {
        ghostWrap.classList.remove('free');
        ghostWrap.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        pointer.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      },
      // 手動ドラッグ: 指の位置にそのまま追従させる
      follow: function (clientX, clientY) {
        var r = stage.getBoundingClientRect();
        var w = ghostWrap.offsetWidth || 58;
        var h = ghostWrap.offsetHeight || 58;
        ghostWrap.classList.add('free');
        pointer.classList.add('free');
        ghostWrap.style.transform =
          'translate(' + (clientX - r.left - w / 2 - home.x) + 'px,' +
          (clientY - r.top - h * 0.78 - home.y) + 'px)';
        pointer.style.transform = ghostWrap.style.transform;
      },
      snapBack: function () {
        ghostWrap.classList.remove('free');
        pointer.classList.remove('free');
        ghostWrap.style.transform = '';
        pointer.style.transform = '';
      },
      drop: function () {
        ghostWrap.classList.remove('lifted');
        pointer.classList.remove('pressed');
        pointer.classList.add('released');
      },
      hide: function () {
        ghostWrap.classList.remove('show', 'lifted', 'free');
        pointer.classList.remove('show', 'pressed', 'released', 'free');
      },
      reset: function () {
        ghostWrap.className = 'demo-ghost';
        pointer.className = 'demo-pointer';
        ghostWrap.style.transform = '';
        pointer.style.transform = '';
      }
    };
  }

  /* 自分で掴んで動かせるようにする。
   * つまんだ時点で自動再生は止まり、あとはプレイヤーのペースで動かせる。 */
  function enableManualDrag(cfg) {
    var dragging = false;
    var srcEl = null;

    function overTarget(ev) {
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      return !!(el && el.closest('.demo-slot-dst'));
    }

    function onDown(ev) {
      if (cfg.isDone()) return;
      srcEl = ev.currentTarget;
      dragging = true;
      ev.preventDefault();
      cfg.onGrab();
      cfg.rig.anchor(srcEl, cfg.srcSpec);
      cfg.rig.grab();
      cfg.rig.follow(ev.clientX, ev.clientY);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }

    function onMove(ev) {
      if (!dragging) return;
      cfg.rig.follow(ev.clientX, ev.clientY);
      cfg.onHover(overTarget(ev));
    }

    function onUp(ev) {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      var hit = overTarget(ev);
      cfg.onHover(false);
      if (hit) { cfg.rig.drop(); cfg.onDrop(); }
      else { cfg.rig.snapBack(); cfg.onCancel(); }
    }

    return {
      attach: function (el) {
        el.classList.add('demo-grabbable');
        el.addEventListener('pointerdown', onDown);
      }
    };
  }

  /* ---------------- デモのアニメーション ---------------- */
  // 各デモは {play, stop, restart, cycle} を返す。
  function buildDemo(host, demo, reduced) {
    host.innerHTML = '';
    var noop = function () {};
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
      if (reduced) return { play: noop, stop: clear, restart: noop, cycle: 0 };
      var bitLoop = function () {
        clear();
        for (var i = 0; i < cells.length; i++) {
          (function (i) {
            t(400 + i * 520, function () {
              for (var j = 0; j < cells.length; j++) cells[j].classList.toggle('bit-focus', j === i);
            });
          })(i);
        }
        t(400 + cells.length * 520 + 600, function () {
          for (var j = 0; j < cells.length; j++) cells[j].classList.remove('bit-focus');
        });
        t(CYCLE, bitLoop);
      };
      return { play: bitLoop, stop: clear, restart: bitLoop, cycle: CYCLE };
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
        return { play: noop, stop: clear, restart: noop, cycle: 0 };
      }
      var goalLoop = function () {
        clear();
        made.forEach(function (m) {
          m.el.classList.remove('demo-vanish');
          m.tag.classList.remove('show');
        });
        t(700, function () { made.forEach(function (m) { m.el.classList.add('demo-hit'); }); });
        t(1400, function () { made.forEach(function (m) { m.tag.classList.add('show'); }); });
        t(2200, function () {
          made.forEach(function (m) { m.el.classList.remove('demo-hit'); m.el.classList.add('demo-vanish'); });
        });
        t(CYCLE, goalLoop);
      };
      return { play: goalLoop, stop: clear, restart: goalLoop, cycle: CYCLE };
    }

    /* --- 自分で動かせるデモ（move / apply / forbid） --- */
    var isMove = demo.kind === 'move';
    var forbidden = demo.kind === 'forbid';
    stage.classList.add('demo-stage-formula');

    var hint = document.createElement('p');
    hint.className = 'demo-hint';
    host.appendChild(hint);

    var srcSlot, dstSlot, resSlot;
    if (isMove) {
      srcSlot = makeSlot(stage, 'いまここ', 'src');
      addSign(stage, '→');
      dstSlot = makeSlot(stage, 'ここへ動かす', 'dst');
    } else {
      srcSlot = makeSlot(stage, '動かす', 'src');
      addSign(stage, '+');
      dstSlot = makeSlot(stage, '重ねる先', 'dst');
      addSign(stage, '=');
      resSlot = makeSlot(stage, '結果', 'res');
    }
    var rig = makeDragRig(stage);

    /* 演算結果を先に計算しておく */
    var beforeStr = (demo.dst && demo.dst.bits) || '';
    var afterStr = '', changed = null, defeated = false, unchanged = false;
    if (!isMove && !forbidden) {
      var srcBits = demo.src.bits === undefined ? null : parseInt(demo.src.bits, 2);
      var dstBits = parseInt(demo.dst.bits, 2);
      var after = Core.operate(demo.src.type, dstBits, srcBits);
      afterStr = Core.toBits(after);
      changed = diffMask(beforeStr, afterStr);
      defeated = demo.dst.type === 'bad' && Core.isDefeated(after);
      unchanged = after === dstBits;
    }

    function resultNode() {
      if (defeated) {
        var box = document.createElement('div');
        box.className = 'demo-defeat';
        box.innerHTML = bitsHTML(afterStr) + '<span class="demo-defeat-tag">撃破！</span>';
        return box;
      }
      var el = miniBlock({ type: demo.dst.type, bits: afterStr });
      setBits(el, afterStr, changed);
      return el;
    }

    var done = false;
    var manual = false;

    function setHint(text, cls) {
      hint.textContent = text;
      hint.className = 'demo-hint' + (cls ? ' demo-hint-' + cls : '');
    }

    /* 最初の状態に戻す */
    function setStart() {
      done = false;
      var srcBlock = miniBlock(demo.src);
      srcSlot.setBlock(srcBlock);
      srcSlot.setLabel(isMove ? 'いまここ' : '動かす');
      if (isMove) {
        dstSlot.setEmptyCell();
        dstSlot.setLabel('ここへ動かす');
      } else {
        dstSlot.setBlock(miniBlock(demo.dst));
        dstSlot.setLabel('重ねる先');
        resSlot.setPending();
      }
      rig.reset();
      rig.anchor(srcSlot.inner(), demo.src);
      dragger.attach(srcBlock);
      setHint(isMove ? '← このブロックを空きマスへドラッグしてみよう'
        : '← このブロックを「重ねる先」へドラッグしてみよう');
    }

    /* 重ねた（または置いた）ときの結果表示 */
    function resolve() {
      done = true;
      rig.hide();
      dstSlot.highlight(false);
      if (isMove) {
        srcSlot.setGone('空いた');
        dstSlot.setBlock(miniBlock(demo.src), true);
        setHint('置けた！ 位置を変えても手数は増えない', 'ok');
      } else if (forbidden) {
        done = false;                       // 何度でも試せる
        dstSlot.reject(true);
        resSlot.setForbidden();
        rig.snapBack();
        setHint('NOTはbitを持たないので重ねられない', 'ng');
        return;
      } else {
        srcSlot.setSpent(miniBlock(demo.src), '使って消えた');
        var changedBlock = miniBlock({ type: demo.dst.type, bits: afterStr });
        setBits(changedBlock, afterStr, changed);
        dstSlot.setBlock(changedBlock, true);
        dstSlot.setLabel(beforeStr + ' → ' + afterStr, unchanged ? 'warn' : 'hot');
        resSlot.setBlock(resultNode(), true);
        if (unchanged) {
          resSlot.warn('変化なし');
          setHint('効果がなくても、重ねたブロックは消えてしまう', 'warn');
        } else {
          setHint(defeated ? '0000 か 1111 になったので撃破！' : 'bitが書き換わった', 'ok');
        }
      }
      if (cfg.onDone) cfg.onDone();
    }

    var cfg = { onDone: null };

    var dragger = enableManualDrag({
      rig: rig,
      srcSpec: demo.src,
      isDone: function () { return done; },
      onGrab: function () {
        clear();                       // 自動再生を止めてプレイヤーに渡す
        if (!manual) { manual = true; if (cfg.onManual) cfg.onManual(); }
        if (done) return;
        srcSlot.dim(true);
        setHint('そのまま「' + (isMove ? '空きマス' : '重ねる先') + '」の上まで運ぼう');
      },
      onHover: function (on) {
        if (forbidden) dstSlot.reject(on); else dstSlot.highlight(on);
      },
      onDrop: resolve,
      onCancel: function () {
        srcSlot.dim(false);
        rig.hide();
        setHint('「重ねる先」の上で指をはなしてね');
      }
    });

    if (reduced) {
      setStart();
      return { play: noop, stop: clear, restart: setStart, cycle: 0, interactive: true };
    }

    /* 自動のお手本。ゆっくり動かし、プレイヤーが触ったら止まる。 */
    var loop = function () {
      clear();
      setStart();
      var dx = function () { return dstSlot.inner().offsetLeft - srcSlot.inner().offsetLeft; };

      t(800, function () { rig.grab(); srcSlot.dim(true); });
      t(1300, function () { rig.moveBy(dx() * 0.45, -22); });
      t(2000, function () {
        rig.moveBy(forbidden ? dx() - 18 : dx() - 10, -12);
        if (forbidden) dstSlot.reject(true); else dstSlot.highlight(true);
      });
      t(2800, function () { rig.drop(); resolve(); });
      t(CYCLE, loop);
    };

    return {
      play: loop,
      stop: clear,
      restart: function () { manual = false; loop(); },
      manualReset: function () { clear(); setStart(); },
      cycle: CYCLE,
      interactive: true,
      onManual: function (fn) { cfg.onManual = fn; },
      onDone: function (fn) { cfg.onDone = fn; }
    };
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

    // 自分で動かし始めたら自動再生の表示は引っこめる
    if (state.demo.onManual) {
      state.demo.onManual(function () {
        $('tut-loop').hidden = true;
        $('btn-tut-replay').classList.add('tut-replay-ready');
      });
    }

    // バーの表示は同期的に決める（描画待ちで一瞬消えて見えないように）
    $('tut-loop').hidden = !state.demo.cycle;
    $('btn-tut-replay').classList.remove('tut-replay-ready');

    // レイアウト確定後に再生（offsetLeft を使うため）
    requestAnimationFrame(function () {
      if (!state.demo) return;
      state.demo.play();
      restartLoopBar(state.demo.cycle);
    });
  }

  /* デモの繰り返しに合わせて進むバー。いつ再生し直されるかが分かるようにする。 */
  function restartLoopBar(cycle) {
    var fill = $('tut-loop-fill');
    if (!fill) return;
    var bar = $('tut-loop');
    if (!cycle) { bar.hidden = true; return; }
    bar.hidden = false;
    fill.style.animation = 'none';
    void fill.offsetWidth;                       // アニメーションを巻き戻す
    fill.style.animation = 'loopBar ' + cycle + 'ms linear infinite';
  }

  // 「もう一度」: 触って止めていた場合も含めて、最初からやり直す
  function replay() {
    if (!state.demo) return;
    $('btn-tut-replay').classList.remove('tut-replay-ready');
    state.demo.restart();
    restartLoopBar(state.demo.cycle);
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
    $('btn-tut-replay').addEventListener('click', replay);
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
    keysForLevel: keysForLevel,
    BLOCK_KEYS: BLOCK_KEYS,
    buildMenu: buildMenu,
    init: init,
    open: open,
    close: close,
    replay: replay,
    CYCLE: CYCLE,
    isOpen: function () { return !$('tutorial-modal').hidden; },
    _state: state
  };
});
