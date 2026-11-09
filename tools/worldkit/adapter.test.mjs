import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { importOpenWorld, stableJSON } from "./adapter.mjs";
import { isLandWalkable, isLandSegmentWalkable } from "./geometry.mjs";
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/connected.json", import.meta.url)),
);
const mapping = JSON.parse(
  await readFile(new URL("./fixtures/mapping.json", import.meta.url)),
);
const copy = (x) => structuredClone(x);
const errors = (result) =>
  result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
const single = (rows, heights) => ({
  map: {
    id: "local",
    width: rows[0].length,
    height: rows.length,
    rows,
    ...(heights ? { heights } : {}),
    portals: [],
  },
  entities: [],
});
const localConfig = {
  ...mapping,
  targets: { local: "hub" },
  spawns: { local: [0, 0] },
  connectors: {},
};

test("connected maps emit actual LandMap shape, blockers, portals, anchors and deterministic draft", () => {
  const result = importOpenWorld(fixture, mapping);
  assert.deepEqual(errors(result), []);
  assert.equal(result.valid, true);
  assert.equal(result.publishable, false);
  assert.equal(result.status, "draft");
  assert.deepEqual(Object.keys(result.landMaps), ["hub", "forest"]);
  assert.equal(result.landMaps.hub.width, 320);
  assert.equal(
    result.landMaps.hub.obstacles[0].id,
    "bandar_draft.entity.shade_tree",
  );
  assert.equal(result.landMaps.hub.obstacles[0].width, 19.2);
  assert.equal(result.portals.length, 2);
  assert.equal(result.anchors.length, 2);
  assert.equal(
    stableJSON(importOpenWorld(fixture, mapping)),
    stableJSON(result),
  );
  assert.equal(isLandWalkable(result.landMaps.hub, { x: 160, y: 96 }), false);
  assert.equal(isLandWalkable(result.landMaps.hub, { x: 32, y: 160 }), true);
  assert.equal(
    isLandWalkable(result.landMaps.hub, { x: 8, y: 160 }),
    false,
    "body cannot hang over shoreline",
  );
});
test("water and obstacle segments cannot be bypassed by valid endpoints", () => {
  const map = importOpenWorld(single(["gg~gg", "gg~gg"]), localConfig);
  assert.ok(errors(map).includes("DISCONNECTED"));
  assert.equal(
    isLandSegmentWalkable(
      map.landMaps.hub,
      { x: 32, y: 32 },
      { x: 288, y: 32 },
    ),
    false,
  );
  const connected = importOpenWorld(fixture, mapping).landMaps.hub;
  assert.equal(
    isLandSegmentWalkable(connected, { x: 96, y: 96 }, { x: 224, y: 96 }),
    false,
  );
});
test("height digits require explicit scale and stairs, never flattening to fake walkability", () => {
  assert.ok(
    errors(importOpenWorld(single(["gg"], ["02"]), localConfig)).includes(
      "HEIGHT_DISCONTINUITY",
    ),
  );
  const config = copy(localConfig);
  config.connectors.local = [
    {
      id: "up",
      type: "stairs",
      from: [0, 0],
      to: [1, 0],
      width: 40,
      steps: 4,
      material: "stone",
    },
  ];
  const result = importOpenWorld(single(["gg"], ["02"]), config);
  assert.deepEqual(errors(result), []);
  assert.equal(result.landMaps.hub.stairs[0].from, "local.level.0");
  assert.equal(result.landMaps.hub.stairs[0].to, "local.level.1");
  assert.equal(result.landMaps.hub.surfaces[1].elevation, 1);
  assert.ok(
    errors(importOpenWorld(single(["gg"], ["0x"]), config)).includes("HEIGHTS"),
  );
  assert.ok(
    errors(
      importOpenWorld(single(["gg"]), { ...config, heightScale: undefined }),
    ).includes("CONFIG"),
  );
});
test("invalid, blocked, unknown-target, disconnected and duplicate portals are rejected", () => {
  for (const [name, mutate, expected] of [
    [
      "water target",
      (f) => (f.maps[1].map.rows[2] = "~gggg"),
      "PORTAL_BLOCKED",
    ],
    ["outside", (f) => (f.maps[0].map.portals[0].x = 50), "PORTAL_BLOCKED"],
    [
      "missing map",
      (f) => (f.maps[0].map.portals[0].to = "unknown"),
      "PORTAL_TARGET",
    ],
    [
      "disconnected regions",
      (f) => (f.maps[0].map.portals = []),
      "MAP_DISCONNECTED",
    ],
    [
      "duplicate",
      (f) => f.maps[0].map.portals.push(copy(f.maps[0].map.portals[0])),
      "PORTAL_DUPLICATE",
    ],
  ]) {
    const f = copy(fixture);
    mutate(f);
    assert.ok(errors(importOpenWorld(f, mapping)).includes(expected), name);
  }
});
test("source IDs remain stable after reordering, unsupported features produce diagnostics", () => {
  const f = copy(fixture);
  f.maps.reverse();
  assert.deepEqual(
    importOpenWorld(f, mapping).landMaps,
    importOpenWorld(fixture, mapping).landMaps,
  );
  const unknown = copy(fixture);
  unknown.maps[0].entities[0].type = "unknown/creature";
  assert.ok(
    errors(importOpenWorld(unknown, mapping)).includes("ENTITY_UNSUPPORTED"),
  );
  const invalid = copy(fixture);
  invalid.maps[0].entities.push(copy(invalid.maps[0].entities[0]));
  assert.ok(errors(importOpenWorld(invalid, mapping)).includes("ENTITY_ID"));
  const terrain = copy(fixture);
  terrain.maps[0].map.rows[0] = "?gggg";
  assert.ok(
    errors(importOpenWorld(terrain, mapping)).includes("TILE_UNSUPPORTED"),
  );
  const upstairs = copy(fixture);
  upstairs.maps[0].entities[0].place.z = 1;
  assert.ok(
    errors(importOpenWorld(upstairs, mapping)).includes("ENTITY_PLACE"),
  );
});
test("story gates and entity behaviors remain diagnostics, never imported runtime rules", () => {
  const f = copy(fixture);
  f.maps[0].map.portals[0].opensWhen = "old-story-gate";
  f.maps[0].entities[0].ai = { behavior: "attack" };
  const result = importOpenWorld(f, mapping);
  assert.equal(result.valid, true);
  assert.ok(result.diagnostics.some((d) => d.code === "STORY_REVIEW"));
  assert.ok(result.diagnostics.some((d) => d.code === "ENTITY_FIELDS"));
  assert.equal(
    result.portals.find((p) => p.requiresStoryFact).enabledByDefault,
    false,
  );
  assert.ok(!("ai" in result.landMaps.hub.obstacles[0]));
  f.maps[0].map.portals[0].opensWhen = { execute: "do-something" };
  assert.ok(errors(importOpenWorld(f, mapping)).includes("PORTAL_CONDITION"));
});
test("malformed rows, connector, blocked anchor, mapping and oversized footprint reject safely", () => {
  const rows = copy(fixture);
  rows.maps[0].map.rows[0] = "gg";
  assert.ok(errors(importOpenWorld(rows, mapping)).includes("ROWS"));
  const anchor = copy(fixture);
  anchor.maps[0].map.anchors.notice = [-1, 0];
  assert.ok(
    errors(importOpenWorld(anchor, mapping)).includes("ANCHOR_BLOCKED"),
  );
  const config = copy(mapping);
  config.entities["jalasmara/tree"].size = [8, 8];
  assert.ok(
    errors(importOpenWorld(fixture, config)).includes("ENTITY_FOOTPRINT"),
  );
  const cfg = copy(localConfig);
  cfg.connectors.local = [
    { id: "jump", type: "ramp", from: [0, 0], to: [2, 0], width: 40, steps: 1 },
  ];
  assert.ok(
    errors(importOpenWorld(single(["ggg"], ["002"]), cfg)).includes(
      "CONNECTOR",
    ),
  );
});
test("CLI writes separate review output, rejects overwrite and exits2 for invalid draft", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jalasmara-worldkit-"));
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const source = fileURLToPath(
    new URL("./fixtures/connected.json", import.meta.url),
  );
  const config = fileURLToPath(
    new URL("./fixtures/mapping.json", import.meta.url),
  );
  const output = join(dir, "draft.json");
  try {
    const run = () =>
      spawnSync(
        process.execPath,
        [cli, "import", source, "--config", config, "--out", output],
        { encoding: "utf8" },
      );
    assert.equal(run().status, 0);
    const text = await readFile(output, "utf8");
    assert.equal(JSON.parse(text).publishable, false);
    assert.equal(run().status, 1);
    assert.equal(await readFile(output, "utf8"), text);
    const invalid = copy(fixture);
    invalid.maps[0].map.rows[0] = "bad";
    const invalidSource = join(dir, "invalid.json");
    const invalidOutput = join(dir, "invalid.draft.json");
    await writeFile(invalidSource, JSON.stringify(invalid));
    const bad = spawnSync(
      process.execPath,
      [
        cli,
        "import",
        invalidSource,
        "--config",
        config,
        "--out",
        invalidOutput,
      ],
      { encoding: "utf8" },
    );
    assert.equal(bad.status, 2);
    assert.equal(
      JSON.parse(await readFile(invalidOutput, "utf8")).valid,
      false,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
