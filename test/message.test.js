import test from "node:test";
import assert from "node:assert/strict";
import { formatAnnouncement, playerLabel, projectedSatelliteEnergy, shouldAlert, totalBuiltAndQueued } from "../src/message.js";

test("formats counts and explicitly projected energy with name and coordinates", () => {
  assert.equal(formatAnnouncement({ coordinates: "6:9:1", player: "borodutch", total: "1000", queued: "5", projectedEnergy: 50000n }),
    "🛰 borodutch is building 5 more solar satellites on [6:9:1] (built/queued: 1000; projected satellite energy after queues finish: 50000)");
  assert.match(formatAnnouncement({ player: "borodutch", coordinates: "1:2:3", total: "1000", queued: "1", projectedEnergy: 50000n }), /1 more solar satellite on/);
});

test("adds built, active and backlog satellites but not inactive or other ships", () => {
  const total = totalBuiltAndQueued(700n, { active: true, ship: 9, quantity: 200 }, [
    { active: true, ship: 4, quantity: 1000 },
    { active: false, ship: 9, quantity: 1000 },
    { active: true, ship: 9, quantity: 100 }
  ], 9);
  assert.equal(total, "1000");
  assert.equal(projectedSatelliteEnergy(total, 160), 50000n);
  assert.equal(totalBuiltAndQueued(17n, { active: false, ship: 9, quantity: 100 }, [], 9), "17");
  assert.equal(totalBuiltAndQueued(17n, { active: true, ship: 4, quantity: 100 }, [], 9), "17");
});

test("uses the display name with a wallet fallback", () => {
  assert.equal(playerLabel({ displayName: " borodutch ", fallbackName: "fallback" }, "0x1234567890"), "borodutch");
  assert.equal(playerLabel(null, "0x1234567890abcdef"), "0x1234...cdef");
});

test("50,000 projected energy is an inclusive threshold", () => {
  assert.equal(shouldAlert(49999n), false);
  assert.equal(shouldAlert(50000n), true);
  assert.equal(shouldAlert(50001n), true);
  assert.equal(shouldAlert(projectedSatelliteEnergy(0n, 250)), false);
});

test("equal counts qualify on a hot planet but not on a cold planet", () => {
  assert.equal(projectedSatelliteEnergy("1000", 160), 50000n);
  assert.equal(projectedSatelliteEnergy("1000", -100), 6000n);
  assert.equal(shouldAlert(projectedSatelliteEnergy("1000", 160)), true);
  assert.equal(shouldAlert(projectedSatelliteEnergy("1000", -100)), false);
});

test("matches Solidity per-satellite rounding and caps across int16 temperatures", () => {
  for (const [temperature, energy] of [[-32768, 1n], [-147, 1n], [-141, 1n], [-140, 1n], [-134, 1n], [-129, 1n], [-128, 2n], [0, 23n], [159, 49n], [160, 50n], [165, 50n], [166, 51n], [249, 64n], [250, 65n], [256, 65n], [32767, 65n]]) {
    assert.equal(projectedSatelliteEnergy(1n, temperature), energy, String(temperature));
  }
  // Round each satellite before multiplying, not the combined energy afterward.
  assert.equal(projectedSatelliteEnergy(3n, 159), 147n);
  assert.equal(projectedSatelliteEnergy(9007199254740993n, 250), 585467951558164545n);
});
