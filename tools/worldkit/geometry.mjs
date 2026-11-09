// Offline geometry contract: union floors, eight body probes, obstacle edge clearance.
export function segmentDistance(point, a, b) {
  const vx = b[0] - a[0],
    vy = b[1] - a[1];
  const projection =
    ((point.x - a[0]) * vx + (point.y - a[1]) * vy) / (vx * vx + vy * vy || 1);
  const t = Math.min(1, Math.max(0, projection));
  return Math.hypot(point.x - a[0] - vx * t, point.y - a[1] - vy * t);
}
export function inside(point, polygon) {
  let crossings = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    if (segmentDistance(point, a, b) < 1e-7) return true;
    if (a[1] > point.y === b[1] > point.y) continue;
    const intersect = a[0] + ((point.y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    if (intersect > point.x) crossings++;
  }
  return crossings % 2 === 1;
}
export function isLandWalkable(map, point, margin = 12) {
  if (
    ![point.x, point.y].every(Number.isFinite) ||
    point.x < 0 ||
    point.y < 0 ||
    point.x > map.width ||
    point.y > map.height
  )
    return false;
  const floor = (p) =>
    map.surfaces.some(
      (surface) => surface.walkable !== false && inside(p, surface.polygon),
    );
  if (!floor(point)) return false;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    if (
      !floor({
        x: point.x + Math.cos(angle) * margin,
        y: point.y + Math.sin(angle) * margin,
      })
    )
      return false;
  }
  for (const obstacle of map.obstacles) {
    if (inside(point, obstacle.footprint)) return false;
    for (let i = 0; i < obstacle.footprint.length; i++)
      if (
        segmentDistance(
          point,
          obstacle.footprint[i],
          obstacle.footprint[(i + 1) % obstacle.footprint.length],
        ) < margin
      )
        return false;
  }
  return true;
}
export function isLandSegmentWalkable(map, start, end, margin = 12) {
  const samples = Math.max(
    1,
    Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 6),
  );
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (
      !isLandWalkable(
        map,
        {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        },
        margin,
      )
    )
      return false;
  }
  return true;
}
