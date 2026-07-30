#!/usr/bin/env node
/*
 * scripts/generate-levels.js — js/levels.js を自動生成する。
 *   node scripts/generate-levels.js [--worlds N]
 *
 * ワールド構成:
 *   W1 OR編   10面 (OR + 悪)
 *   W2 NOT編  50面 (+NOT)
 *   W3 AND編 100面 (+AND)
 *   W4 XOR編 150面 (+XOR)   計310面
 *
 * 各ステージは「難易度スペック」(悪の数・道具の数・最短手数・詰み率・
 * 演算ブロック同士の合成が必須か・必須ブロック) を満たすまでランダム
 * サンプリングし、ソルバーで検証してから採用する。乱数はステージ番号で
 * 固定シードなので、出力は決定的。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Core = require('../js/core.js');

/* ---------------- 乱数 ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (rng, v) => Array.isArray(v) ? v[0] + Math.floor(rng() * (v[1] - v[0] + 1)) : v;

/* ---------------- 抽象状態の解析 ----------------
 * 位置は解に影響しないので、状態 = 悪bitの多重集合 + 演算ブロックの多重集合。
 * op は 'or:12' / 'not:-' のような文字列で表す。 */
const key = (n) => n.bads.join(',') + '|' + n.ops.join(',');
function parseOp(o) {
  const i = o.indexOf(':');
  const b = o.slice(i + 1);
  return { type: o.slice(0, i), bits: b === '-' ? null : +b };
}

function successors(node) {
  const out = [];
  for (let i = 0; i < node.ops.length; i++) {
    const src = parseOp(node.ops[i]);
    const rest = node.ops.slice(0, i).concat(node.ops.slice(i + 1));
    for (let j = 0; j < node.bads.length; j++) {
      const nb = Core.operate(src.type, node.bads[j], src.bits);
      const bads = node.bads.slice();
      if (Core.isDefeated(nb)) bads.splice(j, 1); else bads[j] = nb;
      bads.sort((a, b) => a - b);
      out.push({ opop: false, node: { bads, ops: rest.slice() } });
    }
    for (let k2 = 0; k2 < rest.length; k2++) {
      const dst = parseOp(rest[k2]);
      if (dst.bits === null) continue;                    // NOTは対象にできない
      const ops = rest.slice();
      ops[k2] = dst.type + ':' + Core.operate(src.type, dst.bits, src.bits);
      ops.sort();
      out.push({ opop: true, node: { bads: node.bads.slice(), ops } });
    }
  }
  return out;
}

function makeSolver(allowOpop) {
  const memo = new Map();
  return function solve(node) {
    if (node.bads.length === 0) return 0;
    if (node.ops.length === 0) return null;
    const k = key(node);
    if (memo.has(k)) return memo.get(k);
    memo.set(k, null);
    let best = null;
    for (const s of successors(node)) {
      if (!allowOpop && s.opop) continue;
      const r = solve(s.node);
      if (r !== null && (best === null || r + 1 < best)) best = r + 1;
    }
    memo.set(k, best);
    return best;
  };
}

/* 詰み率の計測（solve は par 計算で使ったソルバーを渡して memo を共有する） */
function deadRatioOf(node, solve, maxStates) {
  const seen = new Set();
  const stack = [node];
  let total = 0, dead = 0;
  while (stack.length) {
    const n = stack.pop();
    const k = key(n);
    if (seen.has(k)) continue;
    seen.add(k);
    if (seen.size > maxStates) return null;
    total++;
    if (solve(n) === null) { dead++; continue; }   // 詰みの先は数えない
    for (const s of successors(n)) if (!seen.has(key(s.node))) stack.push(s.node);
  }
  return { total, dead, ratio: dead / total };
}

/* ---------------- ワールド定義 ----------------
 * band = 連続する n ステージ分のスペック。
 *   b/o: 悪・道具の数(範囲可)  par: 最短手数の範囲  dead: 詰み率の範囲
 *   mustHave: 必ず入れるブロック  opop: 合成必須か  needKind: このブロック
 *   を除くと解けなくなること(=そのブロックが解に必須) */
