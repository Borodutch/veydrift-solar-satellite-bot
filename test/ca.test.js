import test from "node:test";
import assert from "node:assert/strict";
import { ANSWERS, answerCa } from "../src/ca.js";

const [CA, TWITTER] = ANSWERS;

test("matches the word on its own, not inside other messages", () => {
  for (const text of ["ca", "CA", " Ca ", "ca?", "/ca", "/ca@veydrift_bot"]) assert.ok(CA.question.test(text), text);
  for (const text of ["cat", "what is the ca", "ca pls", "carbon", "c a"]) assert.ok(!CA.question.test(text), text);
  for (const text of ["twitter", "Twitter?", "/twitter"]) assert.ok(TWITTER.question.test(text), text);
  for (const text of ["twitter is down", "x"]) assert.ok(!TWITTER.question.test(text), text);
});

test("replies to the asking message in HTML", async () => {
  const handlers = [];
  answerCa({ hears: (pattern, fn) => handlers.push([pattern, fn]), catch: () => {} });
  assert.deepEqual(handlers.map(([pattern]) => pattern), ANSWERS.map((a) => a.question));
  const sent = [];
  for (const [, fn] of handlers) await fn({ msg: { message_id: 42 }, reply: (text, options) => sent.push([text, options]) });
  const options = { parse_mode: "HTML", reply_parameters: { message_id: 42, allow_sending_without_reply: true } };
  assert.deepEqual(sent, [
    ["$VEYDRIFT on Base:\n<code>0x442E9Ba64899d6B0bD25DF2558d3E804427bF448</code>", options],
    ['<a href="https://x.com/veydrift">x.com/veydrift</a>', options]
  ]);
});
