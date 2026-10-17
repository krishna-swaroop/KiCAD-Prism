// Entry point of the Prism design-bundle contracts: one import per contract
// file, in alphabetical order. build.mjs fails when a file in this directory
// is not reachable from here.
import "@typespec/json-schema";
import "./common.tsp";
import "./artwork-a0.tsp";
import "./assembly-hlr-a0.tsp";
import "./board-objects-a0.tsp";
import "./bundle-manifest-a3.tsp";
import "./cli-a0.tsp";
import "./compare-a0.tsp";
import "./compare-font-a0.tsp";
import "./design-compare-a1.tsp";
import "./drawing-sheet-a0.tsp";
import "./kicad-project-diff-v1.tsp";
import "./occurrences-a0.tsp";
import "./placements-a0.tsp";
import "./project-a0.tsp";
import "./revision-key-a1.tsp";
import "./route-metrics-a0.tsp";
import "./semantic-index-a2.tsp";
import "./stackup-a0.tsp";
import "./stroke-text-a0.tsp";
import "./system-interface-v1.tsp";
import "./vendor-jlcpcb-a0.tsp";
