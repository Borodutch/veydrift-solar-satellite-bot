# Veydrift Solar Satellite Bot

A small [grammY](https://grammy.dev/) bot that watches the live Veydrift contract on Base mainnet and announces Solar Satellite queues only when the planet’s built + queued satellites project at least **50,000 energy**.

Each one-line announcement names the player, planet coordinates, newly queued amount, total Solar Satellites built or queued, and projected satellite energy after the queues finish (not energy already being produced). Players without a display name use a shortened wallet address.

## Run

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
```

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in your environment, then run:

```bash
set -a
. ./.env
set +a
npm start
```

`TELEGRAM_CHAT_ID` may be a numeric chat ID or a public channel username such as `@veydrift`. The bot must be an administrator to post in a channel.

## How it works

The process polls confirmed Base blocks for Veydrift's indexed `ShipQueued` event filtered to ship ID `9` (`SolarSatellite`). For each match it reads the planet owner, built count, active queue, and queue backlog at the event block, resolves the owner's Veydrift player profile, then posts through grammY.

Projected energy uses the event-block built + active-queue + backlog satellite count, including the new queue exactly once, multiplied by that planet’s per-satellite energy. Inactive and non-satellite queues are excluded. Per-satellite energy is `(temperature + 140) / 6`, integer-truncated then clamped to 1–65; there is no count-only bypass. `planet.temperature` is passed directly as the maximum temperature by the canonical contract (no offset): verified against [VeydriftGame.energyBalance](https://github.com/Borodutch/veydrift/blob/eda10dbae26d34834037cd2e258877b069e32a5c/packages/contracts/src/VeydriftGame.sol#L774-L789) and [VeydriftFormulas.solarSatelliteEnergy](https://github.com/Borodutch/veydrift/blob/eda10dbae26d34834037cd2e258877b069e32a5c/packages/contracts/src/libraries/VeydriftFormulas.sol#L143-L148). Suppressed events still advance the existing cursor/deduplication flow.

## Buys

The same process also posts every buy of the Uniswap v4 ETH/VEYDRIFT pool (`0xa48cdc0e…c45c51`) to `BUY_CHAT_ID` (default `@veydriftdotcom`; the bot must be a member allowed to post). It polls the PoolManager's `Swap` events for that pool id. A buy is a swap where the swapper pays ETH (`amount0 < 0`) and receives VEYDRIFT (`amount1 > 0`). Each message has a 🚀 bar (one per $50, up to 20) and shows the ETH spent with its USD value (Chainlink ETH/USD at the swap's block), the VEYDRIFT received, the post-swap price and FDV (1B supply), and links to the buyer, the transaction and the DexScreener chart. `BUY_MIN_USD` skips smaller buys and `BUY_CHAT_ID=""` turns buys off. The buy cursor lives in `.state/buys.json`.

## State

The first run starts at the current chain head, so deploying the bot does not replay historical queues. The next block cursor is stored atomically in `.state/cursor.json`; mount `.state` on persistent storage in production.

Defaults:

- Base mainnet RPC: `https://mainnet.base.org`
- Veydrift proxy: `0xf397910F005151b09644228573a4353818D3755d`
- confirmations: `2`

All defaults can be overridden with the variables shown in [.env.example](.env.example).

## Test

```bash
npm run check
npm test
```
