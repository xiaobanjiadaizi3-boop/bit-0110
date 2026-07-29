/*
 * levels.js — ステージデータ。
 * bits は4桁の文字列（左が最上位）。NOTブロックは bits を持たない。
 * par はソルバーで検証済みの最短手数（test/verify.js が一致を確認する）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BitLevels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return [
    {
      name: 'はじめてのOR',
      tip: 'ORブロックを悪ブロックに重ねよう。ORは「自分が1のところを1にする」。悪ブロックは 0000 か 1111 になると消える。',
      par: 1,
      w: 4, h: 3, walls: [],
      blocks: [
        { type: 'bad', bits: '0111', x: 2, y: 1 },
        { type: 'or', bits: '1000', x: 0, y: 1 }
      ]
    },
    {
      name: 'どっちに使う？',
      tip: 'ブロックは使うと消える。どのORをどの悪ブロックに当てるか、bitをよく見て決めよう。',
      par: 2,
      w: 5, h: 3, walls: [],
      blocks: [
        { type: 'bad', bits: '0011', x: 1, y: 0 },
        { type: 'bad', bits: '1110', x: 3, y: 2 },
        { type: 'or', bits: '1100', x: 0, y: 2 },
        { type: 'or', bits: '0001', x: 4, y: 0 }
      ]
    },
    {
      name: 'ANDで削る',
      tip: 'ANDブロックは「自分が0のところを0にする」。0000 を目指すときに使う。',
      par: 2,
      w: 5, h: 3, walls: [[2, 1]],
      blocks: [
        { type: 'bad', bits: '0100', x: 2, y: 0 },
        { type: 'bad', bits: '1011', x: 2, y: 2 },
        { type: 'and', bits: '1011', x: 0, y: 1 },
        { type: 'or', bits: '0100', x: 4, y: 1 }
      ]
    },
    {
      name: 'NOTでひっくり返す',
      tip: 'NOTブロックはbitを持たず、重ねた相手の0と1をすべて反転させる。',
      par: 2,
      w: 4, h: 3, walls: [],
      blocks: [
        { type: 'bad', bits: '1010', x: 1, y: 1 },
        { type: 'and', bits: '1010', x: 3, y: 0 },
        { type: 'not', x: 3, y: 2 }
      ]
    },
    {
      name: 'XORの一撃',
      tip: 'XORブロックは「自分が1のところを反転」。同じbitを当てれば一発で 0000 にできる。',
      par: 2,
      w: 5, h: 3, walls: [],
      blocks: [
        { type: 'bad', bits: '0101', x: 1, y: 1 },
        { type: 'bad', bits: '1001', x: 3, y: 1 },
        { type: 'xor', bits: '0110', x: 0, y: 1 },
        { type: 'xor', bits: '0101', x: 4, y: 1 }
      ]
    },
    {
      name: '道具を作る',
      tip: '演算ブロック同士も重ねられる。NOTを演算ブロックに重ねれば、そのブロックのbitを反転して作り替えられる。',
      par: 2,
      w: 5, h: 4, walls: [[1, 2], [3, 2]],
      blocks: [
        { type: 'bad', bits: '0010', x: 2, y: 0 },
        { type: 'not', x: 0, y: 3 },
        { type: 'and', bits: '0111', x: 2, y: 3 },
        { type: 'and', bits: '0110', x: 4, y: 3 }
      ]
    },
    {
      name: '足りない道具',
      tip: 'ここからは無駄打ちすると詰む。NOTは1つしかない。使う順番を考えよう。',
      par: 3,
      w: 5, h: 4, walls: [[0, 0], [4, 0]],
      blocks: [
        { type: 'bad', bits: '0100', x: 1, y: 1 },
        { type: 'bad', bits: '0010', x: 3, y: 1 },
        { type: 'and', bits: '1001', x: 0, y: 3 },
        { type: 'and', bits: '0110', x: 2, y: 3 },
        { type: 'not', x: 4, y: 3 }
      ]
    },
    {
      name: '二枚のNOT',
      tip: 'NOTは悪ブロックにも演算ブロックにも使える。どちらに使うかで結果が変わる。',
      par: 4,
      w: 6, h: 4, walls: [[2, 0], [3, 0]],
      blocks: [
        { type: 'bad', bits: '0111', x: 1, y: 1 },
        { type: 'bad', bits: '1110', x: 4, y: 1 },
        { type: 'and', bits: '0011', x: 0, y: 3 },
        { type: 'or', bits: '1000', x: 2, y: 3 },
        { type: 'not', x: 3, y: 3 },
        { type: 'not', x: 5, y: 3 }
      ]
    },
    {
      name: '三体',
      tip: '悪ブロック3体に対して道具は4つ。1つも無駄にできない。',
      par: 4,
      w: 6, h: 4, walls: [[0, 0], [5, 0], [2, 2], [3, 2]],
      blocks: [
        { type: 'bad', bits: '1101', x: 1, y: 1 },
        { type: 'bad', bits: '0111', x: 3, y: 0 },
        { type: 'bad', bits: '0010', x: 4, y: 2 },
        { type: 'xor', bits: '0111', x: 0, y: 3 },
        { type: 'and', bits: '0011', x: 2, y: 3 },
        { type: 'not', x: 3, y: 3 },
        { type: 'xor', bits: '0010', x: 5, y: 3 }
      ]
    },
    {
      name: '最終戦',
      tip: 'OR・AND・XOR・NOTの全部を正しい順番で。ほとんどの初手は詰みにつながる。',
      par: 5,
      w: 6, h: 5, walls: [[0, 0], [5, 0], [0, 4], [5, 4], [2, 2], [3, 2]],
      blocks: [
        { type: 'bad', bits: '0101', x: 1, y: 0 },
        { type: 'bad', bits: '0001', x: 4, y: 0 },
        { type: 'bad', bits: '1110', x: 2, y: 1 },
        { type: 'and', bits: '0110', x: 1, y: 4 },
        { type: 'xor', bits: '1110', x: 2, y: 4 },
        { type: 'not', x: 3, y: 4 },
        { type: 'or', bits: '1000', x: 4, y: 4 },
        { type: 'not', x: 0, y: 3 }
      ]
    }
  ];
});
