/**
 * BLOCK BARONS: what the zkSNARK barons say (EN / ZH). Short lines for the speech bubbles, picked by
 * the moment, with a few per persona for colour.
 */
type Pair = [string, string];

const L: Record<string, Pair[]> = {
  buy: [
    ["Mine. Proved in one block.", "我的了。一个区块就证明完。"],
    ["Into the portfolio.", "收入囊中。"],
    ["Good bones, this one.", "这块地底子不错。"],
    ["Location, location, shielded.", "地段，地段，屏蔽。"],
    ["I'll take it.", "我要了。"],
  ],
  complete: [
    ["The whole district. Miners, roll in!", "整个区都是我的了。矿机，进场！"],
    ["Full set. Now the rent gets serious.", "凑齐了。租金要认真起来了。"],
    ["Recursive proofs all the way down.", "一路递归证明到底。"],
  ],
  pass: [
    ["Not at that price.", "这个价不行。"],
    ["Let the mempool decide.", "让内存池决定吧。"],
    ["Pass. Auction it.", "不要。拍卖吧。"],
  ],
  build: [
    ["Plugging in a miner.", "插上一台矿机。"],
    ["More hashpower, more rent.", "算力越多，租金越多。"],
    ["Equihash goes brrr.", "Equihash 转起来。"],
  ],
  foundry: [
    ["A FOUNDRY! Bring your wallet.", "铸造厂！带好钱包。"],
    ["Max level. Welcome to my Foundry.", "满级。欢迎光临我的铸造厂。"],
  ],
  offer: [
    ["Got a deal for you…", "给你个好交易……"],
    ["Let's trade.", "来交易吧。"],
    ["Hear me out.", "听我说完。"],
  ],
  deal: [
    ["Deal. Proved.", "成交。已证明。"],
    ["Fair enough. Done.", "公平。成交。"],
    ["You've got yourself a deal.", "这笔交易成了。"],
  ],
  nodeal: [
    ["No deal.", "不换。"],
    ["Nice try.", "想得美。"],
    ["Not in this epoch.", "这个纪元不行。"],
    ["That's a rug, friend.", "朋友，这是割韭菜。"],
  ],
  counter: [
    ["Close. Sweeten it.", "差一点。再加点。"],
    ["Counter-offer incoming.", "我还个价。"],
  ],
  jailpay: [
    ["Paying the fine. Time is rent.", "交罚款。时间就是租金。"],
    ["Here's 50. Let me out.", "给你 50，放我出去。"],
  ],
  broke: [
    ["Pledging some deeds…", "抵押几张地契……"],
    ["Liquidity crunch.", "流动性紧张。"],
    ["Selling miners. Ouch.", "卖矿机了。疼。"],
  ],
  paid: [
    ["Ouch.", "疼。"],
    ["My poor wallet.", "我可怜的钱包。"],
    ["Highway robbery!", "明抢啊！"],
    ["Fine. Take it.", "行，拿去。"],
  ],
  paidBig: [
    ["THAT much?!", "这么多？！"],
    ["I'm going to need a ZIP for this.", "这得发个 ZIP 了。"],
    ["Dust-attacked again…", "又被粉尘攻击了……"],
  ],
  got: [
    ["Thank you, come again.", "谢谢惠顾，欢迎再来。"],
    ["Rent's due.", "该交租了。"],
    ["Pleasure doing business.", "合作愉快。"],
    ["Ka-ching.", "叮咚，到账。"],
  ],
  jailed: [
    ["Linked by the Tracker…", "被追踪者关联了……"],
    ["I used a t-addr. Rookie mistake.", "我用了透明地址。新手错误。"],
    ["I demand a shielded lawyer.", "我要一个屏蔽律师。"],
  ],
  freed: [
    ["Fresh keys, fresh start.", "新钥匙，新开始。"],
    ["Out! Shielded again.", "出来了！又屏蔽了。"],
  ],
  win: [
    ["Baron of the block!", "区块大亨！"],
    ["Shielded and rich.", "屏蔽，还很富。"],
  ],
  out: [
    ["Gg. I'm out.", "gg，我出局了。"],
    ["Rugged by the board…", "被棋盘割了……"],
  ],
  genesis: [
    ["Block reward!", "区块奖励！"],
    ["Mined another one.", "又挖到一个。"],
  ],
  park: [
    ["The park pot is MINE.", "公园奖池归我了。"],
    ["Free money in the park!", "公园里捡到钱！"],
  ],
  think: [["…", "……"]],
};

let rot = 0;
/** A line for this moment (rotating, so the same seat rarely repeats itself). */
export function lineFor(key: string, seat: number): Pair | null {
  const a = L[key];
  if (!a) return null;
  rot = (rot + 1 + seat) % 997;
  return a[(rot + seat * 3) % a.length];
}
