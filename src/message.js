export function playerLabel(profile, wallet) {
  return profile?.displayName?.trim() || profile?.fallbackName || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export function totalBuiltAndQueued(built, activeQueue, backlog, ship) {
  return [activeQueue, ...backlog].reduce((total, queue) =>
    total + (queue.active && Number(queue.ship) === ship ? BigInt(queue.quantity) : 0n),
  BigInt(built)).toString();
}

export function projectedSatelliteEnergy(total, temperature) {
  // VeydriftGame.energyBalance passes planet.temperature directly as maxTemperature.
  // BigInt division truncates toward zero, matching Solidity before the 1..65 clamp.
  const raw = (BigInt(temperature) + 140n) / 6n;
  const perSatellite = raw < 1n ? 1n : raw > 65n ? 65n : raw;
  return BigInt(total) * perSatellite;
}

export function formatAnnouncement({ player, coordinates, total, queued, projectedEnergy }) {
  const satellite = queued === "1" ? "satellite" : "satellites";
  return `🛰 ${player} is building ${queued} more solar ${satellite} on [${coordinates}] (built/queued: ${total}; projected satellite energy after queues finish: ${projectedEnergy})`;
}

export function shouldAlert(projectedEnergy) {
  return BigInt(projectedEnergy) >= 50_000n;
}
