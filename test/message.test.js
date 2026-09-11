import test from "node:test";
import assert from "node:assert/strict";
import { formatAnnouncement } from "../src/message.js";

test("formats a solar satellite queue announcement", () => {
  assert.equal(formatAnnouncement({
    planetId: "42",
    name: "New Zion",
    galaxy: 6,
    system: 9,
    position: 1,
    built: "17",
    queued: "5",
    transactionHash: "0xabc"
  }), [
    "🛰 Solar satellites queued",
    "",
    "Planet: New Zion [6:9:1] (#42)",
    "Already built: 17",
    "Added to queue: +5",
    "",
    "Transaction: https://basescan.org/tx/0xabc"
  ].join("\n"));
});

test("falls back to the planet id when the planet is unnamed", () => {
  const message = formatAnnouncement({
    planetId: "7",
    name: "",
    built: "0",
    queued: "1",
    transactionHash: "0xdef"
  });

  assert.match(message, /Planet: Planet #7 \(#7\)/);
});
