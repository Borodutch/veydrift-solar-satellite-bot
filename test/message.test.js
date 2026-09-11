import test from "node:test";
import assert from "node:assert/strict";
import { formatAnnouncement, playerLabel, totalBuiltAndQueued } from "../src/message.js";

test("formats a solar satellite queue announcement", () => {
  assert.equal(formatAnnouncement({
    planetId: "42",
    name: "New Zion",
    player: "borodutch",
    galaxy: 6,
    system: 9,
    position: 1,
    total: "22",
    queued: "5"
  }), [
    "🛰 Solar satellites queued",
    "",
    "Player: borodutch",
    "Planet: New Zion [6:9:1] (#42)",
    "Already built + already queued: 22",
    "Added to queue: +5"
  ].join("\n"));
});

test("falls back to the planet id when the planet is unnamed", () => {
  const message = formatAnnouncement({
    planetId: "7",
    name: "",
    player: "0x1234...abcd",
    total: "1",
    queued: "1"
  });

  assert.match(message, /Planet: Planet #7 \(#7\)/);
});

test("adds built satellites to active and backlog solar-satellite queues", () => {
  assert.equal(totalBuiltAndQueued(
    17n,
    { active: true, ship: 9, quantity: 2 },
    [
      { active: true, ship: 4, quantity: 100 },
      { active: true, ship: 9, quantity: 3 }
    ],
    9
  ), "22");
});

test("uses the display name with a wallet fallback", () => {
  assert.equal(playerLabel({ displayName: " borodutch ", fallbackName: "fallback" }, "0x1234567890"), "borodutch");
  assert.equal(playerLabel(null, "0x1234567890abcdef"), "0x1234...cdef");
});
