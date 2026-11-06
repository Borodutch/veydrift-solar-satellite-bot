import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { Bot } from "grammy";
import { createPublicClient, http, isAddress, parseAbi } from "viem";
import { base } from "viem/chains";
import { pollWithHandover } from "./handover.js";
import { formatAnnouncement, playerLabel, projectedSatelliteEnergy, shouldAlert, totalBuiltAndQueued } from "./message.js";
import { BUY_ABI, DEFAULT_BUY_CHAT, DEFAULT_POOL_ID, POOL_MANAGER, readBuy } from "./buys.js";
import { answerCa } from "./ca.js";

const DEFAULT_CONTRACT = "0xf397910F005151b09644228573a4353818D3755d";
const SOLAR_SATELLITE = 9;
const ABI = parseAbi([
  "event ShipQueued(uint256 indexed planetId, uint8 indexed ship, uint32 quantity, uint64 readyAt, uint128 metal, uint128 crystal, uint128 deuterium)",
  "function shipCount(uint256 planetId, uint8 ship) view returns (uint32)",
  "function shipQueue(uint256 planetId) view returns ((bool active, uint8 ship, uint32 quantity, uint64 readyAt, (uint128 metal, uint128 crystal, uint128 deuterium) cost))",
  "function shipQueueBacklog(uint256 planetId) view returns ((bool active, uint8 ship, uint32 quantity, uint64 readyAt, (uint128 metal, uint128 crystal, uint128 deuterium) cost)[])",
  "function planet(uint256 planetId) view returns ((address owner, uint16 galaxy, uint16 system, uint8 position, uint16 fields, int16 temperature, uint16 metalMultiplierBps, uint16 crystalMultiplierBps, uint16 deuteriumMultiplierBps, uint64 lastSettledAt, (uint128 metal, uint128 crystal, uint128 deuterium) resources))"
]);

function positiveInteger(value, fallback, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${name} must be a positive integer`);
  return number;
}

function loadConfig() {
  const contractAddress = process.env.VEYDRIFT_CONTRACT_ADDRESS || DEFAULT_CONTRACT;
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
  if (!process.env.TELEGRAM_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is required");
  if (!isAddress(contractAddress)) throw new Error("VEYDRIFT_CONTRACT_ADDRESS is invalid");

  return {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
    apiUrl: process.env.VEYDRIFT_API_URL || "https://api.veydrift.com",
    contractAddress,
    confirmations: positiveInteger(process.env.CONFIRMATIONS, 2, "CONFIRMATIONS"),
    pollIntervalMs: positiveInteger(process.env.POLL_INTERVAL_MS, 4000, "POLL_INTERVAL_MS"),
    blockBatchSize: positiveInteger(process.env.BLOCK_BATCH_SIZE, 2000, "BLOCK_BATCH_SIZE"),
    stateFile: process.env.STATE_FILE || ".state/cursor.json",
    // Buys of the ETH/VEYDRIFT pool; BUY_CHAT_ID="" turns them off
    buyChatId: process.env.BUY_CHAT_ID ?? DEFAULT_BUY_CHAT,
    buyPoolId: process.env.BUY_POOL_ID || DEFAULT_POOL_ID,
    buyMinUsd: Number(process.env.BUY_MIN_USD || 0),
    buyStateFile: process.env.BUY_STATE_FILE || ".state/buys.json"
  };
}

async function loadState(path, latestBlock) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return { nextBlock: BigInt(parsed.nextBlock), sent: new Set(parsed.sent || []) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { nextBlock: latestBlock + 1n, sent: new Set() };
  }
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ nextBlock: state.nextBlock.toString(), sent: [...state.sent] }, null, 2)}\n`);
  await rename(temporary, path);
}

async function readPlayerName(apiUrl, wallet) {
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/wallet/${wallet}/profile`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Player profile returned HTTP ${response.status}`);
    return playerLabel(await response.json(), wallet);
  } catch (error) {
    console.warn("Player profile lookup failed; using wallet fallback", error);
    return playerLabel(null, wallet);
  }
}

