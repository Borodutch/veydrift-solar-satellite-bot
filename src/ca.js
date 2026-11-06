export const VEYDRIFT_TOKEN = "0x442E9Ba64899d6B0bD25DF2558d3E804427bF448";

/** "ca", "CA", "ca?" or "/ca" (also "/ca@bot") on its own. */
export const CA_QUESTION = /^\s*\/?ca(@\w+)?\s*\??\s*$/i;

/** Telegram HTML: <code> renders monospace and copies on tap. */
export const CA_REPLY = `$VEYDRIFT on Base:\n<code>${VEYDRIFT_TOKEN}</code>`;

/** Replies to "ca" messages with the token address. */
export function answerCa(bot) {
  bot.hears(CA_QUESTION, (ctx) => ctx.reply(CA_REPLY, {
    parse_mode: "HTML",
    reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true }
  }));
  bot.catch((error) => console.error("Telegram update failed", error));
}
