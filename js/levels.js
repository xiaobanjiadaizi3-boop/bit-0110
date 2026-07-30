/*
 * levels.js — 自動生成ファイル。scripts/generate-levels.js が出力する。手で編集しない。
 * 再生成: node scripts/generate-levels.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BitLevels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var levels = [
    {"world":0,"name":"はじめてのOR","tip":"ORブロックを悪ブロックに重ねよう。ORは「自分が1のところを1にする」。悪ブロックは 0000 か 1111 になると消える。","par":1,"w":4,"h":3,"walls":[],"blocks":[{"type":"bad","bits":"1011","x":1,"y":0},{"type":"or","bits":"1101","x":1,"y":1}]},
    {"world":0,"name":"OR-2","tip":"ブロックは使うと消える。2つのORを順番に当てて 1111 を作ろう。","par":2,"w":4,"h":3,"walls":[[1,1]],"blocks":[{"type":"bad","bits":"1010","x":1,"y":0},{"type":"or","bits":"0001","x":3,"y":1},{"type":"or","bits":"0100","x":3,"y":2}]},
    {"world":0,"name":"OR-3","tip":"悪ブロックが2体。どのORをどちらに使うか、bitをよく見て決めないと詰む。","par":2,"w":5,"h":3,"walls":[],"blocks":[{"type":"bad","bits":"0100","x":2,"y":0},{"type":"bad","bits":"0110","x":0,"y":0},{"type":"or","bits":"1011","x":1,"y":2},{"type":"or","bits":"1101","x":0,"y":2}]},
    {"world":0,"name":"OR-4","par":3,"w":5,"h":4,"walls":[[2,0]],"blocks":[{"type":"bad","bits":"0010","x":3,"y":1},{"type":"bad","bits":"1110","x":4,"y":1},{"type":"or","bits":"1010","x":1,"y":3},{"type":"or","bits":"0101","x":3,"y":3},{"type":"or","bits":"1001","x":2,"y":1}]},
    {"world":0,"name":"OR-5","par":3,"w":5,"h":4,"walls":[],"blocks":[{"type":"bad","bits":"0110","x":1,"y":0},{"type":"bad","bits":"0111","x":3,"y":3},{"type":"or","bits":"0001","x":2,"y":1},{"type":"or","bits":"1010","x":4,"y":3},{"type":"or","bits":"1000","x":0,"y":1}]},
    {"world":0,"name":"OR-6","par":3,"w":5,"h":4,"walls":[[3,0],[2,0],[1,2]],"blocks":[{"type":"bad","bits":"0011","x":1,"y":3},{"type":"bad","bits":"0110","x":4,"y":1},{"type":"bad","bits":"1101","x":3,"y":2},{"type":"or","bits":"1101","x":4,"y":2},{"type":"or","bits":"1101","x":0,"y":0},{"type":"or","bits":"0011","x":0,"y":2}]},
    {"world":0,"name":"OR-7","par":4,"w":6,"h":4,"walls":[[5,3],[5,0]],"blocks":[{"type":"bad","bits":"0100","x":1,"y":1},{"type":"bad","bits":"1101","x":3,"y":2},{"type":"bad","bits":"1110","x":5,"y":1},{"type":"or","bits":"1101","x":0,"y":2},{"type":"or","bits":"0110","x":2,"y":2},{"type":"or","bits":"0110","x":3,"y":3},{"type":"or","bits":"1001","x":3,"y":0}]},
    {"world":0,"name":"OR-8","par":4,"w":6,"h":4,"walls":[[5,3],[4,3],[5,0]],"blocks":[{"type":"bad","bits":"0110","x":0,"y":1},{"type":"bad","bits":"1001","x":4,"y":0},{"type":"bad","bits":"1100","x":3,"y":2},{"type":"or","bits":"1010","x":5,"y":2},{"type":"or","bits":"1100","x":2,"y":2},{"type":"or","bits":"0111","x":2,"y":1},{"type":"or","bits":"1001","x":2,"y":3}]},
    {"world":0,"name":"OR-9","par":4,"w":6,"h":4,"walls":[[5,3],[1,1],[2,2]],"blocks":[{"type":"bad","bits":"0001","x":1,"y":2},{"type":"bad","bits":"1010","x":0,"y":1},{"type":"bad","bits":"1110","x":0,"y":2},{"type":"or","bits":"1101","x":2,"y":1},{"type":"or","bits":"0010","x":5,"y":1},{"type":"or","bits":"0011","x":0,"y":3},{"type":"or","bits":"0111","x":4,"y":3},{"type":"or","bits":"1000","x":2,"y":0}]},
    {"world":0,"name":"OR編・卒業試験","tip":"OR編の総仕上げ。全ORの割り当てを考えてから動こう。","par":5,"w":6,"h":5,"walls":[],"blocks":[{"type":"bad","bits":"0100","x":0,"y":4},{"type":"bad","bits":"0100","x":2,"y":3},{"type":"bad","bits":"0111","x":5,"y":4},{"type":"bad","bits":"1101","x":0,"y":3},{"type":"or","bits":"1011","x":1,"y":2},{"type":"or","bits":"0011","x":4,"y":4},{"type":"or","bits":"0011","x":2,"y":4},{"type":"or","bits":"1000","x":2,"y":0},{"type":"or","bits":"1000","x":0,"y":0}]}
  ];
  levels.worlds = [{"tag":"OR","name":"OR編","start":0,"count":10}];
  return levels;
});
