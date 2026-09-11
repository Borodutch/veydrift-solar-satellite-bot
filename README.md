# Veydrift Solar Satellite Bot

A small [grammY](https://grammy.dev/) bot that watches the live Veydrift contract on Base mainnet and announces every Solar Satellite production queue.

Each announcement includes:

- player display name, with a shortened wallet fallback;
- planet name, coordinates, and ID;
- Solar Satellites already built plus all active and backlogged Solar Satellite queues;
- Solar Satellites added to the queue;

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

The process polls confirmed Base blocks for Veydrift's indexed `ShipQueued` event filtered to ship ID `9` (`SolarSatellite`). For each match it reads the planet, built count, active queue, and queue backlog at the event block, resolves the owner's Veydrift player profile, then posts through grammY.

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
