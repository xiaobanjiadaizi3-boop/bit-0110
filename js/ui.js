/*
 * ui.js — 盤面の描画と操作（ドラッグ / タップ選択）。
 */
(function () {
  'use strict';

  var Core = window.BitCore;
  var LEVELS = window.BitLevels;
  var Tutorial = window.BitTutorial;
  var WORLDS = LEVELS.worlds || [{ tag: '', name: '', start: 0, count: LEVELS.length }];
  var STORE_KEY = 'bit0110.progress.v2';
  var ANIM_MS = 260;

  var G = {
    index: 0,
    level: null,
    state: null,
    history: [],
    moves: 0,
    selected: null,   // 選択中のブロックid
    drag: null,       // {id, el, moved}
    busy: false,
    hint: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board');
  var ghost = $('drag-ghost');

  /* ---------------- 進行状況の保存 ---------------- */
  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var p = raw ? JSON.parse(raw) : null;
      if (p && Array.isArray(p.cleared)) {
        if (!Array.isArray(p.seenTutorials)) p.seenTutorials = [];
        if (!p.best || typeof p.best !== 'object') p.best = {};
        return p;
      }
    } catch (e) { /* localStorageが使えない環境でも遊べるようにする */ }
    return { cleared: [], last: 0, seenTutorials: [], best: {} };
  }

  function saveProgress(p) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  var progress = loadProgress();

  function isUnlocked(i) {
    return i === 0 || progress.cleared.indexOf(i - 1) !== -1 || progress.cleared.indexOf(i) !== -1;
  }

  /* ---------------- 描画 ---------------- */
  function bitsHTML(bits) {
    var s = Core.toBits(bits);
    var html = '<div class="bits">';
    for (var i = 0; i < s.length; i++) {
      html += '<span class="bit bit-' + s[i] + '">' + s[i] + '</span>';
    }
    return html + '</div>';
  }

  function blockLabel(b) {
    return b.type === 'bad' ? '悪' : b.type.toUpperCase();
  }

  function blockEl(b) {
    var el = document.createElement('div');
    el.className = 'block block-' + b.type + (Core.TYPES[b.type].movable ? ' movable' : '');
    el.dataset.id = b.id;
    el.style.gridColumn = (b.x + 1);
    el.style.gridRow = (b.y + 1);
    var inner = '<span class="block-label">' + blockLabel(b) + '</span>';
    inner += b.type === 'not' ? '<span class="not-mark">~</span>' : bitsHTML(b.bits);
    el.innerHTML = inner;
    return el;
  }

  function render() {
    var s = G.state;
    board.innerHTML = '';
    board.style.gridTemplateColumns = 'repeat(' + s.w + ', var(--cell))';

    for (var y = 0; y < s.h; y++) {
      for (var x = 0; x < s.w; x++) {
        var cell = document.createElement('div');
        cell.className = 'cell' + (Core.isWall(s, x, y) ? ' wall' : '');
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.style.gridColumn = (x + 1);
        cell.style.gridRow = (y + 1);
        board.appendChild(cell);
      }
    }

    s.blocks.forEach(function (b) { board.appendChild(blockEl(b)); });

    if (G.selected !== null) {
      var selEl = board.querySelector('.block[data-id="' + G.selected + '"]');
      if (selEl) selEl.classList.add('selected');
      markTargets(G.selected, 'target-ok');
    }
    if (G.hint) {
      var hs = board.querySelector('.block[data-id="' + G.hint.srcId + '"]');
      var hd = board.querySelector('.block[data-id="' + G.hint.dstId + '"]');
      if (hs) hs.classList.add('hint-src');
      if (hd) hd.classList.add('hint-dst');
    }

    $('move-count').textContent = G.moves;
    $('par-count').textContent = G.level.par;
    $('bad-count').textContent = s.blocks.filter(function (b) { return b.type === 'bad'; }).length;
    $('btn-undo').disabled = G.history.length === 0;
  }

  function markTargets(srcId, cls) {
    var src = Core.findBlock(G.state, srcId);
    if (!src) return;
    G.state.blocks.forEach(function (b) {
      if (!Core.canApply(src, b)) return;
      var el = board.querySelector('.block[data-id="' + b.id + '"]');
      if (el) el.classList.add(cls);
    });
    // 空きマスも移動先として光らせる
    Array.prototype.forEach.call(board.querySelectorAll('.cell'), function (cell) {
      var x = +cell.dataset.x, y = +cell.dataset.y;
      if (Core.canMoveTo(G.state, src, x, y) && !Core.blockAt(G.state, x, y)) {
        cell.classList.add('drop-ok');
      }
    });
  }

  /* ---------------- プレビュー文 ---------------- */
  function name(b) {
    if (b.type === 'not') return 'NOT';
    return (b.type === 'bad' ? '悪' : b.type.toUpperCase()) + Core.toBits(b.bits);
  }

  function setPreview(text, warn) {
    var el = $('preview');
    el.innerHTML = text || '&nbsp;';
    el.classList.toggle('warn', !!warn);
  }

  function describe(src, dst) {
    var pv = Core.previewApply(src, dst);
    if (!pv) return '';
    var head = name(src) + ' → ' + name(dst) + ' = ';
    if (pv.defeated) return head + Core.toBits(pv.after) + ' 撃破！';
    var tail = (dst.type === 'bad' ? '悪' : dst.type.toUpperCase()) + Core.toBits(pv.after);
    return head + tail + (pv.unchanged ? '（変化なし）' : '');
  }

  /* ---------------- 操作 ---------------- */
  function clearSelection() {
    G.selected = null;
    G.hint = null;
    setPreview('');
    render();
  }

  function tryApply(srcId, dstId) {
    if (G.busy) return;
    var src = Core.findBlock(G.state, srcId);
    var dst = Core.findBlock(G.state, dstId);
    if (!Core.canApply(src, dst)) return;

    var pv = Core.previewApply(src, dst);
    var srcEl = board.querySelector('.block[data-id="' + srcId + '"]');
    var dstEl = board.querySelector('.block[data-id="' + dstId + '"]');
    if (srcEl) srcEl.classList.add('vanish');
    if (dstEl) dstEl.classList.add(pv.defeated ? 'vanish' : 'hit');

    G.busy = true;
    G.selected = null;
    G.hint = null;
    setPreview(describe(src, dst));

    setTimeout(function () {
      G.history.push(Core.cloneState(G.state));
      G.state = Core.applyBlock(G.state, srcId, dstId);
      G.moves++;
      G.busy = false;
      render();
      checkStatus();
    }, ANIM_MS);
  }

  function tryMove(id, x, y) {
    if (G.busy) return;
    var next = Core.moveBlock(G.state, id, x, y);
    if (!next) return;
    // 位置替えは手数に数えない（パズルの本質はbit演算のほう）
    G.state = next;
    G.selected = null;
    setPreview('');
    render();
  }

  function checkStatus() {
    $('over-modal').hidden = true;
    if (Core.isCleared(G.state)) return onClear();
    if (Core.solve(G.state) === null) {
      setPreview('');
      $('btn-over-undo').disabled = G.history.length === 0;
      setTimeout(function () { $('over-modal').hidden = false; }, 280);
    }
  }

  function onClear() {
    if (progress.cleared.indexOf(G.index) === -1) progress.cleared.push(G.index);
    var prevBest = progress.best[G.index];
    if (prevBest === undefined || G.moves < prevBest) progress.best[G.index] = G.moves;
    progress.last = Math.min(G.index + 1, LEVELS.length - 1);
    saveProgress(progress);

    var perfect = G.moves <= G.level.par;
    var star = $('clear-star');
    star.textContent = '★';
    star.className = 'clear-star ' + (perfect ? 'gold' : 'blue');
    $('clear-text').textContent = perfect
      ? G.moves + '手（最短）でクリア！ 金の星を獲得'
      : G.moves + '手でクリア（最短は' + G.level.par + '手）';
    $('btn-next').style.display = G.index < LEVELS.length - 1 ? '' : 'none';
    if (G.index === LEVELS.length - 1) {
      $('clear-text').textContent += ' — 全' + LEVELS.length + 'ステージ制覇！';
    }
    setTimeout(function () { $('clear-modal').hidden = false; }, 260);
  }

  /* ---------------- ポインタ操作 ---------------- */
  var DRAG_THRESHOLD = 6;
  var start = null;

  // ドラッグ中に指先へ付いてくる分身
  function showGhost(block) {
    var el = blockEl(block);
    el.style.gridColumn = '';
    el.style.gridRow = '';
    el.removeAttribute('data-id');   // 盤面のブロックとIDが重複しないようにする
    ghost.innerHTML = '';
    ghost.appendChild(el);
    ghost.hidden = false;
  }

  function hideGhost() {
    ghost.hidden = true;
    ghost.innerHTML = '';
  }

  board.addEventListener('pointerdown', function (ev) {
    if (G.busy) return;
    var el = ev.target.closest('.block');
    if (el) {
      // 悪ブロックは動かせないが、タップで「対象」に選べる必要がある
      start = {
        id: +el.dataset.id,
        x: ev.clientX,
        y: ev.clientY,
        el: el,
        moved: false,
        movable: el.classList.contains('movable')
      };
      ev.preventDefault();
      return;
    }
    // ブロック以外を押したら選択解除の準備
    start = null;
  });

  document.addEventListener('pointermove', function (ev) {
    if (!start || !start.movable) return;
    var dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    if (!start.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

    if (!start.moved) {
      start.moved = true;
      G.selected = start.id;
      G.hint = null;
      render();
      var live = board.querySelector('.block[data-id="' + start.id + '"]');
      if (live) live.classList.add('dragging');
      showGhost(Core.findBlock(G.state, start.id));
    }

    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';

    var over = hitTest(ev.clientX, ev.clientY);
    var src = Core.findBlock(G.state, start.id);
    if (over && over.block && Core.canApply(src, over.block)) {
      setPreview(describe(src, over.block));
    } else {
      setPreview('');
    }
  });

  document.addEventListener('pointerup', function (ev) {
    if (!start) {
      // 盤外/空白のクリックで選択解除
      if (G.selected !== null && !ev.target.closest('.block')) clearSelection();
      return;
    }
    var s = start;
    start = null;

    if (!s.moved) return handleTap(s.id);

    hideGhost();
    var over = hitTest(ev.clientX, ev.clientY);
    var src = Core.findBlock(G.state, s.id);

    if (over && over.block && Core.canApply(src, over.block)) {
      tryApply(s.id, over.block.id);
    } else if (over && over.cell && !Core.blockAt(G.state, over.cell.x, over.cell.y)) {
      tryMove(s.id, over.cell.x, over.cell.y);
    } else {
      G.selected = null;
      setPreview('');
      render();
    }
  });

  document.addEventListener('pointercancel', function () {
    if (start && start.moved) { hideGhost(); G.selected = null; render(); }
    start = null;
  });

  // 座標からセル / ブロックを求める
  function hitTest(cx, cy) {
    var el = document.elementFromPoint(cx, cy);
    if (!el) return null;
    var blockNode = el.closest('.block');
    if (blockNode) {
      var b = Core.findBlock(G.state, +blockNode.dataset.id);
      if (b) return { block: b, cell: { x: b.x, y: b.y } };
    }
    var cellNode = el.closest('.cell');
    if (cellNode) return { block: null, cell: { x: +cellNode.dataset.x, y: +cellNode.dataset.y } };
    return null;
  }

  // タップ（動かさずに離した）ときの挙動
  function handleTap(id) {
    var b = Core.findBlock(G.state, id);
    if (!b) return;

    if (G.selected === null) {
      if (!Core.TYPES[b.type].movable) {
        // 悪ブロックを単体でタップ → 情報表示だけ
        setPreview(name(b) + ' — 0000 か 1111 にすれば撃破');
        return;
      }
      G.selected = id;
      G.hint = null;
      setPreview('');
      render();
      return;
    }

    if (G.selected === id) return clearSelection();

    var src = Core.findBlock(G.state, G.selected);
    if (src && Core.canApply(src, b)) return tryApply(src.id, b.id);
    // 対象にできないブロックなら、動かせるものだけ選び直す
    if (Core.TYPES[b.type].movable) {
      G.selected = id;
      setPreview('');
      render();
    }
  }

  // 選択中に空きマスをタップしたら移動
  board.addEventListener('click', function (ev) {
    if (G.selected === null || G.busy) return;
    if (ev.target.closest('.block')) return;
    var cellNode = ev.target.closest('.cell');
    if (!cellNode) return;
    tryMove(G.selected, +cellNode.dataset.x, +cellNode.dataset.y);
  });

  board.addEventListener('pointerover', function (ev) {
    if (G.selected === null || (start && start.moved)) return;
    var el = ev.target.closest('.block');
    if (!el) return;
    var src = Core.findBlock(G.state, G.selected);
    var dst = Core.findBlock(G.state, +el.dataset.id);
    if (src && dst && Core.canApply(src, dst)) setPreview(describe(src, dst));
  });

  /* ---------------- ステージ制御 ---------------- */
  function loadLevel(i, silent) {
    $('home-screen').hidden = true;
    G.index = i;
    G.level = LEVELS[i];
    G.state = Core.createState(G.level);
    G.history = [];
    G.moves = 0;
    G.selected = null;
    G.hint = null;
    G.busy = false;
    $('stage-no').textContent = i + 1;
    $('stage-total').textContent = LEVELS.length;
    $('world-name').textContent = (WORLDS[G.level.world] || WORLDS[0]).name;
    $('stage-name').textContent = G.level.name;
    $('stage-tip').textContent = G.level.tip || '';
    $('over-modal').hidden = true;
    $('clear-modal').hidden = true;
    setPreview('');
    render();
    progress.last = i;
    saveProgress(progress);
    if (!silent) maybeTutorial(i);
  }

  /* そのステージに初めて出てくるブロックのチュートリアルを順に出す */
  function maybeTutorial(i) {
    if (!Tutorial) return;
    var pending = Tutorial.keysForLevel(LEVELS[i]).filter(function (k) {
      return progress.seenTutorials.indexOf(k) === -1;
    });
    if (!pending.length) return;
    pending.forEach(function (k) { progress.seenTutorials.push(k); });
    saveProgress(progress);
    Tutorial.open(pending);
  }

  function undo() {
    if (G.busy || !G.history.length) return;
    G.state = G.history.pop();
    G.moves = Math.max(0, G.moves - 1);
    G.selected = null;
    G.hint = null;
    $('over-modal').hidden = true;
    setPreview('');
    render();
    checkStatus();
  }

  $('btn-undo').addEventListener('click', undo);
  $('btn-reset').addEventListener('click', function () { loadLevel(G.index); });
  $('btn-over-undo').addEventListener('click', undo);
  $('btn-over-retry').addEventListener('click', function () { loadLevel(G.index); });
  $('btn-over-stages').addEventListener('click', function () {
    $('over-modal').hidden = true;
    renderStageList();
    $('stage-modal').hidden = false;
  });

  // 詰んだ盤面のまま放置されないよう、ステージ選択を閉じたら詰み画面に戻す
  function isStuckNow() {
    return G.state && !Core.isCleared(G.state) && Core.solve(G.state) === null;
  }

  function closeStageModal() {
    $('stage-modal').hidden = true;
    if (!$('home-screen').hidden) return;   // ホームから開いた場合はホームのまま
    if (isStuckNow()) $('over-modal').hidden = false;
  }

  $('btn-hint').addEventListener('click', function () {
    if (G.busy) return;
    var h = Core.hint(G.state);
    if (!h) {
      G.hint = null;
      setPreview(Core.isCleared(G.state) ? 'クリア済み' : 'この盤面はもう解けない（詰み）', true);
      render();
      return;
    }
    G.hint = h;
    G.selected = null;
    render();
    setPreview(describe(Core.findBlock(G.state, h.srcId), Core.findBlock(G.state, h.dstId)));
  });

  $('btn-next').addEventListener('click', function () {
    $('clear-modal').hidden = true;
    if (G.index < LEVELS.length - 1) loadLevel(G.index + 1);
  });
  $('btn-replay').addEventListener('click', function () {
    $('clear-modal').hidden = true;
    loadLevel(G.index);
  });

  /* ---------------- ホーム画面 ---------------- */
  function starCounts() {
    var gold = 0, blue = 0;
    progress.cleared.forEach(function (i) {
      if (starFor(i) === 'gold') gold++; else blue++;
    });
    return { gold: gold, blue: blue };
  }

  function showHome() {
    var n = starCounts();
    var resume = isUnlocked(progress.last) ? progress.last : 0;
    $('home-total').textContent = LEVELS.length;
    $('home-cleared').textContent = progress.cleared.length;
    $('home-gold').textContent = n.gold;
    $('home-blue').textContent = n.blue;
    $('home-continue-label').textContent = progress.cleared.length ? 'つづきから' : 'はじめる';
    $('home-continue-sub').textContent = 'STAGE ' + (resume + 1) + ' — ' + LEVELS[resume].name;
    $('clear-modal').hidden = true;
    $('over-modal').hidden = true;
    $('stage-modal').hidden = true;
    $('home-screen').hidden = false;
  }

  $('btn-home').addEventListener('click', showHome);
  $('btn-home-continue').addEventListener('click', function () {
    loadLevel(isUnlocked(progress.last) ? progress.last : 0);
  });
  $('btn-home-stages').addEventListener('click', function () {
    renderStageList();
    $('stage-modal').hidden = false;
  });
  $('btn-home-help').addEventListener('click', function () { $('help-modal').hidden = false; });

  /* クリア状況に応じた星。最短手数なら金、それ以外のクリアは青。 */
  function starFor(i) {
    if (progress.cleared.indexOf(i) === -1) return null;
    var best = progress.best[i];
    return (best !== undefined && best <= LEVELS[i].par) ? 'gold' : 'blue';
  }

  /* ステージ選択（ワールドごとにまとめて表示） */
  function renderStageList() {
    var list = $('stage-list');
    list.innerHTML = '';
    WORLDS.forEach(function (wd) {
      var clearedInWorld = 0;
      for (var j = wd.start; j < wd.start + wd.count; j++) {
        if (progress.cleared.indexOf(j) !== -1) clearedInWorld++;
      }
      var head = document.createElement('div');
      head.className = 'world-head';
      head.textContent = wd.name + '（' + clearedInWorld + '/' + wd.count + '）';
      list.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'world-grid';
      for (var i = wd.start; i < wd.start + wd.count; i++) {
        (function (i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'stage-btn' +
            (progress.cleared.indexOf(i) !== -1 ? ' cleared' : '') +
            (i === G.index ? ' current' : '');
          b.textContent = i + 1;
          b.disabled = !isUnlocked(i);
          var star = starFor(i);
          if (star) {
            var sp = document.createElement('span');
            sp.className = 'stage-star ' + star;
            sp.textContent = '★';
            b.appendChild(sp);
          }
          b.title = !isUnlocked(i) ? 'まだ開放されていない'
            : LEVELS[i].name + (star === 'gold' ? '（最短クリア）' : star ? '（クリア済み）' : '');
          b.addEventListener('click', function () {
            $('stage-modal').hidden = true;
            loadLevel(i);
          });
          grid.appendChild(b);
        })(i);
      }
      list.appendChild(grid);
    });
    // 現在のステージが見える位置までスクロール
    setTimeout(function () {
      var cur = list.querySelector('.stage-btn.current');
      if (cur) cur.scrollIntoView({ block: 'center' });
    }, 0);
  }

  $('btn-stages').addEventListener('click', function () {
    renderStageList();
    $('stage-modal').hidden = false;
  });
  $('btn-stage-close').addEventListener('click', closeStageModal);
  // 「あそびかた」= チュートリアル一覧。ここからいつでも見返せる。
  Tutorial.buildMenu($('help-list'), function (key) {
    $('help-modal').hidden = true;
    Tutorial.open(key);
  });
  $('btn-help').addEventListener('click', function () { $('help-modal').hidden = false; });
  $('btn-help-close').addEventListener('click', function () { $('help-modal').hidden = true; });

  // モーダルの外側をクリックで閉じる（クリア画面は誤操作防止のため除く）
  $('help-modal').addEventListener('click', function (ev) {
    if (ev.target === this) this.hidden = true;
  });
  $('stage-modal').addEventListener('click', function (ev) {
    if (ev.target === this) closeStageModal();
  });

  document.addEventListener('keydown', function (ev) {
    if (Tutorial && Tutorial.isOpen()) return;   // チュートリアル中はゲーム側のキー操作を止める
    if (ev.key === 'Escape') {
      if (!$('stage-modal').hidden) closeStageModal();
      $('help-modal').hidden = true;
      clearSelection();
    } else if (ev.key === 'z' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      undo();
    } else if (ev.key === 'r') {
      loadLevel(G.index);
    }
  });

  // デバッグ・自動テスト用に内部状態を公開する
  window.BitGame = G;
  window.BitGame.loadLevel = loadLevel;

  /* 起動: 盤面を用意したうえでホーム画面を出す
   * （チュートリアルはホームを抜けて実際に遊び始めてから出す） */
  Tutorial.init();
  loadLevel(isUnlocked(progress.last) ? progress.last : 0, true);
  showHome();
})();
