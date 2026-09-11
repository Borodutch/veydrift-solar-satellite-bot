export function formatAnnouncement({ planetId, name, galaxy, system, position, built, queued, transactionHash }) {
  const coordinates = galaxy && system && position ? ` [${galaxy}:${system}:${position}]` : "";
  const planet = name?.trim() || `Planet #${planetId}`;

  return [
    "🛰 Solar satellites queued",
    "",
    `Planet: ${planet}${coordinates} (#${planetId})`,
    `Already built: ${built}`,
    `Added to queue: +${queued}`,
    "",
    `Transaction: https://basescan.org/tx/${transactionHash}`
  ].join("\n");
}
