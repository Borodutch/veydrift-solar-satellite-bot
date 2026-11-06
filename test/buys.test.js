import test from "node:test";
import assert from "node:assert/strict";
import { buyAmounts, formatBuy, readBuy, veydriftUsd } from "../src/buys.js";

// Real swaps of the ETH/VEYDRIFT pool (blocks 54023702 and 54023682)
const BUY = { amount0: -297000000000000000n, amount1: 4026742712131699178454999n, sqrtPriceX96: 275355907227813046526612584818510n };
const SELL = { amount0: 27395761954493131n, amount1: -424376522749944072776626n, sqrtPriceX96: 312192926575964163424685236783123n };
const BUYER = "0xb9b7da48c3e0f1d7a1b2c3d4e5f60718293a4b5c";

test("only ETH-in, VEYDRIFT-out swaps are buys", () => {
  assert.deepEqual(buyAmounts(BUY), { eth: 297000000000000000n, veydrift: 4026742712131699178454999n });
  assert.equal(buyAmounts(SELL), null);
});

test("prices VEYDRIFT from the post-swap sqrt price", () => {
  // (sqrtP / 2^96)^2 = 12,079,091 VEYDRIFT per ETH
  assert.ok(Math.abs(veydriftUsd(BUY.sqrtPriceX96, 2232.13647666) / 0.000184795382960 - 1) < 1e-9);
});

test("formats a buy for Telegram HTML", () => {
  assert.equal(formatBuy({ ...buyAmounts(BUY), ethUsd: 2232.13647666, priceUsd: veydriftUsd(BUY.sqrtPriceX96, 2232.13647666), buyer: BUYER, txHash: "0x9cb8", chartUrl: "https://dexscreener.com/base/0xa48c" }), [
    "🚀".repeat(14),
    "🛸 <b>$VEYDRIFT buy</b>: 0.297 ETH ($663) → 4,026,743 $VEYDRIFT",
    "🪐 Price $0.000185 · 🌌 FDV $184.8K",
    `👨‍🚀 <a href="https://basescan.org/address/${BUYER}">0xb9b7…4b5c</a> · 🛰 <a href="https://basescan.org/tx/0x9cb8">tx</a> · 📡 <a href="https://dexscreener.com/base/0xa48c">chart</a>`
  ].join("\n"));
});

test("reads the ETH price at the swap's block, skips sells and buys under the minimum", async () => {
  const log = { blockNumber: 54023702n, transactionHash: "0x9cb8", args: BUY };
  const client = {
    readContract: async (request) => {
      assert.equal(request.functionName, "latestRoundData");
      assert.equal(request.blockNumber, log.blockNumber);
      return [1n, 223213647666n, 0n, 0n, 1n];
    },
    getTransaction: async ({ hash }) => (assert.equal(hash, "0x9cb8"), { from: BUYER })
  };
  const config = { buyMinUsd: 0, buyPoolId: "0xa48c" };
  assert.match(await readBuy(client, config, log), /0\.297 ETH \(\$663\)/);
  assert.equal(await readBuy(client, { ...config, buyMinUsd: 700 }, log), null);
  assert.equal(await readBuy(client, config, { ...log, args: SELL }), null);
});