const WORLDS = [
  { tag: 'OR', name: 'OR編', kinds: ['or'], bands: [
    { n: 1, b: 1, o: 1, par: [1, 1], dead: [0, 0] },
    { n: 1, b: 1, o: 2, par: [2, 2], dead: [0, 0] },
    { n: 1, b: 2, o: 2, par: [2, 2], dead: [0.2, 0.8] },
    { n: 1, b: 2, o: 3, par: [3, 3], dead: [0.15, 0.6] },
    { n: 1, b: 2, o: 3, par: [3, 3], dead: [0.3, 0.7] },
    { n: 1, b: 3, o: 3, par: [3, 3], dead: [0.3, 0.7] },
    { n: 1, b: 3, o: 4, par: [4, 4], dead: [0.35, 0.75] },
    { n: 1, b: 3, o: 4, par: [4, 4], dead: [0.45, 0.8] },
    { n: 1, b: 3, o: 5, par: [4, 5], dead: [0.5, 0.85] },
    { n: 1, b: 4, o: 5, par: [5, 5], dead: [0.5, 0.9] }
  ] },
  { tag: 'NOT', name: 'NOT編', kinds: ['or', 'not'], bands: [
    { n: 4, b: 1, o: 2, par: [2, 2], dead: [0, 0.45], mustHave: ['not'], needKind: 'not' },
    { n: 6, b: 1, o: 3, par: [2, 3], dead: [0, 0.55], mustHave: ['not'], opop: true, needKind: 'not' },
    { n: 8, b: 2, o: 3, par: [3, 3], dead: [0.25, 0.6], mustHave: ['not'] },
    { n: 8, b: 2, o: 4, par: [3, 4], dead: [0.35, 0.7], mustHave: ['not'], opop: true },
    { n: 8, b: 3, o: 4, par: [4, 4], dead: [0.45, 0.75], mustHave: ['not'] },
    { n: 8, b: 3, o: 5, par: [5, 5], dead: [0.55, 0.82], mustHave: ['not'], opop: true },
    { n: 8, b: [3, 4], o: [5, 6], par: [5, 6], dead: [0.6, 0.88], mustHave: ['not', 'not'], opop: true }
  ] },
  { tag: 'AND', name: 'AND編', kinds: ['or', 'not', 'and'], bands: [
    { n: 10, b: 2, o: 3, par: [2, 3], dead: [0.1, 0.5], mustHave: ['and'], needKind: 'and' },
    { n: 10, b: 2, o: 3, par: [3, 3], dead: [0.25, 0.6], mustHave: ['and'] },
    { n: 10, b: 2, o: 4, par: [3, 4], dead: [0.35, 0.65], mustHave: ['and', 'not'], opop: true },
    { n: 10, b: 3, o: 4, par: [4, 4], dead: [0.4, 0.7], mustHave: ['and', 'not'] },
    { n: 10, b: 3, o: 4, par: [4, 4], dead: [0.5, 0.78], mustHave: ['and'], opop: true },
    { n: 10, b: 3, o: 5, par: [4, 5], dead: [0.55, 0.8], mustHave: ['and', 'not'], opop: true },
    { n: 10, b: 3, o: 5, par: [5, 5], dead: [0.6, 0.85], mustHave: ['and'], opop: true },
    { n: 10, b: 4, o: 5, par: [5, 5], dead: [0.65, 0.88], mustHave: ['and', 'not'] },
    { n: 10, b: 4, o: 6, par: [5, 6], dead: [0.7, 0.9], mustHave: ['and'], opop: true },
    { n: 10, b: 4, o: 6, par: [6, 6], dead: [0.72, 0.92], mustHave: ['and', 'not'], opop: true }
  ] },
  { tag: 'XOR', name: 'XOR編', kinds: ['or', 'not', 'and', 'xor'], bands: [
    { n: 10, b: 2, o: 3, par: [2, 3], dead: [0.1, 0.5], mustHave: ['xor'], needKind: 'xor' },
    { n: 10, b: 2, o: 3, par: [3, 3], dead: [0.3, 0.6], mustHave: ['xor'] },
    { n: 10, b: 2, o: 4, par: [3, 4], dead: [0.4, 0.7], mustHave: ['xor'], opop: true },
    { n: 10, b: 3, o: 4, par: [4, 4], dead: [0.45, 0.72], mustHave: ['xor', 'not'] },
    { n: 10, b: 3, o: 4, par: [4, 4], dead: [0.5, 0.75], mustHave: ['xor'], opop: true, needKind: 'xor' },
    { n: 10, b: 3, o: 5, par: [4, 5], dead: [0.55, 0.8], mustHave: ['xor'], opop: true },
    { n: 10, b: 3, o: 5, par: [5, 5], dead: [0.6, 0.83], mustHave: ['xor', 'and'], opop: true },
    { n: 10, b: 3, o: 5, par: [5, 5], dead: [0.65, 0.85], mustHave: ['xor'], opop: true },
    { n: 10, b: 4, o: 5, par: [5, 5], dead: [0.68, 0.87], mustHave: ['xor', 'not'] },
    { n: 10, b: 4, o: 6, par: [5, 6], dead: [0.7, 0.88], mustHave: ['xor'], opop: true },
    { n: 10, b: 4, o: 6, par: [6, 6], dead: [0.72, 0.9], mustHave: ['xor', 'and', 'not'], opop: true },
    { n: 10, b: 4, o: 6, par: [6, 6], dead: [0.75, 0.9], mustHave: ['xor'], opop: true, needKind: 'xor' },
    { n: 10, b: 4, o: 7, par: [6, 7], dead: [0.78, 0.92], mustHave: ['xor', 'not'], opop: true },
    { n: 10, b: 4, o: 7, par: [6, 7], dead: [0.8, 0.93], mustHave: ['xor'], opop: true },
    { n: 7, b: 4, o: 7, par: [6, 7], dead: [0.8, 0.95], mustHave: ['xor', 'xor'], opop: true },
    { n: 3, b: 4, o: 7, par: [7, 7], dead: [0.75, 0.96], mustHave: ['xor', 'not'], opop: true }
  ] }
];

