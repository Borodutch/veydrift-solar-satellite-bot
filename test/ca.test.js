import test from "node:test";
import assert from "node:assert/strict";
import { CA_QUESTION, CA_REPLY, answerCa } from "../src/ca.js";

test("matches ca on its own, not inside other messages", () => {
  for (const text of ["ca", "CA", " Ca ", "ca?", "/ca", "/ca@veydrift_bot"]) assert.ok(CA_QUESTION.test(text), text);
  for (const text of ["cat", "what is the ca", "ca pls", "carbon", "c a"]) assert.ok(!CA_QUESTION.test(text), text);
});

test("replies to the asking message with the address in <code>", async () => {
  let handler;
  const bot = { hears: (pattern, fn) => { assert.equal(pattern, CA_QUESTION); handler = fn; }, catch: () => {} };
  answerCa(bot);
  const sent = [];
  await handler({ msg: { message_id: 42 }, reply: (text, options) => sent.push([text, options]) });
  assert.deepEqual(sent, [[CA_REPLY, { parse_mode: "HTML", reply_parameters: { message_id: 42, allow_sending_without_reply: true } }]]);
  assert.equal(CA_REPLY, "$VEYDRIFT on Base:\n<code>0x442E9Ba64899d6B0bD25DF2558d3E804427bF448</code>");
});
