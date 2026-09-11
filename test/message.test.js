import test from "node:test";
import assert from "node:assert/strict";
import { formatAnnouncement, playerLabel, totalBuiltAndQueued } from "../src/message.js";

test("formats a solar satellite queue announcement", () => {
  assert.equal(formatAnnouncement({
    coordinates: "6:9:1",
    player: "borodutch",
    total: "22",
    queued: "5"
  }), "🛰 borodutch is building 5 more solar satellites on [6:9:1] (already built/queued: 22)");
});

test("uses singular satellite for a queue of one", () => {
  assert.equal(formatAnnouncement({ player: "borodutch", coordinates: "1:2:3", total: "1", queued: "1" }),
    "🛰 borodutch is building 1 more solar satellite on [1:2:3] (already built/queued: 1)");
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
