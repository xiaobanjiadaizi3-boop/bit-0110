#!/usr/bin/env node
/*
 * test/verify.js — 全ステージをソルバーで検証する。
 *   node test/verify.js
 * チェック内容:
 *   1. 盤面の整合性（範囲外・壁の上・重なり・bitの書式）
 *   2. 解けること、および par が実際の最短手数と一致すること
 *   3. 到達可能な状態のうち詰みがどれくらいあるか（難易度の目安）
 *   4. 初手の何通りが詰みにつながるか
 */
'use strict';

var Core = require('../js/core.js');
var levels = require('../js/levels.js');

var failures = [];

function check(cond, msg) {
  if (!cond) failures.push(msg);
  return cond;
}

/* 盤面の整合性 */
function validateLayout(lv, idx) {
  var tag = 'ステージ' + (idx + 1);
  var seen = {};
  lv.blocks.forEach(function (b, i) {
    var where = tag + ' ブロック#' + i + '(' + b.type + ')';
    check(Core.TYPES[b.type] !== undefined, where + ': 未知のtype ' + b.type);
    if (Core.TYPES[b.type] && Core.TYPES[b.type].hasBits) {
      check(/^[01]{4}$/.test(b.bits || ''), where + ': bitsは4桁の0/1が必要 (' + b.bits + ')');
    } else {
      check(b.bits === undefined, where + ': NOTはbitsを持たない');
    }
    check(b.x >= 0 && b.x < lv.w && b.y >= 0 && b.y < lv.h, where + ': 盤外 ' + b.x + ',' + b.y);
    var key = b.x + ',' + b.y;
    check(!seen[key], where + ': 座標が重複 ' + key);
    seen[key] = true;
    check(!(lv.walls || []).some(function (w) { return w[0] === b.x && w[1] === b.y; }),
      where + ': 壁の上に配置されている ' + key);
  });
  (lv.walls || []).forEach(function (w) {
    check(w[0] >= 0 && w[0] < lv.w && w[1] >= 0 && w[1] < lv.h, tag + ': 壁が盤外 ' + w);
  });
  var free = lv.w * lv.h - (lv.walls || []).length - lv.blocks.length;
  check(free >= 1, tag + ': 空きマスがない（ブロックを動かせない）');
  check(lv.blocks.some(function (b) { return b.type === 'bad'; }), tag + ': 悪ブロックがない');
}

/* 到達可能な状態の統計 */
function explore(state) {
  var seen = Object.create(null);
  var stack = [state];
  var total = 0, dead = 0;
  while (stack.length) {
    var s = stack.pop();
    var key = Core._abstractOf(s).bads.join(',') + '|' + Core._abstractOf(s).ops.join(',');
    if (seen[key]) continue;
    seen[key] = true;
    total++;
    if (Core.solve(s) === null) { dead++; continue; }
    var srcs = s.blocks.filter(function (b) { return b.type !== 'bad'; });
    var dsts = s.blocks.filter(function (b) { return Core.TYPES[b.type].hasBits; });
    srcs.forEach(function (src) {
      dsts.forEach(function (dst) {
        if (!Core.canApply(src, dst)) return;
        var ns = Core.applyBlock(s, src.id, dst.id);
        if (ns) stack.push(ns);
      });
    });
  }
  return { total: total, dead: dead };
}

/* 初手の内訳 */
function firstMoves(state) {
  var good = 0, bad = 0;
  var srcs = state.blocks.filter(function (b) { return b.type !== 'bad'; });
  var dsts = state.blocks.filter(function (b) { return Core.TYPES[b.type].hasBits; });
  srcs.forEach(function (src) {
    dsts.forEach(function (dst) {
      if (!Core.canApply(src, dst)) return;
      var ns = Core.applyBlock(state, src.id, dst.id);
      if (Core.solve(ns) === null) bad++; else good++;
    });
  });
  return { good: good, bad: bad };
}

/* 別アルゴリズムでの二重チェック。
 * 到達可能な状態をすべて列挙し、「クリア状態から逆向きに勝てる状態を広げる」
 * 不動点計算で勝敗を求め、再帰メモ化ソルバー(Core.solve)の答えと突き合わせる。 */
