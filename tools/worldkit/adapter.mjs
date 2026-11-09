import { createHash } from "node:crypto";
import { isLandWalkable, isLandSegmentWalkable, inside } from "./geometry.mjs";

const MATERIALS = new Set([
  "dirt",
  "grass",
  "sand",
  "stone",
  "dock",
  "bridge",
  "wood",
]);
const KINDS = new Set([
  "house",
  "tree",
  "rock",
  "garden",
  "crate",
  "fence",
  "cliff",
]);
const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const pair = (p) =>
  Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const cellKey = (x, y) => `${x},${y}`;
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const stableJSON = (value) =>
  JSON.stringify(canonical(value), null, 2) + "\n";
const digest = (value) =>
  createHash("sha256").update(stableJSON(value)).digest("hex");

/** Offline conversion only. The result is never a publish request. */
export function importOpenWorld(input, config) {
  const diagnostics = [];
  const report = (severity, code, location, message) =>
    diagnostics.push({ severity, code, location, message });
  const fail = (code, at, message) => report("error", code, at, message);
  const warn = (code, at, message) => report("warning", code, at, message);
  const result = {
    schema: "jalasmara.worldkit.draft.v1",
    status: "draft",
    publishable: false,
    valid: false,
    source: {
      format: "openworld-map-entities",
      referenceCommit: "076ab27d5312416cbabe19c12b90e086f5fc32d7",
      inputHash: digest(input),
      configHash: digest(config),
    },
    landMaps: {},
    portals: [],
    anchors: [],
    diagnostics,
  };
  if (
    !config ||
    !Number.isFinite(config.tileSize) ||
    config.tileSize < 32 ||
    config.tileSize > 512 ||
    !Number.isFinite(config.heightScale) ||
    config.heightScale <= 0 ||
    config.heightScale > 1
  ) {
    fail(
      "CONFIG",
      "config",
      "Explicit tileSize32..512 and heightScale>0..1 are required; OpenWorld height digits represent half levels.",
    );
    return result;
  }
  const chunks = Array.isArray(input)
    ? input
    : Array.isArray(input?.maps)
      ? input.maps
      : [input];
  if (!chunks.length || chunks.length > 2) {
    fail(
      "MAP_COUNT",
      "maps",
      "This adapter targets the current hub/forest contract; import one or two maps per review draft.",
    );
    return result;
  }
  const tile = config.tileSize;
  const body = 12;
  const states = new Map();
  for (const chunk of [...chunks].sort((a, b) =>
    String(a?.map?.id).localeCompare(String(b?.map?.id)),
  )) {
    const raw = chunk?.map;
    const id = raw?.id;
    const at = `map:${id ?? "missing"}`;
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9_.-]+$/.test(id) ||
      states.has(id)
    ) {
      fail("MAP_ID", at, "Map IDs must be unique stable ASCII identifiers.");
      continue;
    }
    const target = config.targets?.[id];
    if (!["hub", "forest"].includes(target) || result.landMaps[target]) {
      fail(
        "TARGET",
        at,
        "Each source map needs a unique explicit hub or forest target.",
      );
      continue;
    }
    const { width, height, rows } = raw;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > 4096 ||
      !Array.isArray(rows) ||
      rows.length !== height ||
      rows.some((row) => typeof row !== "string" || [...row].length !== width)
    ) {
      fail(
        "ROWS",
        at,
        "Declared dimensions must match rectangular character rows (maximum4096cells).",
      );
      continue;
    }
    const levels = raw.heights ?? Array(height).fill("0".repeat(width));
    if (
      !Array.isArray(levels) ||
      levels.length !== height ||
      levels.some(
        (row) =>
          typeof row !== "string" || row.length !== width || !/^\d+$/.test(row),
      )
    ) {
      fail(
        "HEIGHTS",
        at,
        "Height rows must match dimensions and contain one decimal digit per cell.",
      );
      continue;
    }
    const spawn = config.spawns?.[id];
    if (!pair(spawn) || !spawn.every(Number.isInteger)) {
      fail("SPAWN", at, "Author an explicit integer tile-coordinate spawn.");
      continue;
    }
    const center = (p) => ({ x: (p[0] + 0.5) * tile, y: (p[1] + 0.5) * tile });
    const land = {
      id: target,
      layoutVersion: 1,
      width: width * tile,
      height: height * tile,
      spawn: center(spawn),
      surfaces: [],
      obstacles: [],
      stairs: [],
      bridges: [],
      terraces: [],
      routes: [],
    };
    const cells = new Map();
    const sourceRows = rows.map((row) => [...row]);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const char = sourceRows[y][x];
        const definition = config.tiles?.[char];
        if (
          !definition ||
          (definition.blocked !== true && !MATERIALS.has(definition.material))
        ) {
          fail(
            "TILE_UNSUPPORTED",
            `${at}:${x},${y}`,
            `Tile ${JSON.stringify(char)} needs an explicit material or blocked:true mapping.`,
          );
          continue;
        }
        if (definition.blocked === true) continue;
        cells.set(cellKey(x, y), {
          x,
          y,
          material: definition.material,
          elevation: Number(levels[y][x]) * config.heightScale,
        });
      }
    // Same-material/elevation horizontal runs produce editable floor polygons without overlapping strata.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width;) {
        const first = cells.get(cellKey(x, y));
        if (!first) {
          x++;
          continue;
        }
        let end = x + 1;
        while (end < width) {
          const next = cells.get(cellKey(end, y));
          if (
            !next ||
            next.material !== first.material ||
            next.elevation !== first.elevation
          )
            break;
          end++;
        }
        land.surfaces.push({
          id: `${id}.floor.${x}.${y}.${end - x}`,
          polygon: rect(x * tile, y * tile, (end - x) * tile, tile),
          material: first.material,
          elevation: first.elevation,
        });
        x = end;
      }
    const elevations = [
      ...new Set([...cells.values()].map((c) => c.elevation)),
    ].sort((a, b) => a - b);
    const levelId = (elevation) => `${id}.level.${elevation}`;
    land.terraces = elevations.map((elevation) => ({
      id: levelId(elevation),
      elevation,
    }));
    const links = new Set();
    const connectorIds = new Set();
    const authoredConnectors = config.connectors?.[id] ?? [];
    if (!Array.isArray(authoredConnectors))
      fail("CONNECTOR", at, "Connector mappings must be arrays.");
    for (const entry of Array.isArray(authoredConnectors)
      ? authoredConnectors
      : []) {
      if (!entry || typeof entry !== "object") {
        fail("CONNECTOR", at, "Each connector must be an object.");
        continue;
      }
      const loc = `${at}:connector:${entry.id}`;
      if (
        typeof entry.id !== "string" ||
        connectorIds.has(entry.id) ||
        !pair(entry.from) ||
        !pair(entry.to) ||
        ![...entry.from, ...entry.to].every(Number.isInteger)
      ) {
        fail(
          "CONNECTOR",
          loc,
          "Connectors need a unique ID and integer from/to tile pairs.",
        );
        continue;
      }
      connectorIds.add(entry.id);
      const a = cells.get(cellKey(...entry.from)),
        b = cells.get(cellKey(...entry.to));
      if (
        !a ||
        !b ||
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1 ||
        a.elevation === b.elevation ||
        !["stairs", "ramp"].includes(entry.type) ||
        !Number.isFinite(entry.width) ||
        entry.width < 32 ||
        entry.width > tile ||
        !Number.isInteger(entry.steps) ||
        entry.steps < 1
      ) {
        fail(
          "CONNECTOR",
          loc,
          "Stairs/ramps must connect adjacent walkable cells of different elevation, width32..tileSize and positive integer steps.",
        );
        continue;
      }
      const low = a.elevation < b.elevation ? a : b,
        high = low === a ? b : a;
      const p = center([low.x, low.y]),
        q = center([high.x, high.y]);
      const half = entry.width / 2;
      const poly =
        p.y === q.y
          ? rect(
              Math.min(p.x, q.x) - half,
              p.y - half,
              Math.abs(p.x - q.x) + entry.width,
              entry.width,
            )
          : rect(
              p.x - half,
              Math.min(p.y, q.y) - half,
              entry.width,
              Math.abs(p.y - q.y) + entry.width,
            );
      const connectorId = `${id}.connector.${entry.id}`;
      land.stairs.push({
        id: connectorId,
        type: entry.type,
        path: [
          [p.x, p.y],
          [q.x, q.y],
        ],
        width: entry.width,
        steps: entry.steps,
        from: levelId(low.elevation),
        to: levelId(high.elevation),
        x: p.x,
        y: p.y,
        material: entry.material ?? "stone",
      });
      if (!MATERIALS.has(entry.material ?? "stone"))
        fail("CONNECTOR_MATERIAL", loc, "Unknown connector material.");
      land.surfaces.push({
        id: `${connectorId}.floor`,
        connectorId,
        polygon: poly,
        material: entry.material ?? "stone",
        elevation: low.elevation,
        priority: 20,
      });
      links.add([cellKey(a.x, a.y), cellKey(b.x, b.y)].sort().join("|"));
    }
    const entityIds = new Set();
    if (!Array.isArray(chunk.entities))
      fail(
        "ENTITIES",
        at,
        "entities must be an explicit array, including when empty.",
      );
    for (const entity of (Array.isArray(chunk.entities)
      ? [...chunk.entities]
      : []
    ).sort((a, b) => String(a?.id).localeCompare(String(b?.id)))) {
      if (!entity || typeof entity !== "object") {
        fail("ENTITY", at, "Each entity must be an object.");
        continue;
      }
      const loc = `${at}:entity:${entity.id}`;
      if (typeof entity.id !== "string" || entityIds.has(entity.id)) {
        fail(
          "ENTITY_ID",
          loc,
          "Entity IDs must be present and unique within their source map.",
        );
        continue;
      }
      entityIds.add(entity.id);
      const place = entity.place;
      if (
        !place ||
        place.on !== "tile" ||
        place.map !== id ||
        !Number.isInteger(place.x) ||
        !Number.isInteger(place.y) ||
        (place.z ?? 0) !== 0
      ) {
        fail(
          "ENTITY_PLACE",
          loc,
          "Only explicit tile placements on this map at ground storey0 are supported.",
        );
        continue;
      }
      const cell = cells.get(cellKey(place.x, place.y));
      const definition = config.entities?.[entity.type];
      if (!definition) {
        fail(
          "ENTITY_UNSUPPORTED",
          loc,
          `No author mapping for entity type ${entity.type}.`,
        );
        continue;
      }
      const p = center([place.x, place.y]);
      const extras = Object.keys(entity).filter(
        (k) => !["id", "type", "place"].includes(k),
      );
      if (extras.length)
        warn(
          "ENTITY_FIELDS",
          loc,
          `Not imported as game rules: ${extras.sort().join(", ")}.`,
        );
      if (definition.mode === "anchor") {
        result.anchors.push({
          id: `${id}.entity.${entity.id}`,
          map: target,
          sourceMap: id,
          x: p.x,
          y: p.y,
          sourceType: entity.type,
        });
        continue;
      }
      if (
        !KINDS.has(definition.kind) ||
        !pair(definition.size) ||
        definition.size.some((n) => n <= 0 || n > 8) ||
        !Number.isFinite(definition.height3d) ||
        definition.height3d < 1 ||
        definition.height3d > 1000
      ) {
        fail(
          "ENTITY_MAPPING",
          loc,
          "Obstacle mapping requires a supported kind, positive size in tile units and height3d1..1000pixels.",
        );
        continue;
      }
      if (!cell)
        fail(
          "ENTITY_GROUND",
          loc,
          "An obstacle cannot be silently placed on void or unmapped terrain.",
        );
      const w = definition.size[0] * tile,
        h = definition.size[1] * tile,
        x = p.x - w / 2,
        y = p.y - h / 2;
      if (
        cell &&
        [...rect(x, y, w, h), [p.x, p.y]].some(
          ([px, py]) =>
            !land.surfaces.some(
              (surface) =>
                surface.elevation === cell.elevation &&
                inside({ x: px, y: py }, surface.polygon),
            ),
        )
      )
        fail(
          "ENTITY_FOOTPRINT",
          loc,
          "Obstacle footprint extends beyond its source elevation floor; author a smaller footprint or an explicit floor.",
        );
      land.obstacles.push({
        id: `${id}.entity.${entity.id}`,
        kind: definition.kind,
        x,
        y,
        width: w,
        height: h,
        height3d: definition.height3d,
        footprint: rect(x, y, w, h),
        elevation: cell?.elevation ?? 0,
        ...(definition.variant ? { variant: definition.variant } : {}),
      });
    }
    if (
      raw.anchors != null &&
      (typeof raw.anchors !== "object" || Array.isArray(raw.anchors))
    )
      fail("ANCHORS", at, "Anchors must be a named-coordinate object.");
    for (const [name, point] of Object.entries(raw.anchors ?? {}).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      if (!pair(point) || !point.every(Number.isInteger)) {
        fail(
          "ANCHOR",
          `${at}:anchor:${name}`,
          "Anchor must be an integer tile pair.",
        );
        continue;
      }
      const p = center(point);
      result.anchors.push({
        id: `${id}.anchor.${name}`,
        map: target,
        sourceMap: id,
        x: p.x,
        y: p.y,
      });
    }
    const hints = Object.keys(raw).filter(
      (k) =>
        ![
          "id",
          "name",
          "kind",
          "width",
          "height",
          "rows",
          "heights",
          "portals",
          "anchors",
        ].includes(k),
    );
    if (hints.length)
      warn(
        "MAP_FIELDS",
        at,
        `Preserve in source; not imported as runtime rules: ${hints.sort().join(", ")}.`,
      );
    result.landMaps[target] = land;
    states.set(id, { raw, land, cells, links, center });
  }
  const reachable = new Map();
  for (const [id, state] of states) {
    const { land, cells, links, center } = state;
    for (const cell of cells.values())
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const other = cells.get(cellKey(cell.x + dx, cell.y + dy));
        if (
          other &&
          cell.elevation !== other.elevation &&
          !links.has(
            [cellKey(cell.x, cell.y), cellKey(other.x, other.y)]
              .sort()
              .join("|"),
          )
        )
          fail(
            "HEIGHT_DISCONTINUITY",
            `map:${id}:${cell.x},${cell.y}`,
            "Adjacent floor elevations differ without an explicit stair/ramp; review this edge.",
          );
      }
    if (!isLandWalkable(land, land.spawn, body))
      fail(
        "SPAWN_BLOCKED",
        `map:${id}`,
        "Spawn does not have authoritative12px body clearance.",
      );
    const start = config.spawns[id];
    const visited = new Set();
    const queue = isLandWalkable(land, land.spawn, body)
      ? [cellKey(...start)]
      : [];
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i];
      if (visited.has(key)) continue;
      const cell = cells.get(key);
      if (!cell) continue;
      visited.add(key);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const neighborKey = cellKey(cell.x + dx, cell.y + dy),
          next = cells.get(neighborKey);
        if (!next || visited.has(neighborKey)) continue;
        if (
          next.elevation !== cell.elevation &&
          !links.has([key, neighborKey].sort().join("|"))
        )
          continue;
        if (
          isLandSegmentWalkable(
            land,
            center([cell.x, cell.y]),
            center([next.x, next.y]),
            body,
          )
        )
          queue.push(neighborKey);
      }
    }
    reachable.set(id, visited);
    const free = [...cells.values()].filter((c) =>
      isLandWalkable(land, center([c.x, c.y]), body),
    );
    const disconnected = free.filter((c) => !visited.has(cellKey(c.x, c.y)));
    if (disconnected.length)
      fail(
        "DISCONNECTED",
        `map:${id}`,
        `${disconnected.length} traversable tile centres are disconnected from spawn (body12, authored elevation links).`,
      );
    for (const anchor of result.anchors.filter((a) => a.sourceMap === id))
      if (!isLandWalkable(land, anchor, body))
        fail(
          "ANCHOR_BLOCKED",
          anchor.id,
          "Anchor needs authoritative12px body clearance.",
        );
  }
  for (const [id, state] of states) {
    const portals = state.raw.portals;
    if (!Array.isArray(portals)) {
      fail(
        "PORTALS",
        `map:${id}`,
        "portals must be an explicit array, including when empty.",
      );
      continue;
    }
    const portalKeys = new Set();
    for (const portal of [...portals].sort((a, b) =>
      stableJSON(a).localeCompare(stableJSON(b)),
    )) {
      if (!portal || typeof portal !== "object") {
        fail("PORTAL", `map:${id}`, "Each portal must be an object.");
        continue;
      }
      const key = `${portal.x}.${portal.y}.${portal.to}.${portal.tx}.${portal.ty}`;
      const loc = `map:${id}:portal:${key}`;
      if (portalKeys.has(key)) {
        fail("PORTAL_DUPLICATE", loc, "Duplicate portal.");
        continue;
      }
      portalKeys.add(key);
      if (
        portal.opensWhen !== undefined &&
        (typeof portal.opensWhen !== "string" || !portal.opensWhen.trim())
      ) {
        fail(
          "PORTAL_CONDITION",
          loc,
          "Story prerequisites must be non-empty source fact IDs; no expression evaluation is supported.",
        );
        continue;
      }
      if (portal.opensWhen)
        warn(
          "STORY_REVIEW",
          loc,
          "Source story fact preserved for review; explicitly map it to Jalasmara before any deployment.",
        );
      const portalExtras = Object.keys(portal).filter(
        (k) => !["x", "y", "to", "tx", "ty", "label", "opensWhen"].includes(k),
      );
      if (portalExtras.length)
        warn(
          "PORTAL_FIELDS",
          loc,
          `Unsupported portal fields not applied: ${portalExtras.sort().join(", ")}.`,
        );
      const target = states.get(portal.to);
      if (
        ![portal.x, portal.y, portal.tx, portal.ty].every(Number.isInteger) ||
        !target
      ) {
        fail(
          "PORTAL_TARGET",
          loc,
          "Both endpoint tile coordinates and an imported destination map are required.",
        );
        continue;
      }
      const a = state.center([portal.x, portal.y]),
        b = target.center([portal.tx, portal.ty]);
      if (
        !isLandWalkable(state.land, a, body) ||
        !isLandWalkable(target.land, b, body) ||
        !reachable.get(id).has(cellKey(portal.x, portal.y)) ||
        !reachable.get(portal.to).has(cellKey(portal.tx, portal.ty))
      )
        fail(
          "PORTAL_BLOCKED",
          loc,
          "Both portal endpoints must be reachable walkable ground with12px clearance.",
        );
      result.portals.push({
        id: `${id}.portal.${key}`,
        from: { map: state.land.id, x: a.x, y: a.y },
        to: { map: target.land.id, x: b.x, y: b.y },
        enabledByDefault: !portal.opensWhen,
        ...(portal.opensWhen ? { requiresStoryFact: portal.opensWhen } : {}),
      });
    }
  }
  if (states.size > 1) {
    const source =
      [...states.keys()].find((id) => states.get(id).land.id === "hub") ??
      [...states.keys()][0];
    const connected = new Set([states.get(source).land.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const portal of result.portals)
        if (connected.has(portal.from.map) && !connected.has(portal.to.map)) {
          connected.add(portal.to.map);
          changed = true;
        }
    }
    for (const state of states.values())
      if (!connected.has(state.land.id))
        fail(
          "MAP_DISCONNECTED",
          `map:${state.raw.id}`,
          "No explicit portal path from the hub entry region reaches this imported map.",
        );
  }
  diagnostics.sort((a, b) =>
    `${a.location}:${a.code}:${a.message}`.localeCompare(
      `${b.location}:${b.code}:${b.message}`,
    ),
  );
  result.valid = !diagnostics.some((d) => d.severity === "error");
  return result;
}