/* 名前とヒント(グローバル1始まり番号) */
const NAMES = {
  1: 'はじめてのOR', 10: 'OR編・卒業試験',
  11: 'NOT、あらわる', 15: '道具を作り替えろ', 60: 'NOT編・卒業試験',
  61: 'AND、あらわる', 160: 'AND編・卒業試験',
  161: 'XOR、あらわる', 310: 'さいごの計算'
};
const TIPS = {
  1: 'ORブロックを悪ブロックに重ねよう。ORは「自分が1のところを1にする」。悪ブロックは 0000 か 1111 になると消える。',
  2: 'ブロックは使うと消える。2つのORを順番に当てて 1111 を作ろう。',
  3: '悪ブロックが2体。どのORをどちらに使うか、bitをよく見て決めないと詰む。',
  10: 'OR編の総仕上げ。全ORの割り当てを考えてから動こう。',
  11: '新ブロックNOT。bitを持たず、相手の0と1を全部ひっくり返す。悪ブロックにも使える。',
  15: 'NOTは演算ブロックにも使える。ORに重ねてbitを反転し、道具を作り替えないと解けない。',
  21: 'ここからは無駄打ちが命取り。使う順番を最後まで読もう。',
  61: '新ブロックAND。「自分が0のところを0にする」。0000 で撃破する新しい道。',
  81: 'NOTでANDを作り替える合わせ技。0000側と1111側、どちらで倒すかを見極めよう。',
  111: 'ここからは悪ブロック3体が標準。道具の割り当てを最後まで計算しよう。',
  161: '新ブロックXOR。「自分が1のところを反転する」。同じbitを当てれば一撃で 0000。',
  181: 'OR・AND・XOR・NOTの総力戦。合成なしでは解けない。',
  221: '詰み筋だらけ。初手から慎重に。',
  301: '最終ブロック。ほぼすべての手順が詰みにつながる。最短手順を見つけ出せ。'
};

/* ---------------- サンプリング ---------------- */
function sampleNode(rng, spec, kinds) {
  const nb = pick(rng, spec.b);
  const no = pick(rng, spec.o);
  const bads = [];
  for (let i = 0; i < nb; i++) bads.push(1 + Math.floor(rng() * 14)); // 1..14
  bads.sort((a, b) => a - b);
  const must = spec.mustHave || [];
  const ops = [];
  for (let i = 0; i < no; i++) {
    const k = i < must.length ? must[i] : kinds[Math.floor(rng() * kinds.length)];
    ops.push(k === 'not' ? 'not:-' : k + ':' + (1 + Math.floor(rng() * 14)));
  }
  ops.sort();
  return { bads, ops };
}