function crossCheck(state, idx) {
  var nodes = Object.create(null);   // key -> {state, edges:[key]}
  var order = [];

  (function walk(s) {
    var a = Core._abstractOf(s);
    var key = a.bads.join(',') + '|' + a.ops.join(',');
    if (nodes[key]) return key;
    var node = { state: s, edges: [], cleared: a.bads.length === 0 };
    nodes[key] = node;
    order.push(key);
    if (node.cleared) return key;
    var srcs = s.blocks.filter(function (b) { return b.type !== 'bad'; });
    var dsts = s.blocks.filter(function (b) { return Core.TYPES[b.type].hasBits; });
    srcs.forEach(function (src) {
      dsts.forEach(function (dst) {
        if (!Core.canApply(src, dst)) return;
        var ns = Core.applyBlock(s, src.id, dst.id);
        if (ns) node.edges.push(walk(ns));
      });
    });
    return key;
  })(state);

  // 勝てる状態を不動点まで広げる
  var win = Object.create(null);
  order.forEach(function (k) { if (nodes[k].cleared) win[k] = 0; });
  var changed = true;
  while (changed) {
    changed = false;
    order.forEach(function (k) {
      var best = null;
      nodes[k].edges.forEach(function (e) {
        if (win[e] !== undefined && (best === null || win[e] + 1 < best)) best = win[e] + 1;
      });
      if (best !== null && (win[k] === undefined || best < win[k])) { win[k] = best; changed = true; }
    });
  }

  var mismatch = 0;
  order.forEach(function (k) {
    var a = Core.solve(nodes[k].state);
    var b = win[k] === undefined ? null : win[k];
    if (a !== b) mismatch++;
  });
  check(mismatch === 0,
    'ステージ' + (idx + 1) + ': ソルバーの答えが別解法と ' + mismatch + ' 状態で食い違う');
  return order.length;
}

/* ヒント機能が本当にクリアまで導けるか（最短手順を最後まで辿る） */
function walkHints(state, idx) {
  var s = state, steps = [];
  var guard = 0;
  while (!Core.isCleared(s)) {
    if (++guard > 20) { check(false, 'ステージ' + (idx + 1) + ': ヒントが終わらない'); return steps; }
    var h = Core.hint(s);
    if (!check(h !== null, 'ステージ' + (idx + 1) + ': ヒントが出せない')) return steps;
    var src = Core.findBlock(s, h.srcId), dst = Core.findBlock(s, h.dstId);
    var pv = Core.previewApply(src, dst);
    steps.push(
      (src.type === 'not' ? 'NOT' : src.type.toUpperCase() + Core.toBits(src.bits)) +
      ' → ' + (dst.type === 'bad' ? '悪' : dst.type.toUpperCase()) + Core.toBits(dst.bits) +
      ' = ' + (pv.defeated ? '消滅' : Core.toBits(pv.after))
    );
    s = Core.applyBlock(s, h.srcId, h.dstId);
  }
  return steps;
}

console.log('bit-0110 ステージ検証\n');

levels.forEach(function (lv, i) {
  validateLayout(lv, i);
  var state = Core.createState(lv);
  var min = Core.solve(state);
  var tag = 'ステージ' + (i + 1);

  if (!check(min !== null, tag + ' (' + lv.name + '): 解けない！')) return;
  check(min === lv.par, tag + ': par=' + lv.par + ' だが実際の最短は ' + min + ' 手');

  var stats = explore(state);
  var fm = firstMoves(state);
  crossCheck(state, i);
  var ratio = stats.total ? (stats.dead / stats.total * 100).toFixed(0) : '0';
  var steps = walkHints(state, i);

  console.log(
    tag.padStart(8) + ' ' + lv.name +
    '\n           最短 ' + min + '手 / 到達状態 ' + stats.total + '（詰み ' + stats.dead + ' = ' + ratio + '%）' +
    ' / 初手 有効' + fm.good + '・詰み' + fm.bad
  );
  steps.forEach(function (s, n) { console.log('             ' + (n + 1) + '. ' + s); });
  console.log('');
});

/* 難易度が単調に上がっているかの目安 */
var pars = levels.map(function (l) { return l.par; });
check(pars[0] <= pars[pars.length - 1], '難易度が上がっていない');

if (failures.length) {
  console.error('❌ 失敗 ' + failures.length + ' 件:');
  failures.forEach(function (f) { console.error('   - ' + f); });
  process.exit(1);
}
console.log('✅ 全ステージOK（' + levels.length + 'ステージ）');
