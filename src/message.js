export function playerLabel(profile, wallet) {
  return profile?.displayName?.trim() || profile?.fallbackName || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function totalBuiltAndQueued(built, activeQueue, backlog, ship) {
  return [activeQueue, ...backlog].reduce((total, queue) =>
    total + (queue.active && Number(queue.ship) === ship ? BigInt(queue.quantity) : 0n),
  BigInt(built)).toString();
}

export function formatAnnouncement({ player, total, queued }) {
  const satellite = queued === "1" ? "satellite" : "satellites";
  return `🛰 ${player} is building ${queued} more solar ${satellite} (already built/queued: ${total})`;
}
