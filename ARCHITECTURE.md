# System Architecture & Design Specification

> ⚠️ **Status: Work in Progress**  
> This project is currently under development and has not been formally published.  
> Project Reference: INCOSE TPP-182-2026

## Authorship and Contributors
* **Alexander Efremov** ([alexander@efremov-systems.com](mailto:alexander@efremov-systems.com)) — Lead Systems Architect & Developer
* **Sascha Ackva** ([Sascha.Ackva@gfse.org](mailto:Sascha.Ackva@gfse.org)) — Original Digital Model Author & Project Co-Author

## 1. Dual Lifecycle Architecture (Separation of Concerns)

The repository integrates two distinct yet complementary deliverables derived from a common systems engineering baseline:

```text
               +-------------------------------------------+
               |        Archi Model (.archimate)           |
               |      Single Source of Truth (SSOT)        |
               +-------------------------------------------+
                                     |
                  +------------------+------------------+
                  |                                     |
           [HTML Report Export]               [Open Exchange XML]
                  |                                     |
                  v                                     v
       +--------------------+               +-----------------------+
       |   viewer-export/   |               |       analyzer/       |
       |  Archi HTML Viewer |               | Vue 3 Process Analyzer|
       | (Static Diagrams)  |               | (Dynamic Graph Engine)|
       +--------------------+               +-----------------------+
```

### 1.1. Archi HTML Viewer (`viewer-export/`)
* **Purpose:** Serves as a standard browsable HTML publication exported directly from Archi (Jasper/HTML Report generator).
* **Usage Scenario:** Enables systems architects and stakeholders to inspect static viewpoints, visual diagram layouts, and structured property tables as formally modeled in the Archi desktop tool.
* **Update Cadence:** Generated periodically upon major model revisions or milestones by running the Archi command-line interface (CLI) or manual report export.

### 1.2. Interactive Process Analyzer (`analyzer/`)
* **Purpose:** A high-performance, single-page application (Vue 3 + Vite) delivering algorithmic graph analysis and dynamic query visualization.
* **Usage Scenario:** Used by systems engineers, process owners, and auditors to query data flows, calculate shortest exchange paths, verify input/output consistency, trace artifact impact, and simulate N² interaction matrices on the fly.
* **Data Ingestion:** Operates on the standardized **The Open Group ArchiMate Open Exchange XML** format (`ISO 15288 Converted Model.xml`), which is automatically fetched at startup from the static assets directory, or provided by the user via the custom upload UI.

By isolating the analytical web application (`analyzer`) from the static documentation viewer (`viewer-export`), the project ensures that analytical algorithms can evolve independently from the authoring lifecycle of the underlying Archi model.


---

## 2. Analyzer Internal Architecture

The analyzer follows a unidirectional data flow and modular design structured across four foundational layers:

```text
  [ ArchiMate XML ] 
         │
         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  core/xmlParser.js                                       │
  │  - DOM Parsing & Graphology Graph Construction           │
  │  - Meta-Level Inheritance (Controls, Enables, Situational) │
  │  - Blueprint Collapsing & Graph Pruning                  │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │  store/graphStore.js (Vue 3 Reactive Store)              │
  │  - Holds gFull, gDirect, processes, businessObjects      │
  │  - Reactive Settings (Inheritance flags, Hierarchy)       │
  │  - Active Engine & renderPayload State                   │
  └──────────────────────────┬───────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
  ┌──────────────────────────┐   ┌──────────────────────────┐
  │  cases/caseRegistry.js   │   │  renderers/              │
  │  - Case 1 to 7 Modules   │   │  mermaidGenerator.js     │
  │  - Graph Traversal Logic │   │  - Mermaid Syntax Engine │
  │  - DFS / BFS / Dijkstra  │   │  - Subgraph Clustering   │
  │  - Output: renderPayload │   │  - Border Relations      │
  └─────────────┬────────────┘   └─────────────┬────────────┘
                │                              │
                └──────────────┬───────────────┘
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │  components/GraphCanvas.vue                              │
  │  - Dynamic Renderer Mount: Mermaid / Vis.js / 3D Force   │
  │  - Interactive Pan-Zoom & Node Inspection Panel          │
  └──────────────────────────────────────────────────────────┘
```

### 2.1. Ingestion & Graph Building (`xmlParser.js`)
* **XML Schema Processing:** Uses browser `DOMParser` to parse ArchiMate Open Exchange XML schema elements (`<element>`, `<relationship>`, `<propertyDefinition>`, `<profile>`).
* **Graphology In-Memory Representation:** Generates two distinct directed graphs:
  - `gFull`: Comprehensive directed graph retaining both data flows and structural hierarchy (`Composition`, `Aggregation`, `Specialization`, with inverted parent-child traversal support).
  - `gDirect`: Flat directed graph containing only functional and data exchange relationships.
