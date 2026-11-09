# JalasmaraWorldKit: offline map drafts

Convert locally authored OpenWorld `map` + `entities` JSON into editable Jalasmara land geometry. This is an original adapter, not the OpenWorld engine, a Godot replacement, or a publishing service. It uses Node.js built-ins and the files in this directory; no package installation or network access is required to run it.

## Run

```sh
node --test tools/worldkit/adapter.test.mjs
node tools/worldkit/cli.mjs import tools/worldkit/fixtures/connected.json \
  --config tools/worldkit/fixtures/mapping.json --out /tmp/my-world-draft.json
```

Input may be one raw `{map, entities}` object, an array of such objects, or `{maps: [...]}`. The supplied synthetic fixture contains two connected maps and one tree. `fixtures/connected.draft.json` is its actual generated output. The CLI creates a new output file exclusively: choose a new filename for each conversion. It refuses to overwrite source, config, or an existing draft.

Exit codes: `0` valid review draft; `2` draft written with validation errors; `1` I/O, JSON, usage, or overwrite failure. Invalid geometry is retained with diagnostics for editing, never silently flattened into apparently valid terrain.

## Author mapping

Start from `fixtures/mapping.json`:

- `tileSize`: world pixels per source cell,32–512. Current physics clearance is12pixels; smaller source art may be scaled explicitly.
- `heightScale`: **required** elevation levels per source height digit. OpenWorld calls these half levels; use `0.5` to preserve that convention. A Jalasmara elevation level renders as48world pixels.
- `targets`: source map ID → `hub` or `forest`. Each target is unique. This first adapter deliberately supports only those two current runtime IDs, at most4096cells per map.
- `spawns`: explicit `[column,row]` for every map. Points convert to tile centres, not corners.
- `tiles`: each used character maps to `{material: "grass"}` or `{blocked: true}`. Blocked tiles emit no floor; water/void cannot become walkable through a default mapping. Valid materials: dirt, grass, sand, stone, dock, bridge, wood.
- `entities`: exact source type → obstacle definition `{kind,size:[width,height],height3d,variant?}`. **Size is in tile units**, centred on the placed source cell; `height3d` is world pixels. Kinds: house, tree, rock, garden, crate, fence, cliff. A `{mode:"anchor"}` mapping preserves a non-solid observation/NPC position without inventing rewards or behavior. Only `place.on:"tile"`, the matching map ID, integer tile positions and ground storey0 are accepted.
- `connectors`: source map ID → explicit stair/ramp array. Example:

```json
{
  "local": [
    {
      "id": "courtyard_steps",
      "type": "stairs",
      "from": [0, 0],
      "to": [1, 0],
      "width": 40,
      "steps": 4,
      "material": "stone"
    }
  ]
}
```

Connector endpoints must be adjacent walkable cells with different elevations. Width is world pixels,32..tileSize; endpoint order is normalized low→high. Non-adjacent ramps, automatic bridges over void, roofs, and multi-storey interiors require manual authoring. Every differing-height adjacent edge is rejected unless explicitly linked: cliffs are not silently accepted as stairs.

## Output and review boundary

The envelope has `schema`, `status:"draft"`, `valid`, `publishable:false`, source/config hashes, diagnostics, `landMaps`, `anchors`, and `portals`. Each `landMaps.hub/forest` value follows the current Jalasmara `LandMap` fields: dimensions, layoutVersion, spawn, polygon surfaces, footprint obstacles, stairs, terraces, bridges and routes. Same-material/elevation horizontal runs become floor rectangles with coordinate-based IDs. Entity IDs are source-ID based; reordering entities/maps does not rename them. No wall-clock timestamp is included, so identical inputs produce byte-stable JSON via `stableJSON`.

This output can be read by a local preview as `draft.landMaps`; it is **not** safe to replace the production manifest automatically. `layoutVersion:1` describes a new candidate, not a deployed save migration. Portals/anchors remain separate review metadata because the current game has explicit server-owned interaction/story contracts. Portal source/target cells require valid ground, clearance and local reachability; imported maps need an explicit portal path from the hub. `opensWhen` is preserved as a story requirement, not evaluated or enabled by this tool.

Validation uses the same mathematical contract as current Jalasmara land physics: centre plus eight floor probes at12pixels, obstacle footprint/edge clearance, and path samples no farther than6pixels apart. Connectivity is a conservative four-neighbor **tile-centre** graph, respecting authored height links. It may reject narrow sub-tile routes that a hand-authored map could support; edit the source/mapping and inspect the preview rather than suppressing that error. It does not prove arbitrary continuous-path reachability, roof occlusion, visual quality, save compatibility, or story correctness.

Unknown terrain/entities are errors. Render hints, stamps, schedules, combat, loot, inventory and other non-geometric fields are diagnosed instead of becoming game rules. No upstream art, audio, fonts, model files, LLM behavior or runtime code is imported. No API, credential, database or live `WORLD` write exists in this tool.

## Provenance

The pinned OpenWorld schema/example references and license distinctions are recorded in `source.json`. This implementation and the synthetic fixtures are original; no upstream code or source map is redistributed. The reference format is pinned to commit `076ab27d5312416cbabe19c12b90e086f5fc32d7`. Upstream code uses MIT, with separate exceptions for some artwork/audio/font directories; those assets are outside this adapter.
