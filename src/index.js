import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Bot } from "grammy";
import { createPublicClient, http, isAddress, parseAbi } from "viem";
import { base } from "viem/chains";
import { formatAnnouncement, playerLabel, totalBuiltAndQueued } from "./message.js";

const DEFAULT_CONTRACT = "0xf397910F005151b09644228573a4353818D3755d";
const SOLAR_SATELLITE = 9;
const ABI = parseAbi([
  "event ShipQueued(uint256 indexed planetId, uint8 indexed ship, uint32 quantity, uint64 readyAt, uint128 metal, uint128 crystal, uint128 deuterium)",
  "function planetNames(uint256 planetId) view returns (string)",
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
    stateFile: process.env.STATE_FILE || ".state/cursor.json"
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

async function readAnnouncement(client, config, log) {
  const planetId = log.args.planetId;
  const blockNumber = log.blockNumber;
  const [name, built, planet, activeQueue, backlog] = await Promise.all([
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "planetNames", args: [planetId], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "shipCount", args: [planetId, SOLAR_SATELLITE], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "planet", args: [planetId], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "shipQueue", args: [planetId], blockNumber }),
    client.readContract({ address: config.contractAddress, abi: ABI, functionName: "shipQueueBacklog", args: [planetId], blockNumber })
  ]);
  const player = await readPlayerName(config.apiUrl, planet.owner);

  return formatAnnouncement({
    planetId: planetId.toString(),
    name,
    player,
    galaxy: Number(planet.galaxy),
    system: Number(planet.system),
    position: Number(planet.position),
    total: totalBuiltAndQueued(built, activeQueue, backlog, SOLAR_SATELLITE),
    queued: log.args.quantity.toString()
  });
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const config = loadConfig();
  const client = createPublicClient({ chain: base, transport: http(config.rpcUrl) });
  const bot = new Bot(config.token);
  const latestBlock = await client.getBlockNumber();
  const state = await loadState(config.stateFile, latestBlock);
  let stopping = false;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => { stopping = true; });
  }

  console.log(`Watching Veydrift from block ${state.nextBlock} on Base mainnet`);

  while (!stopping) {
    try {
      const head = await client.getBlockNumber();
      const confirmedHead = head > BigInt(config.confirmations) ? head - BigInt(config.confirmations) : 0n;

      if (state.nextBlock <= confirmedHead) {
        const toBlock = state.nextBlock + BigInt(config.blockBatchSize - 1) < confirmedHead
          ? state.nextBlock + BigInt(config.blockBatchSize - 1)
          : confirmedHead;
        const logs = await client.getContractEvents({
          address: config.contractAddress,
          abi: ABI,
          eventName: "ShipQueued",
          args: { ship: SOLAR_SATELLITE },
          fromBlock: state.nextBlock,
          toBlock
        });

        for (const log of logs) {
          const eventId = `${log.transactionHash}:${log.logIndex}`;
          if (state.sent.has(eventId)) continue;
          const message = await readAnnouncement(client, config, log);
          await bot.api.sendMessage(config.chatId, message, { link_preview_options: { is_disabled: true } });
          state.sent.add(eventId);
          await saveState(config.stateFile, state);
        }

        state.nextBlock = toBlock + 1n;
        state.sent.clear();
        await saveState(config.stateFile, state);
      }
    } catch (error) {
      console.error("Polling failed; retrying without advancing the cursor", error);
    }

    if (!stopping) await wait(config.pollIntervalMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
