#!/usr/bin/env node
/*
 * test/verify.js — 全ステージをソルバーで検証する。
 *   node test/verify.js [--verbose]
 *
 * チェック内容:
 *   1. 盤面の整合性（範囲外・壁の上・重なり・bitの書式・ワールドで許可された種類か）
 *   2. 解けること、par が実際の最短手数と一致すること（Core.solve と独立実装の両方で）
 *   3. 全到達状態について、独立実装の最短手数が「クリアから逆向きの不動点計算」と一致
 *   4. ヒントの初手が最短を保つこと（節目のステージは最後までヒントで完走）
 *   5. ワールド内で難易度（par・詰み率）が段階的に上がっていること
 */
'use strict';

var Core = require('../js/core.js');
var levels = require('../js/levels.js');
var worlds = levels.worlds;
var VERBOSE = process.argv.indexOf('--verbose') !== -1;

var failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  return cond;
}

/* ---------------- 独立実装の抽象ソルバー（全ステージ共有のメモ） ---------------- */
function nodeOf(state) {
  var bads = [], ops = [];
  state.blocks.forEach(function (b) {
    if (b.type === 'bad') bads.push(b.bits);
    else ops.push(b.type + ':' + (b.bits === null ? '-' : b.bits));
  });
  bads.sort(function (a, b) { return a - b; });
  ops.sort();
  return { bads: bads, ops: ops };
}
var keyOf = function (n) { return n.bads.join(',') + '|' + n.ops.join(','); };

function parseOp(o) {
  var i = o.indexOf(':');
  var b = o.slice(i + 1);
  return { type: o.slice(0, i), bits: b === '-' ? null : +b };
}

function succ(node) {
  var out = [];
  for (var i = 0; i < node.ops.length; i++) {
    var src = parseOp(node.ops[i]);
    var rest = node.ops.slice(0, i).concat(node.ops.slice(i + 1));
    for (var j = 0; j < node.bads.length; j++) {
      var nb = Core.operate(src.type, node.bads[j], src.bits);
      var bads = node.bads.slice();
      if (Core.isDefeated(nb)) bads.splice(j, 1); else bads[j] = nb;
      bads.sort(function (a, b) { return a - b; });
      out.push({ bads: bads, ops: rest.slice() });
    }
    for (var k = 0; k < rest.length; k++) {
      var dst = parseOp(rest[k]);
      if (dst.bits === null) continue;
      var ops = rest.slice();
      ops[k] = dst.type + ':' + Core.operate(src.type, dst.bits, src.bits);
      ops.sort();
      out.push({ bads: node.bads.slice(), ops: ops });
    }
  }
  return out;
}

var MEMO = new Map();
function solveNode(node) {
  if (node.bads.length === 0) return 0;
  if (node.ops.length === 0) return null;
  var k = keyOf(node);
  if (MEMO.has(k)) return MEMO.get(k);
  MEMO.set(k, null);
  var best = null;
  succ(node).forEach(function (s) {
    var r = solveNode(s);
    if (r !== null && (best === null || r + 1 < best)) best = r + 1;
  });
  MEMO.set(k, best);
  return best;
}

