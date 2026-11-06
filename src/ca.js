export const VEYDRIFT_TOKEN = "0x442E9Ba64899d6B0bD25DF2558d3E804427bF448";

/** A message that is just `word` (any case), optionally as `/word` or `/word@bot`, with an optional "?". */
const question = (word) => new RegExp(`^\\s*\\/?${word}(@\\w+)?\\s*\\??\\s*$`, "i");

/** Telegram HTML replies; <code> renders monospace and copies on tap. */
export const ANSWERS = [
  { question: question("ca"), reply: `$VEYDRIFT on Base:\n<code>${VEYDRIFT_TOKEN}</code>` },
  { question: question("twitter"), reply: `<a href="https://x.com/veydrift">x.com/veydrift</a>` }
];

/** Replies to those messages in any chat the bot reads. */
export function answerCa(bot) {
  for (const { question, reply } of ANSWERS) {
    bot.hears(question, (ctx) => ctx.reply(reply, {
      parse_mode: "HTML",
      reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true }
    }));
  }
  bot.catch((error) => console.error("Telegram update failed", error));
}
