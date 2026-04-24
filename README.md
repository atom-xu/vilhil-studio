# VilHil Studio

A smart home solution workspace built on [Pascal Editor](https://github.com/pascalorg/editor) — design, configure, and present IoT device layouts in an interactive 3D building editor powered by React Three Fiber and WebGPU.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Fork of [`pascalorg/editor`](https://github.com/pascalorg/editor).** Upstream changes are merged periodically. VilHil-specific packages (`@vilhil/smarthome`, `apps/editor`) are not published to npm.

## What is VilHil Studio?

1. **Design mode** — architects place structural elements (walls, slabs, rooms) and smart devices (lighting, HVAC, security, networking) in 3D space.
2. **Proposal mode** — clients experience the layout interactively, toggle scenes, and visualise device coverage overlays (Wi-Fi heatmap, air flow, camera scan cones).
3. A single 3D scene powers both modes.

---

## VilHil Docs (CN)

| Document | Description |
|----------|-------------|
| [`docs/UI-START-HERE.md`](./docs/UI-START-HERE.md) | Start here (non-technical) |
| [`docs/UI-STANDARD.md`](./docs/UI-STANDARD.md) | Unified UI standard (SSOT) |
| [`docs/NAVIGATION-ARCHITECTURE.md`](./docs/NAVIGATION-ARCHITECTURE.md) | Routing & navigation |
| [`docs/BDD-REQUIREMENTS.md`](./docs/BDD-REQUIREMENTS.md) | BDD acceptance criteria |
| [`docs/STATE-FLOW.md`](./docs/STATE-FLOW.md) | State layer responsibilities |
| [`docs/DEVICE-SPEC-BRIEF.md`](./docs/DEVICE-SPEC-BRIEF.md) | Smart device product catalog |
| [`CLAUDE.md`](./CLAUDE.md) | AI collaboration standard |

---

## Repository Architecture

Turborepo monorepo. Three core packages plus the Next.js app:

```
vilhil-studio/
├── apps/
│   └── editor/              # Next.js 16 application (editor + proposal UI)
├── packages/
│   ├── core/                # @pascal-app/core — schemas, scene state, geometry systems
│   ├── viewer/              # @pascal-app/viewer — React Three Fiber 3D rendering
│   ├── smarthome/           # @vilhil/smarthome — device catalog, tools, scene helpers
│   └── editor/              # @pascal-app/editor — shared editor UI components
└── tooling/                 # TypeScript config, ESLint config
```

### Package Responsibilities

| Package | Responsibility |
|---------|---------------|
| **@pascal-app/core** | Node schemas (Zod), scene state (Zustand + Zundo), geometry systems, spatial queries, event bus |
| **@pascal-app/viewer** | 3D rendering via React Three Fiber, camera/controls, post-processing (WebGPU SSGI + outlines) |
| **@vilhil/smarthome** | Smart device catalog, device animation system, scene tools, subsystem grouping |
| **apps/editor** | UI panels, tools, auth, cloud project persistence, proposal/presentation mode |

### Stores

| Store | Package | Responsibility |
|-------|---------|----------------|
| `useScene` | `@pascal-app/core` | Scene data: nodes, root IDs, dirty nodes, CRUD. Persisted to IndexedDB with undo/redo (Zundo). |
| `useViewer` | `@pascal-app/viewer` | Viewer state: selection (building/level/zone), level display mode, camera mode, outliner. |
| `useEditor` | `apps/editor` | Editor state: active tool, panel states, focused device, editor preferences. |

**Access patterns:**

```typescript
// Subscribe to state changes (React component)
const nodes = useScene((state) => state.nodes)
const levelId = useViewer((state) => state.selection.levelId)
const activeTool = useEditor((state) => state.tool)

// Access state outside React (callbacks, systems)
const node = useScene.getState().nodes[id]
useViewer.getState().setSelection({ levelId: 'level_123' })
```

**Hard rule:** device runtime state (on/off, brightness, temperature) lives in `useScene`. UI-only preferences (panel open, highlight mode) live in `useEditor`. Never mix them.

---

## Core Concepts

### Nodes

Nodes are the data primitives that describe the 3D scene. All nodes extend `BaseNode`:

```typescript
BaseNode {
  id: string              // Auto-generated with type prefix (e.g., "wall_abc123")
  type: string            // Discriminator for type-safe handling
  parentId: string | null // Parent node reference
  visible: boolean
  camera?: Camera         // Optional saved camera position
  metadata?: JSON         // Arbitrary metadata (e.g., { isTransient: true })
}
```

**Node Hierarchy:**

```
Site
└── Building
    └── Level
        ├── Wall → Item (doors, windows)
        ├── Slab
        ├── Ceiling → Item (lights)
        ├── Roof
        ├── Zone
        ├── Device          ← VilHil addition (smart home devices)
        ├── Scan (3D reference)
        └── Guide (2D reference)
```

Nodes are stored in a **flat dictionary** (`Record<id, Node>`), not a nested tree.

---

### Scene State

```typescript
useScene.getState() = {
  nodes: Record<id, AnyNode>,  // All nodes
  rootNodeIds: string[],       // Top-level nodes (sites)
  dirtyNodes: Set<string>,     // Nodes pending system updates

  createNode(node, parentId),
  updateNode(id, updates),
  deleteNode(id),
}
```

**Middleware:** Persist (IndexedDB, excludes transient nodes) + Temporal (Zundo, 50-step undo/redo).

---

### Scene Registry

Maps node IDs → Three.js objects for fast lookup without scene graph traversal:

```typescript
sceneRegistry = {
  nodes: Map<id, Object3D>,
  byType: { wall: Set<id>, item: Set<id>, device: Set<id>, ... }
}
```

Renderers register via `useRegistry(node.id, 'wall', ref)`.

---

### Node Renderers

```
SceneRenderer
└── NodeRenderer (dispatches by type)
    ├── BuildingRenderer
    ├── LevelRenderer
    ├── WallRenderer / SlabRenderer / ZoneRenderer / ItemRenderer
    └── DeviceRenderer          ← VilHil addition
        ├── DeviceGeometry      (category-based 3D model)
        ├── DeviceEffects       (runtime state overlays)
        ├── DeviceRenderMode    (editor vs proposal display)
        └── Animations/         (HVAC airflow, light cone, WiFi heatmap, curtain, …)
```

---

### Systems

**Core Systems (`@pascal-app/core`):**

| System | Responsibility |
|--------|---------------|
| `WallSystem` | Wall geometry with mitering + CSG cutouts |
| `SlabSystem` | Floor geometry from polygons |
| `CeilingSystem` | Ceiling geometry |
| `RoofSystem` | Roof geometry |
| `ItemSystem` | Positions items on walls/ceilings/floors |

**Viewer Systems (`@pascal-app/viewer`):**

| System | Responsibility |
|--------|---------------|
| `LevelSystem` | Level visibility + vertical positioning (stacked/exploded/solo) |
| `ScanSystem` | 3D scan visibility |
| `GuideSystem` | Guide image visibility |

---

### Event Bus

```typescript
emitter.on('wall:click', (event) => { ... })
emitter.on('device:click', (event) => { ... })
emitter.on('grid:click', (event) => { ... })

// NodeEvent payload
{ node, position, localPosition, normal?, stopPropagation }
```

---

### Spatial Grid Manager

```typescript
spatialGridManager.canPlaceOnFloor(levelId, position, dimensions, rotation)
spatialGridManager.canPlaceOnWall(wallId, t, height, dimensions)
spatialGridManager.getSlabElevationAt(levelId, x, z)
```

---

## Data Flow

```
User Action (click, drag, scene trigger)
       ↓
Tool Handler  /  Scene Command
       ↓
useScene.createNode() / updateNode()
       ↓
Node added/updated — marked dirty
       ↓
React re-renders NodeRenderer → useRegistry() registers 3D object
       ↓
System detects dirty node (useFrame) → updates geometry → clears dirty flag
```

**VilHil extension:**
```
UI (proposal panel)
  → smarthome tool function (packages/smarthome/src/tools/)
    → useScene.updateNode()
      → DeviceRenderer reads new state → animation updates
```

---

## Technology Stack

- **React 19** + **Next.js 16** (Turbopack dev)
- **Three.js** (WebGPU renderer) + **React Three Fiber** + **Drei**
- **Zustand** + **Zundo** (state + undo/redo)
- **Zod** (schema validation)
- **Better Auth** (email/password, session management)
- **Drizzle ORM** + **PostgreSQL** via Supabase (cloud project persistence)
- **three-bvh-csg** (Boolean geometry operations)
- **Turborepo** + **Bun** (monorepo)

---

## Getting Started

See **[SETUP.md](./SETUP.md)** for full setup instructions including environment variables.

```bash
# Install dependencies
bun install

# Start development server
bun dev
# → http://localhost:3000
```

`bun dev` runs Turbopack (Next.js) only. Packages are compiled from source via `transpilePackages` — no separate tsc watch processes needed.

---

## Key Files

| Path | Description |
|------|-------------|
| `packages/core/src/schema/` | Node type definitions (Zod) |
| `packages/core/src/store/use-scene.ts` | Scene state store |
| `packages/core/src/systems/` | Geometry generation systems |
| `packages/viewer/src/components/renderers/` | Node renderers |
| `packages/viewer/src/components/viewer/` | Main Viewer component + post-processing |
| `packages/smarthome/src/device-catalog.ts` | Smart device product catalog |
| `packages/smarthome/src/tools/` | Scene manipulation tool functions |
| `packages/viewer/src/components/renderers/device/` | Device renderer + animations |
| `apps/editor/app/` | Next.js pages (editor, proposal-demo, auth, API routes) |
| `apps/editor/app/api/` | Server-side API (project save/load, auth) |

---

## Contributors

<a href="https://github.com/Aymericr"><img src="https://avatars.githubusercontent.com/u/4444492?v=4" width="60" height="60" alt="Aymeric Rabot" style="border-radius:50%"></a>
<a href="https://github.com/wass08"><img src="https://avatars.githubusercontent.com/u/6551176?v=4" width="60" height="60" alt="Wassim Samad" style="border-radius:50%"></a>
<a href="https://github.com/atom-xu"><img src="https://avatars.githubusercontent.com/u/atom-xu?v=4" width="60" height="60" alt="atom-xu" style="border-radius:50%" onerror="this.style.display='none'"></a>
