# INCOSE Handbook Process Model & Analyzer

> ⚠️ **Status: Work in Progress**  
> This project is currently under development and has not been formally published.  
> Project Reference: INCOSE TPP-182-2026

## Contacts and Authorship
* **Alexander Efremov** ([alexander@efremov-systems.com](mailto:alexander@efremov-systems.com)) — Lead Systems Architect & Developer
* **Sascha Ackva** ([Sascha.Ackva@gfse.org](mailto:Sascha.Ackva@gfse.org)) — Original Digital Model Author & Project Co-Author

---

## Project Overview
This repository provides an integrated ecosystem for systems engineering process modeling and analysis based on the **ISO/IEC/IEEE 15288:2023** standard and the **INCOSE Systems Engineering Handbook (v5)**.

The solution brings together:
1. A machine-readable **ArchiMate 3.x** process architecture model.
2. An **Archi HTML Web Report** for browsing visual process diagrams and element catalogs.
3. An interactive **Vue 3 Process Analyzer** (Vite + Graphology) featuring multi-engine graph rendering (Mermaid.js, Vis.js 2D physics, and 3D Force-Directed Graph).

---

## Repository Structure

```text
.
├── model/                  # ArchiMate source models (.archimate) and Open Exchange XML
│   ├── (Working Model) ISO 15288 Converted Model.xml
│   └── ISO 15288 Converted Model.xml
│
├── viewer-export/          # Export directory for static Archi HTML Web Report
│
├── analyzer/               # Interactive Vue 3 + Vite graph analysis web application
│   ├── public/             # Static assets and default bundled model
│   │   ├── ISO 15288 Converted Model.xml
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/         # Visual styles and static resources
│   │   ├── cases/          # Graph analysis scenarios (case1.js – case7.js, caseRegistry.js)
│   │   ├── components/     # Vue SFCs (GraphCanvas, Sidebar, SearchableSelect)
│   │   ├── core/           # ArchiMate Open Exchange XML parser (xmlParser.js)
│   │   ├── renderers/      # Diagram syntax generation & graph adapters (mermaidGenerator.js)
│   │   ├── store/          # Reactive graph store and model loader (graphStore.js)
│   │   ├── App.vue         # Root UI layout component
│   │   └── main.js         # Vue application entry point
│   ├── index.html          # HTML entry point
│   ├── package.json        # Dependencies and build scripts
│   └── vite.config.js      # Vite configuration (base: '/process-model-v5/analyzer/')
│
├── ARCHITECTURE.md         # Architecture, data flows, and CI/CD specification
└── README.md               # Repository documentation and guide
```


---

## Process Analysis Scenarios (7 Scenarios)

The Analyzer provides 7 specialized traversal algorithms across the ISO 15288 lifecycle directed graph:

1. **Case 1: Interface exchange between selected processes**  
   *Discovers data exchange interfaces across 2 to 5 selected processes.*  
   Performs depth-bounded path search (DFS) with configurable depth cutoff (`cutoff = 4` when hierarchy is included, otherwise `2`). Identifies intermediate data objects and documents through which the processes communicate, filtering out unrelated intermediary processes.

2. **Case 2: Shortest DATA FLOW path (Directed)**  
   *Finds the shortest strictly directed data flow sequence.*  
   Calculates the shortest valid directed sequence from Process A to Process B taking input and output flow directions into account. Employs a bidirectional shortest path algorithm on the active directed graph (`gActive`).

3. **Case 3: Closest STRUCTURAL connection (Undirected)**  
   *Finds the nearest structural relationship (undirected).*  
   Identifies the closest structural relationship between two processes regardless of edge directionality (e.g., shared reference to a governing standard or common management input). Implemented via undirected breadth-first search (BFS).

4. **Case 4: All possible DATA FLOW paths (Directed)**  
   *Explores all alternate directed data flow trajectories.*  
   Enumerates all alternative directed data sequences from Process A to Process B within a maximum limit of 6 steps. Useful for analyzing process redundancy, decoupling, and secondary data paths.

5. **Case 5: Process Neighborhood & Internal Steps (Subgraphs)**  
   *Visualizes process neighborhood and internal step decomposition (nested subgraphs).*  
   Extracts a local neighborhood around a selected Business Function up to 1 or 2 steps away. Automatically retrieves internal decomposed steps (Business Processes) linked via composition relationships and renders them inside a nested cluster/subgraph.

6. **Case 6: Shortest connection between Business Objects**  
   *Traces the shortest connection between two business artifacts.*  
   Discovers how two artifacts or work products are connected through producing and consuming processes. Vital for engineering change and impact analysis.

7. **Case 7: N2 Chart Simulation (Process Inputs & Outputs)**  
   *Interactive N² matrix simulation.*  
   Provides an interactive simulation of an engineering N² chart for a selected central process: dynamically loads input/output artifacts, accounts for artifact clusters (composition and specialization), highlights upstream suppliers and downstream consumers, and flags shared outputs (`[Shared Output]`).

---

## Local Setup & Development Guide

Running the Process Analyzer locally requires **Node.js** version 18 or higher.

```bash
# 1. Navigate to the analyzer workspace
cd analyzer

# 2. Install project dependencies
npm install

# 3. Start the Vite local development server
npm run dev
```

Vite will start the local server (typically at `http://localhost:5173/process-model-v5/analyzer/`). Open the displayed URL in your browser.

### Production Build:
```bash
cd analyzer
npm run build
```
The compiled single-page application (SPA) will be output to `analyzer/dist/`.


