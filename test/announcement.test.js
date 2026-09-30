import test from "node:test";
import assert from "node:assert/strict";
import { readAnnouncement } from "../src/index.js";

test("block-pinned announcement uses the whole snapshot exactly once and no count bypass", async (t) => {
  const profile = t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ displayName: "borodutch" }) }));
  const log = { blockNumber: 123n, args: { planetId: 7n, quantity: 100 } };
  const config = { contractAddress: "0x1234", apiUrl: "https://example.invalid" };
  const snapshot = {
    shipCount: 700n,
    planet: { owner: "0x1234567890abcdef", galaxy: 6, system: 9, position: 1, temperature: 160 },
    shipQueue: { active: true, ship: 9, quantity: 200 },
    shipQueueBacklog: [{ active: true, ship: 9, quantity: 100 }, { active: true, ship: 4, quantity: 50000 }, { active: false, ship: 9, quantity: 50000 }]
  };
  const reads = [];
  const client = { readContract: async (request) => {
    reads.push(request.functionName);
    assert.equal(request.blockNumber, log.blockNumber);
    assert.equal(request.address, config.contractAddress);
    assert.deepEqual(request.args, request.functionName === "shipCount" ? [7n, 9] : [7n]);
    return snapshot[request.functionName];
  } };
  assert.equal(await readAnnouncement(client, config, log),
    "🛰 borodutch is building 100 more solar satellites on [6:9:1] (built/queued: 1000; projected satellite energy after queues finish: 50000)");
  assert.deepEqual(reads.sort(), ["planet", "shipCount", "shipQueue", "shipQueueBacklog"]);
  assert.equal(profile.mock.callCount(), 1);

  // If the event quantity were added a second time, this would falsely qualify.
  snapshot.shipCount = 699n;
  assert.equal(await readAnnouncement(client, config, log), null);
  snapshot.shipCount = 700n;
  snapshot.planet.temperature = -100;
  assert.equal(await readAnnouncement(client, config, log), null);
  // Both obsolete count gates (total >= 300, new queue >= 50) stay suppressed.
  assert.equal(profile.mock.callCount(), 1);

  snapshot.planet.temperature = -140; // One energy each: exact threshold boundaries.
  snapshot.shipCount = 49699n;
  assert.equal(await readAnnouncement(client, config, log), null);
  snapshot.shipCount = 49700n;
  assert.match(await readAnnouncement(client, config, log), /projected satellite energy after queues finish: 50000/);
});
