export function playerLabel(profile, wallet) {
  return profile?.displayName?.trim() || profile?.fallbackName || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function totalBuiltAndQueued(built, activeQueue, backlog, ship) {
  return [activeQueue, ...backlog].reduce((total, queue) =>
    total + (queue.active && Number(queue.ship) === ship ? BigInt(queue.quantity) : 0n),
  BigInt(built)).toString();
}

export function formatAnnouncement({ planetId, name, player, galaxy, system, position, total, queued }) {
  const coordinates = galaxy && system && position ? ` [${galaxy}:${system}:${position}]` : "";
  const planet = name?.trim() || `Planet #${planetId}`;

  return [
    "🛰 Solar satellites queued",
    "",
    `Player: ${player}`,
    `Planet: ${planet}${coordinates} (#${planetId})`,
    `Already built + already queued: ${total}`,
    `Added to queue: +${queued}`
  ].join("\n");
}
