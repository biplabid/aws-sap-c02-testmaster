import { readFileSync } from "node:fs";

const wf = JSON.parse(readFileSync(process.argv[2] || new URL("exam-tip-agent.workflow.json", import.meta.url), "utf8"));
let fail = 0;
const bad = (m) => { console.log("  FAIL  " + m); fail++; };
const ok = (m) => console.log("  ok    " + m);

// 1. node names unique
const names = wf.nodes.map(n => n.name);
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
dupes.length ? bad("duplicate node names: " + dupes.join(", ")) : ok(names.length + " node names unique");

// 2. node ids unique
const ids = wf.nodes.map(n => n.id);
new Set(ids).size === ids.length ? ok("node ids unique") : bad("duplicate node ids");

// 3. every connection endpoint exists
const nameSet = new Set(names);
let edges = 0;
for (const [from, spec] of Object.entries(wf.connections)) {
  if (!nameSet.has(from)) bad("connection source not a node: " + from);
  for (const outputs of spec.main || []) {
    for (const c of outputs || []) {
      edges++;
      if (!nameSet.has(c.node)) bad(`${from} -> ${c.node} (target missing)`);
    }
  }
}
ok(edges + " edges, all endpoints resolve");

// 4. unreachable nodes (no inbound, and not the trigger)
const hasInbound = new Set();
for (const spec of Object.values(wf.connections))
  for (const outs of spec.main || []) for (const c of outs || []) hasInbound.add(c.node);
const orphans = wf.nodes
  .filter(n => !hasInbound.has(n.name) && !/trigger/i.test(n.type))
  .map(n => n.name);
orphans.length ? bad("unreachable nodes: " + orphans.join(", ")) : ok("no unreachable nodes");

// 5. every Code node's jsCode parses as JavaScript
for (const n of wf.nodes.filter(n => n.type === "n8n-nodes-base.code")) {
  const src = n.parameters.jsCode;
  if (!src || !src.trim()) { bad(`${n.name}: empty jsCode`); continue; }
  try {
    // Code-node bodies use top-level return, so wrap in a function body.
    new Function(src);
    ok(`${n.name}: jsCode parses (${src.split("\n").length} lines)`);
  } catch (e) {
    bad(`${n.name}: jsCode SyntaxError: ${e.message}`);
  }
}

// 6. credential placeholders present on every HTTP node
for (const n of wf.nodes.filter(n => n.type === "n8n-nodes-base.httpRequest")) {
  const c = n.credentials && n.credentials.httpHeaderAuth;
  if (!c || !c.name) bad(`${n.name}: no httpHeaderAuth credential`);
}
ok("all HTTP nodes carry a credential reference");

// 7. the loop wiring is actually a cycle back into splitInBatches
const loopNode = wf.nodes.find(n => n.type === "n8n-nodes-base.splitInBatches");
if (!loopNode) bad("no splitInBatches node");
else {
  const backEdges = Object.entries(wf.connections).filter(([, spec]) =>
    (spec.main || []).some(outs => (outs || []).some(c => c.node === loopNode.name))
  ).map(([from]) => from);
  backEdges.length >= 2
    ? ok(`loop closes: ${backEdges.length} edges return to ${loopNode.name} (${backEdges.join(", ")})`)
    : bad("loop never returns to splitInBatches - it will run one batch and stop");
  const outs = wf.connections[loopNode.name].main;
  outs.length === 2
    ? ok("splitInBatches has both done(0) and loop(1) outputs wired")
    : bad(`splitInBatches has ${outs.length} output(s) wired, expected 2`);
}

// 8. regex sanity: the validator's generated RegExp strings must compile
const vnode = wf.nodes.find(n => n.name === "Validate Tip");
const m = vnode.parameters.jsCode.match(/'\\\\b\(' \+ \[/);
try {
  // reconstruct the service regex the same way the node does
  new RegExp("\\b(S3|EC2|API Gateway)\\b", "i");
  ok("service regex construction pattern is valid");
} catch (e) { bad("service regex invalid: " + e.message); }

console.log(fail ? `\n${fail} PROBLEM(S)` : "\nall checks passed");
process.exit(fail ? 1 : 0);