/* ---------------- 盤面の整合性 ---------------- */
function validateLayout(lv, idx) {
  var tag = 'ステージ' + (idx + 1);
  var seen = {};
  var allowed = worlds[lv.world];
  check(allowed !== undefined, tag + ': world番号が不正 ' + lv.world);

  lv.blocks.forEach(function (b, i) {
    var where = tag + ' ブロック#' + i + '(' + b.type + ')';
    check(Core.TYPES[b.type] !== undefined, where + ': 未知のtype');
    if (Core.TYPES[b.type] && Core.TYPES[b.type].hasBits) {
      check(/^[01]{4}$/.test(b.bits || ''), where + ': bitsは4桁の0/1が必要 (' + b.bits + ')');
    } else {
      check(b.bits === undefined, where + ': NOTはbitsを持たない');
    }
    check(b.x >= 0 && b.x < lv.w && b.y >= 0 && b.y < lv.h, where + ': 盤外');
    var key = b.x + ',' + b.y;
    check(!seen[key], where + ': 座標が重複 ' + key);
    seen[key] = true;
    check(!(lv.walls || []).some(function (w) { return w[0] === b.x && w[1] === b.y; }),
      where + ': 壁の上に配置');
  });
  (lv.walls || []).forEach(function (w) {
    check(w[0] >= 0 && w[0] < lv.w && w[1] >= 0 && w[1] < lv.h, tag + ': 壁が盤外');
  });
  var free = lv.w * lv.h - (lv.walls || []).length - lv.blocks.length;
  check(free >= 1, tag + ': 空きマスがない');
  check(lv.blocks.some(function (b) { return b.type === 'bad'; }), tag + ': 悪ブロックがない');

  // ワールドで許可されたブロックだけを使っているか
  var KINDS = { OR: ['or'], NOT: ['or', 'not'], AND: ['or', 'not', 'and'], XOR: ['or', 'not', 'and', 'xor'] };
  if (allowed && KINDS[allowed.tag]) {
    lv.blocks.forEach(function (b) {
      if (b.type === 'bad') return;
      check(KINDS[allowed.tag].indexOf(b.type) !== -1,
        tag + ': ' + allowed.name + ' で ' + b.type + ' は使えない');
    });
  }
}

/* ---------------- 到達可能な状態の統計 + 逆向き不動点との突き合わせ ---------------- */
function exploreAndCrossCheck(root, idx) {
  var nodes = new Map();   // key -> {node, edges: [key], cleared}
  var order = [];

  (function walk(n) {
    var k = keyOf(n);
    if (nodes.has(k)) return k;
    var rec = { node: n, edges: [], cleared: n.bads.length === 0 };
    nodes.set(k, rec);
    order.push(k);
    if (!rec.cleared) {
      succ(n).forEach(function (s) { rec.edges.push(walk(s)); });
    }
    return k;
  })(root);

  // クリア状態から逆向きに「勝てる状態」を不動点まで広げる
  var win = new Map();
  order.forEach(function (k) { if (nodes.get(k).cleared) win.set(k, 0); });
  var changed = true;
  while (changed) {
    changed = false;
    order.forEach(function (k) {
      var best = null;
      nodes.get(k).edges.forEach(function (e) {
        if (win.has(e) && (best === null || win.get(e) + 1 < best)) best = win.get(e) + 1;
      });
      if (best !== null && (!win.has(k) || best < win.get(k))) { win.set(k, best); changed = true; }
    });
  }

  var mismatch = 0, dead = 0;
  order.forEach(function (k) {
    var a = solveNode(nodes.get(k).node);
    var b = win.has(k) ? win.get(k) : null;
    if (a !== b) mismatch++;
    if (a === null) dead++;
  });
  check(mismatch === 0, 'ステージ' + (idx + 1) + ': ソルバーが逆向き不動点計算と ' + mismatch + ' 状態で食い違う');
  return { total: order.length, dead: dead };
}

/* ---------------- ヒントで最後まで完走 ---------------- */
function walkHints(state, idx, par) {
  var s = state, guard = 0;
  while (!Core.isCleared(s)) {
    if (++guard > par + 2) return check(false, 'ステージ' + (idx + 1) + ': ヒント完走が ' + guard + ' 手を超えた');
    var h = Core.hint(s);
    if (!check(h !== null, 'ステージ' + (idx + 1) + ': ヒントが出せない')) return false;
    s = Core.applyBlock(s, h.srcId, h.dstId);
    if (!check(s !== null, 'ステージ' + (idx + 1) + ': ヒントの手が実行できない')) return false;
  }
  return check(guard === par, 'ステージ' + (idx + 1) + ': ヒント完走が ' + guard + ' 手（par ' + par + '）');
}

/* ================= 実行 ================= */
console.log('bit-0110 ステージ検証（全' + levels.length + 'ステージ）\n');
var t0 = Date.now();
var rows = [];

