import { parseAbi } from "viem";

export const DEFAULT_BUY_CHAT = "@veydriftdotcom";
// Uniswap v4 ETH/VEYDRIFT (0.9%, hookless): currency0 = native ETH, currency1 = VEYDRIFT, both 18 decimals
export const DEFAULT_POOL_ID = "0xa48cdc0e5f4612b2400ea20aad0df45cdd3f51e1f7584d318239d217cef45c51";
export const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const ETH_USD_FEED = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"; // Chainlink ETH / USD on Base, 8 decimals
const SUPPLY = 1_000_000_000;

export const BUY_ABI = parseAbi([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"
]);

/** v4 Swap amounts are the swapper's deltas: a buy pays ETH (amount0 < 0) and receives VEYDRIFT (amount1 > 0). */
export function buyAmounts({ amount0, amount1 }) {
  return amount0 < 0n && amount1 > 0n ? { eth: -amount0, veydrift: amount1 } : null;
}

/** USD per VEYDRIFT after the swap: price = (sqrtPriceX96 / 2^96)^2 VEYDRIFT per ETH. */
export function veydriftUsd(sqrtPriceX96, ethUsd) {
  return ethUsd / (Number(sqrtPriceX96) / 2 ** 96) ** 2;
}

const significant = (value, digits) => value.toLocaleString("en-US", { maximumSignificantDigits: digits });
const usd = (value) => "$" + (value >= 1 ? Math.round(value).toLocaleString("en-US") : significant(value, 3));
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function formatBuy({ eth, veydrift, ethUsd, priceUsd, buyer, txHash, chartUrl }) {
  const ethAmount = Number(eth) / 1e18, spentUsd = ethAmount * ethUsd;
  const dots = "🟢".repeat(Math.min(20, Math.max(1, Math.ceil(spentUsd / 50))));
  return [
    `${dots}`,
    `<b>$VEYDRIFT buy</b>: ${significant(ethAmount, 4)} ETH (${usd(spentUsd)}) → ${Math.round(Number(veydrift) / 1e18).toLocaleString("en-US")} $VEYDRIFT`,
    `Price ${usd(priceUsd)} · FDV $${(priceUsd * SUPPLY).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`,
    `<a href="https://basescan.org/address/${buyer}">${short(buyer)}</a> · <a href="https://basescan.org/tx/${txHash}">tx</a> · <a href="${chartUrl}">chart</a>`
  ].join("\n");
}

/** Returns the Telegram HTML for a buy, or null for sells and buys under the minimum. */
export async function readBuy(client, config, log) {
  const amounts = buyAmounts(log.args);
  if (!amounts) return null;
  const [round, tx] = await Promise.all([
    client.readContract({ address: ETH_USD_FEED, abi: BUY_ABI, functionName: "latestRoundData", blockNumber: log.blockNumber }),
    client.getTransaction({ hash: log.transactionHash })
  ]);
  const ethUsd = Number(round[1]) / 1e8;
  if ((Number(amounts.eth) / 1e18) * ethUsd < config.buyMinUsd) return null;
  return formatBuy({
    ...amounts,
    ethUsd,
    priceUsd: veydriftUsd(log.args.sqrtPriceX96, ethUsd),
    buyer: tx.from,
    txHash: log.transactionHash,
    chartUrl: `https://dexscreener.com/base/${config.buyPoolId}`
  });
}