* **Meta-Level Inheritance & Blueprint Collapse:** Handles systemic relationships assigned to the parent `Process Blueprint` element. When inheritance flags (`includeEnables`, `includeControls`, `includeSituational`) are enabled, edges connecting the blueprint are projected downward to all constituent child processes. Subsequently, the transient `Process Blueprint` node and disconnected artifacts are pruned.

### 2.2. State Management & Lifecycle (`graphStore.js`)
* **Centralized Store (`reactive`):** Maintains global application state including:
  - `rawXml`: In-memory raw XML cache enabling instantaneous re-parsing upon setting toggles without reloading files.
  - `settings`: Global toggles (`useHierarchy`, `connectBorderObjects`, meta-level inheritance).
  - `renderPayload`: Normalized visualization payload containing `nodes`, `edges`, `renderSubgraphs`, and `customLabels`.
* **Automatic Bootstrap:** On initial application load, `loadDefaultModel()` issues an asynchronous `fetch` to load `ISO 15288 Converted Model.xml` from `public/` (respecting Vite's configured `base` path).
* **Custom Model Injection:** Exposes `applyModelXml()` to dynamically parse user-uploaded models from `Sidebar.vue` or `GraphCanvas.vue`.

### 2.3. Case Registry & Algorithmic Engines (`cases/`)
* **Decoupled Architecture:** Each analysis scenario (`case1.js` through `case7.js`) encapsulates:
  - `inputs`: Declarative UI schema (multiselect, select, radio, checkbox) consumed by `Sidebar.vue` for dynamic form generation.
  - `execute(ctx, params)`: Pure execution function receiving the active graph context (`gActive`, `gFull`, `settings`) and form parameters.
* **Graph Algorithms:**
  - *Case 1 & Case 4:* Custom Depth-First Search (DFS) with depth bounding and intermediary process suppression.
  - *Case 2:* Bidirectional unweighted shortest path calculation (`graphology-shortest-path`).
  - *Case 3 & Case 6:* Undirected Breadth-First Search (BFS) for closest structural adjacency.
  - *Case 5:* Radial BFS with subgraph hierarchy clustering of nested `BusinessProcess` elements inside `BusinessFunction`.
  - *Case 7:* Dynamic dependency graph reconstruction simulating an N² interaction matrix with artifact specialization clustering.

### 2.4. Multi-Engine Visualization (`mermaidGenerator.js` & `GraphCanvas.vue`)
* **Mermaid Engine:** Converts the active graph payload into Mermaid `flowchart LR` syntax with CSS class defs (`:::process`, `:::object`), click event hooks (`handleNodeClick()`), and nested `subgraph` syntax. Interactive panning and zooming are enabled via `svg-pan-zoom`.
* **Vis.js 2D Physics:** Renders dynamic spring-embedder force layouts using Vis Network physics solvers (`forceAtlas2Based`).

---

## 3. Deployment Plans & CI/CD Strategy

Both tools will be published to GitHub Pages via automated GitHub Actions workflows triggered on pushes to the `main` or `master` branch.

### 3.1. Publication Topology
The static site on `gh-pages` will host both deliverables unified under the project's repository domain (`https://<organization>.github.io/process-model-v5/`):
* **`/` (Root):** Hosts the static Archi HTML Report exported to `viewer-export/` (or a landing portal redirecting between the Viewer and Analyzer).
* **`/analyzer/`:** Hosts the compiled production bundle of the Vue 3 Process Analyzer (`analyzer/dist/`).

Vite's `base` configuration in `analyzer/vite.config.js` is set to `/process-model-v5/analyzer/` to ensure all JS/CSS asset hashes, favicons, and the static XML model load seamlessly without 404 routing errors on GitHub Pages.

### 3.2. Recommended GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Build & Deploy INCOSE Process Model & Analyzer

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: analyzer/package-lock.json

      - name: Install Analyzer Dependencies
        working-directory: analyzer
        run: npm ci

      - name: Build Analyzer SPA
        working-directory: analyzer
        run: npm run build

      - name: Assemble GitHub Pages Deployment Artifacts
        run: |
          mkdir -p site/analyzer
          
          # Copy Archi HTML export if present, otherwise prepare viewer-export placeholder
          if [ -d "viewer-export" ] && [ "$(ls -A viewer-export)" ]; then
            cp -r viewer-export/* site/
          fi
          
          # Copy compiled Vue Analyzer to /analyzer subfolder
          cp -r analyzer/dist/* site/analyzer/
          
          # Create a root redirection if no custom index.html exists in root
          if [ ! -f "site/index.html" ]; then
            echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=analyzer/"></head><body>Redirecting to <a href="analyzer/">Analyzer</a>...</body></html>' > site/index.html
          fi

      - name: Deploy to GitHub Pages (gh-pages branch)
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./site
          publish_branch: gh-pages
```

This automated pipeline guarantees that any commit to the model or analyzer automatically triggers validation, compilation, and synchronized deployment to GitHub Pages.

* **3D Force Graph:** Utilizes WebGL-powered 3D force simulation (`3d-force-graph`) for large topological process exploration.