function findStage(globalIdx, spec, kinds, usedKeys) {
  const rng = mulberry32(0xB17 * (globalIdx + 1) + 20260730);
  const relaxEvery = specMaxOps(spec) >= 6 ? 1500 : 4000; // 重いスペックは早めに緩める
  let relax = 0;
  for (let attempt = 1; attempt <= 400000; attempt++) {
    if (attempt % relaxEvery === 0 && relax < 10) relax++;
    const node = sampleNode(rng, spec, kinds);
    const k = key(node);
    if (usedKeys.has(k)) continue;

    // 安い順に判定して高い探索（詰み率計測）を最後に回す
    const solve = makeSolver(true);
    const par = solve(node);
    if (par === null) continue;
    const parLo = relax >= 4 ? Math.max(1, spec.par[0] - Math.floor((relax - 2) / 2)) : spec.par[0];
    if (par < parLo || par > spec.par[1]) continue;

    let needsOpop = null;
    if (spec.opop === true && relax < 5) {
      needsOpop = makeSolver(false)(node) === null;
      if (!needsOpop) continue;
    }
    if (spec.needKind && relax < 6) {
      const strippedOps = node.ops.filter((o) => parseOp(o).type !== spec.needKind);
      if (makeSolver(true)({ bads: node.bads.slice(), ops: strippedOps }) !== null) continue;
    }

    const st = deadRatioOf(node, solve, 60000);
    if (!st) continue;
    const dLo = Math.max(0, spec.dead[0] - 0.04 * relax);
    const dHi = Math.min(1, spec.dead[1] + 0.04 * relax);
    if (st.ratio < dLo || st.ratio > dHi) continue;

    if (needsOpop === null) needsOpop = makeSolver(false)(node) === null;
    usedKeys.add(k);
    return {
      node,
      a: { par, total: st.total, dead: st.dead, deadRatio: st.ratio, needsOpop },
      attempts: attempt, relax, rng
    };
  }
  throw new Error('stage ' + (globalIdx + 1) + ': 条件を満たす盤面が見つからない');
}

/* pick() を数値にも使うためのガード（relaxEvery用） */
function specMaxOps(spec) { return Array.isArray(spec.o) ? spec.o[1] : spec.o; }

/* ---------------- 盤面への配置 ---------------- */
function layout(node, rng) {
  const n = node.bads.length + node.ops.length;
  const [w, h] = n <= 3 ? [4, 3] : n <= 4 ? [5, 3] : n <= 6 ? [5, 4]
    : n <= 8 ? [6, 4] : n <= 10 ? [6, 5] : [7, 5];

  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y });
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const blockCells = cells.slice(0, n);
  const rest = cells.slice(n);
  const nWalls = Math.max(0, Math.min(rest.length - 2, Math.floor(rng() * 4)));
  const walls = rest.slice(0, nWalls).map((c) => [c.x, c.y]);

  const blocks = [];
  node.bads.forEach((b, i) => blocks.push({
    type: 'bad', bits: Core.toBits(b), x: blockCells[i].x, y: blockCells[i].y
  }));
  node.ops.forEach((o, i) => {
    const p = parseOp(o);
    const c = blockCells[node.bads.length + i];
    blocks.push(p.bits === null
      ? { type: 'not', x: c.x, y: c.y }
      : { type: p.type, bits: Core.toBits(p.bits), x: c.x, y: c.y });
  });
  return { w, h, walls, blocks };
}

/* ---------------- 生成本体 ---------------- */
function main() {
  const argWorlds = process.argv.indexOf('--worlds');
  const nWorlds = argWorlds !== -1 ? +process.argv[argWorlds + 1] : WORLDS.length;

  const levels = [];
  const worldsMeta = [];
  const usedKeys = new Set();
  let globalIdx = 0;
  const t0 = Date.now();

  for (let wi = 0; wi < nWorlds; wi++) {
    const world = WORLDS[wi];
    const start = globalIdx;
    for (const band of world.bands) {
      for (let i = 0; i < band.n; i++) {
        const found = findStage(globalIdx, band, world.kinds, usedKeys);
        const geo = layout(found.node, found.rng);
        const no1 = globalIdx + 1;
        const lv = {
          world: wi,
          name: NAMES[no1] || (world.tag + '-' + (globalIdx - start + 1)),
          tip: TIPS[no1],
          par: found.a.par,
          w: geo.w, h: geo.h, walls: geo.walls, blocks: geo.blocks
        };
        levels.push(lv);
        process.stdout.write(
          `#${String(no1).padStart(3)} ${world.tag.padEnd(3)} par=${found.a.par} ` +
          `dead=${(found.a.deadRatio * 100).toFixed(0).padStart(2)}% ` +
          `opop=${found.a.needsOpop ? 'Y' : '-'} ` +
          `attempts=${found.attempts}${found.relax ? ' relax=' + found.relax : ''}\n`);
        globalIdx++;
      }
    }
    worldsMeta.push({ tag: world.tag, name: world.name, start, count: globalIdx - start });
  }

  const lines = levels.map((l) => '    ' + JSON.stringify(l));
  const src = `/*
 * levels.js — 自動生成ファイル。scripts/generate-levels.js が出力する。手で編集しない。
 * 再生成: node scripts/generate-levels.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BitLevels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var levels = [
${lines.join(',\n')}
  ];
  levels.worlds = ${JSON.stringify(worldsMeta)};
  return levels;
});
`;
  fs.writeFileSync(path.join(__dirname, '../js/levels.js'), src);
  console.log(`\n${levels.length}ステージを js/levels.js に出力 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

main();