levels.forEach(function (lv, i) {
  validateLayout(lv, i);
  var state = Core.createState(lv);
  var root = nodeOf(state);

  var minCore = Core.solve(state);      // ゲーム内で使う実装
  var minInd = solveNode(root);         // 独立実装
  check(minCore === lv.par, 'ステージ' + (i + 1) + ': par=' + lv.par + ' だが Core.solve は ' + minCore);
  check(minInd === lv.par, 'ステージ' + (i + 1) + ': par=' + lv.par + ' だが 独立ソルバーは ' + minInd);
  if (minCore === null) return;

  var st = exploreAndCrossCheck(root, i);

  // ヒントの初手は最短を保つか
  var h = Core.hint(state);
  if (check(h !== null, 'ステージ' + (i + 1) + ': 初手ヒントが出ない')) {
    var next = Core.applyBlock(state, h.srcId, h.dstId);
    check(next !== null && solveNode(nodeOf(next)) === lv.par - 1,
      'ステージ' + (i + 1) + ': ヒントの初手が最短を崩す');
  }
  // 節目（各ワールドの最初・最後と10面ごと）はヒントで最後まで完走
  var w = worlds[lv.world];
  var inWorld = i - w.start;
  if (inWorld === 0 || inWorld === w.count - 1 || inWorld % 10 === 9) walkHints(state, i, lv.par);

  var row = { i: i, world: lv.world, par: lv.par, total: st.total, dead: st.dead,
    ratio: st.total ? st.dead / st.total : 0 };
  rows.push(row);
  if (VERBOSE) {
    console.log('  #' + String(i + 1).padStart(3) + ' ' + w.tag.padEnd(3) +
      ' par=' + lv.par + ' 状態=' + String(st.total).padStart(5) +
      ' 詰み=' + (row.ratio * 100).toFixed(0) + '% ' + lv.name);
  }
});

/* ワールドごとのまとめと難易度の傾き */
worlds.forEach(function (w, wi) {
  var rs = rows.filter(function (r) { return r.world === wi; });
  if (!rs.length) return;
  var pars = rs.map(function (r) { return r.par; });
  var ratios = rs.map(function (r) { return r.ratio; });
  console.log(
    w.name.padEnd(6) + ' ' + String(rs.length).padStart(3) + '面  par ' +
    Math.min.apply(null, pars) + '→' + Math.max.apply(null, pars) +
    '  詰み率 ' + (Math.min.apply(null, ratios) * 100).toFixed(0) + '%→' +
    (Math.max.apply(null, ratios) * 100).toFixed(0) + '%');

  // 10面ごとの平均parが下がっていないか（誤差0.35まで許容）
  for (var b = 10; b + 9 < rs.length; b += 10) {
    var prev = rs.slice(b - 10, b).reduce(function (a, r) { return a + r.par; }, 0) / 10;
    var cur = rs.slice(b, b + 10).reduce(function (a, r) { return a + r.par; }, 0) / 10;
    check(cur >= prev - 0.35,
      w.name + ': ' + (b + 1) + '面目からの平均parが下がっている (' + prev.toFixed(1) + '→' + cur.toFixed(1) + ')');
  }
  // 最初の10面と最後の10面で難易度が上がっているか
  if (rs.length >= 20) {
    var head = rs.slice(0, 10), tail = rs.slice(-10);
    var avg = function (a, f) { return a.reduce(function (s, r) { return s + f(r); }, 0) / a.length; };
    check(avg(tail, function (r) { return r.par; }) > avg(head, function (r) { return r.par; }),
      w.name + ': parが最初より最後で上がっていない');
    check(avg(tail, function (r) { return r.ratio; }) > avg(head, function (r) { return r.ratio; }),
      w.name + ': 詰み率が最初より最後で上がっていない');
  }
});

/* ステージの重複がないか */
(function () {
  var seen = {};
  levels.forEach(function (lv, i) {
    var k = keyOf(nodeOf(Core.createState(lv)));
    check(!seen[k], 'ステージ' + (i + 1) + ' がステージ' + seen[k] + ' と同一');
    seen[k] = i + 1;
  });
})();

console.log('\n検証時間 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's / 解析した状態 ' + MEMO.size);
if (failures.length) {
  console.error('\n❌ 失敗 ' + failures.length + ' 件:');
  failures.slice(0, 40).forEach(function (f) { console.error('   - ' + f); });
  process.exit(1);
}
console.log('✅ 全ステージOK（' + levels.length + 'ステージ）');
