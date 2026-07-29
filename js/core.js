/*
 * core.js — bitパズルのルール本体とソルバー。
 * ブラウザでは window.BitCore、Node では module.exports として読める。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BitCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MASK = 0b1111;
  var WIDTH = 4;

  /* ---------- ブロック定義 ---------- */
  // hasBits: bitを持つか（NOTだけ持たない）
  // movable: プレイヤーが動かせるか（悪ブロックだけ動かせない）
  var TYPES = {
    bad: { label: '悪', hasBits: true, movable: false },
    or: { label: 'OR', hasBits: true, movable: true },
    and: { label: 'AND', hasBits: true, movable: true },
    xor: { label: 'XOR', hasBits: true, movable: true },
    not: { label: 'NOT', hasBits: false, movable: true }
  };

  /* ---------- ビット演算 ---------- */
  function toBits(n) {
    var s = '';
    for (var i = WIDTH - 1; i >= 0; i--) s += (n >> i) & 1;
    return s;
  }

  function fromBits(s) {
    return parseInt(s, 2) & MASK;
  }

  // 演算ブロック src を bit を持つ対象 target に重ねた結果
  function operate(srcType, targetBits, srcBits) {
    switch (srcType) {
      case 'or': return (targetBits | srcBits) & MASK;
      case 'and': return (targetBits & srcBits) & MASK;
      case 'xor': return (targetBits ^ srcBits) & MASK;
      case 'not': return ~targetBits & MASK;
      default: throw new Error('演算できないブロック: ' + srcType);
    }
  }

  // 悪ブロックは 0000 か 1111 になったら消える
  function isDefeated(bits) {
    return bits === 0 || bits === MASK;
  }

  /* ---------- 盤面 ---------- */
  function createState(level) {
    return {
      w: level.w,
      h: level.h,
      walls: (level.walls || []).map(function (c) { return c.slice(); }),
      blocks: level.blocks.map(function (b, i) {
        return {
          id: i + 1,
          type: b.type,
          bits: TYPES[b.type].hasBits ? fromBits(b.bits) : null,
          x: b.x,
          y: b.y
        };
      })
    };
  }

  function cloneState(s) {
    return {
      w: s.w,
      h: s.h,
      walls: s.walls,           // 壁は不変なので共有してよい
      blocks: s.blocks.map(function (b) {
        return { id: b.id, type: b.type, bits: b.bits, x: b.x, y: b.y };
      })
    };
  }

  function blockAt(s, x, y) {
    for (var i = 0; i < s.blocks.length; i++) {
      if (s.blocks[i].x === x && s.blocks[i].y === y) return s.blocks[i];
    }
    return null;
  }

  function isWall(s, x, y) {
    for (var i = 0; i < s.walls.length; i++) {
      if (s.walls[i][0] === x && s.walls[i][1] === y) return true;
    }
    return false;
  }

  function findBlock(s, id) {
    for (var i = 0; i < s.blocks.length; i++) if (s.blocks[i].id === id) return s.blocks[i];
    return null;
  }

  function isCleared(s) {
    return !s.blocks.some(function (b) { return b.type === 'bad'; });
  }

  /* ---------- 移動 ---------- */
  function canMoveTo(s, block, x, y) {
    if (!TYPES[block.type].movable) return false;
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
    if (isWall(s, x, y)) return false;
    var occ = blockAt(s, x, y);
    return occ === null || occ.id === block.id;
  }

  function moveBlock(s, id, x, y) {
    var next = cloneState(s);
    var b = findBlock(next, id);
    if (!b || !canMoveTo(next, b, x, y)) return null;
    b.x = x;
    b.y = y;
    return next;
  }

  /* ---------- 重ねて演算 ---------- */
  function canApply(src, dst) {
    if (!src || !dst || src.id === dst.id) return false;
    if (!TYPES[src.type].movable) return false;   // 悪ブロックは使えない
    if (src.type === 'bad') return false;
    if (!TYPES[dst.type].hasBits) return false;   // NOTは対象にできない
    return true;
  }

  // 重ねた結果のプレビュー（実際には適用しない）
  function previewApply(src, dst) {
    if (!canApply(src, dst)) return null;
    var after = operate(src.type, dst.bits, src.bits);
    return {
      before: dst.bits,
      after: after,
      defeated: dst.type === 'bad' && isDefeated(after),
      unchanged: after === dst.bits
    };
  }

  function applyBlock(s, srcId, dstId) {
    var src = findBlock(s, srcId);
    var dst = findBlock(s, dstId);
    if (!canApply(src, dst)) return null;

    var next = cloneState(s);
    var nsrc = findBlock(next, srcId);
    var ndst = findBlock(next, dstId);
    var after = operate(nsrc.type, ndst.bits, nsrc.bits);
    ndst.bits = after;

    var removed = [nsrc.id];
    if (ndst.type === 'bad' && isDefeated(after)) removed.push(ndst.id);
    next.blocks = next.blocks.filter(function (b) { return removed.indexOf(b.id) === -1; });
    return next;
  }

  /* ---------- ソルバー ----------
   * ブロックは盤面のどこへでも動かせるので、位置は解けるかどうかに影響しない。
   * よって状態は「悪ブロックのbitの多重集合」＋「演算ブロックの多重集合」で表せる。
   * 1手ごとに演算ブロックが必ず1つ消えるため探索は必ず有限で、閉路もない。
   */
  function abstractOf(s) {
    var bads = [];
    var ops = [];
    s.blocks.forEach(function (b) {
      if (b.type === 'bad') bads.push(b.bits);
      else ops.push(b.type + ':' + (b.bits === null ? '-' : b.bits));
    });
    bads.sort(function (a, b) { return a - b; });
    ops.sort();
    return { bads: bads, ops: ops };
  }

  function abstractKey(a) {
    return a.bads.join(',') + '|' + a.ops.join(',');
  }

  function parseOp(o) {
    var p = o.split(':');
    return { type: p[0], bits: p[1] === '-' ? null : parseInt(p[1], 10) };
  }

  function abstractSuccessors(a) {
    var out = [];
    for (var i = 0; i < a.ops.length; i++) {
      var src = parseOp(a.ops[i]);
      var rest = a.ops.slice(0, i).concat(a.ops.slice(i + 1));

      // 悪ブロックを対象に
      for (var j = 0; j < a.bads.length; j++) {
        var nb = operate(src.type, a.bads[j], src.bits);
        var bads = a.bads.slice();
        if (isDefeated(nb)) bads.splice(j, 1);
        else bads[j] = nb;
        bads.sort(function (x, y) { return x - y; });
        out.push({ bads: bads, ops: rest.slice() });
      }

      // ほかの演算ブロックを対象に（NOTはbitを持たないので対象外）
      for (var k = 0; k < rest.length; k++) {
        var dst = parseOp(rest[k]);
        if (dst.bits === null) continue;
        var nbits = operate(src.type, dst.bits, src.bits);
        var ops = rest.slice();
        ops[k] = dst.type + ':' + nbits;
        ops.sort();
        out.push({ bads: a.bads.slice(), ops: ops });
      }
    }
    return out;
  }

  var SEARCH_LIMIT = 200000; // 暴走防止

  // 残り最短手数を返す。解けないなら null。
  function solveAbstract(a) {
    var memo = Object.create(null);
    var visits = { n: 0 };

    function rec(node) {
      if (node.bads.length === 0) return 0;
      if (node.ops.length === 0) return null;
      var key = abstractKey(node);
      if (key in memo) return memo[key];
      if (++visits.n > SEARCH_LIMIT) return null;
      memo[key] = null;
      var best = null;
      var succ = abstractSuccessors(node);
      for (var i = 0; i < succ.length; i++) {
        var r = rec(succ[i]);
        if (r !== null && (best === null || r + 1 < best)) best = r + 1;
      }
      memo[key] = best;
      return best;
    }

    return rec(a);
  }

  // 盤面が解けるか（残り最短手数 or null）
  function solve(s) {
    return solveAbstract(abstractOf(s));
  }

  // 最短手順の「次の一手」を返す。{srcId, dstId} または null
  function hint(s) {
    var d = solve(s);
    if (d === null || d === 0) return null;
    var srcs = s.blocks.filter(function (b) { return b.type !== 'bad'; });
    var dsts = s.blocks.filter(function (b) { return TYPES[b.type].hasBits; });
    // 悪ブロックを狙う手を優先して探す（手順が分かりやすいので）
    var pairs = [];
    srcs.forEach(function (src) {
      dsts.forEach(function (dst) {
        if (canApply(src, dst)) pairs.push({ src: src, dst: dst });
      });
    });
    pairs.sort(function (p, q) {
      return (q.dst.type === 'bad' ? 1 : 0) - (p.dst.type === 'bad' ? 1 : 0);
    });
    for (var i = 0; i < pairs.length; i++) {
      var next = applyBlock(s, pairs[i].src.id, pairs[i].dst.id);
      if (next && solve(next) === d - 1) {
        return { srcId: pairs[i].src.id, dstId: pairs[i].dst.id };
      }
    }
    return null;
  }

  return {
    MASK: MASK,
    WIDTH: WIDTH,
    TYPES: TYPES,
    toBits: toBits,
    fromBits: fromBits,
    operate: operate,
    isDefeated: isDefeated,
    createState: createState,
    cloneState: cloneState,
    blockAt: blockAt,
    isWall: isWall,
    findBlock: findBlock,
    isCleared: isCleared,
    canMoveTo: canMoveTo,
    moveBlock: moveBlock,
    canApply: canApply,
    previewApply: previewApply,
    applyBlock: applyBlock,
    solve: solve,
    hint: hint,
    _abstractOf: abstractOf,
    _abstractSuccessors: abstractSuccessors
  };
});