export async function readAnnouncement(client, config, log) {
  const planetId = log.args.planetId;
  const blockNumber = log.blockNumber;
  const [built, planet, activeQueue, backlog] = await Promise.all([
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "shipCount", args: [planetId, SOLAR_SATELLITE], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "planet", args: [planetId], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "shipQueue", args: [planetId], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "shipQueueBacklog", args: [planetId], blockNumber })
  ]);
  const total = totalBuiltAndQueued(built, activeQueue, backlog, SOLAR_SATELLITE);
  const queued = log.args.quantity.toString();
  const projectedEnergy = projectedSatelliteEnergy(total, planet.temperature);
  if (!shouldAlert(projectedEnergy)) return null;

  const player = await readPlayerName(config.apiUrl, planet.owner);

  return formatAnnouncement({
    coordinates: `${planet.galaxy}:${planet.system}:${planet.position}`,
    player,
    total,
    queued,
    projectedEnergy
  });
}

async function main() {
  const config = loadConfig();
  const client = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
  const bot = new Bot(config.token);
  let stopping = false;
  let wake;
  const stopped = new Promise((resolve) => { wake = resolve; });
  let watching;
  const send = (chatId, options) => (message) =>
    bot.api.sendMessage(chatId, message, { link_preview_options: { is_disabled: true }, ...options });

  const watchers = [() => follow("Solar Satellite queues", config.stateFile,
    (fromBlock, toBlock) => client.getContractEvents({
      address: config.contractAddress, abi: ABI, eventName: "ShipQueued", args: { ship: SOLAR_SATELLITE }, fromBlock, toBlock
    }),
    (log) => readAnnouncement(client, config, log),
    send(config.chatId))];
  if (config.buyChatId) {
    watchers.push(() => follow("ETH/VEYDRIFT buys", config.buyStateFile,
      (fromBlock, toBlock) => client.getContractEvents({
        address: POOL_MANAGER, abi: BUY_ABI, eventName: "Swap", args: { id: config.buyPoolId }, fromBlock, toBlock
      }),
      (log) => readBuy(client, config, log),
      send(config.buyChatId, { parse_mode: "HTML" })));
  }

  answerCa(bot);

  // One instance at a time: the next container loads the cursors only after this one saved them and
  // let go, and only one getUpdates poller runs (Telegram answers a second one with 409)
  await pollWithHandover(
    () => {
      bot.start({ allowed_updates: ["message"], onStart: () => console.log("Answering ca in chats") })
        .catch((error) => console.error("Telegram polling stopped", error));
      return (watching = Promise.all(watchers.map((start) => start())));
    },
    async () => {
      stopping = true;
      wake();
      await Promise.all([watching, bot.stop()]);
    }
  );

  // Polls confirmed blocks from a saved cursor; posts what `announce` returns, at most once per log.
  async function follow(name, stateFile, fetchLogs, announce, post) {
    const latestBlock = await client.getBlockNumber();
    const state = await loadState(stateFile, latestBlock);

    console.log(`Watching ${name} from block ${state.nextBlock} on Base mainnet`);

    while (!stopping) {
      try {
        const head = await client.getBlockNumber();
        const confirmedHead = head > BigInt(config.confirmations) ? head - BigInt(config.confirmations) : 0n;

        if (state.nextBlock <= confirmedHead) {
          const toBlock = state.nextBlock + BigInt(config.blockBatchSize - 1) < confirmedHead
            ? state.nextBlock + BigInt(config.blockBatchSize - 1)
            : confirmedHead;
          const logs = await fetchLogs(state.nextBlock, toBlock);

          for (const log of logs) {
            const eventId = `${log.transactionHash}:${log.logIndex}`;
            if (state.sent.has(eventId)) continue;
            const message = await announce(log);
            if (message) await post(message);
            state.sent.add(eventId);
            await saveState(stateFile, state);
          }

          state.nextBlock = toBlock + 1n;
          state.sent.clear();
          await saveState(stateFile, state);
        }
      } catch (error) {
        console.error(`${name}: polling failed; retrying without advancing the cursor`, error);
      }

      if (!stopping) await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))]);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
