import { createInterface } from "node:readline"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { downloadDocument, extractPages, searchDocument, renderPage, documentManifest } from "./documents.mjs"
import { submitProposal } from "./proposal.mjs"

const specSchema = JSON.parse(await readFile(new URL("./component-spec.schema.json", import.meta.url), "utf8"))
async function checkSpec(spec) {
  const response = await fetch(process.env.PRISM_AGENT_BACKEND + "/api/catalog/agent-internal/check-spec", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.COMPONENT_AGENT_TOKEN }, body: JSON.stringify({ spec, documents: await documentManifest() }), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error("Prism spec checker unavailable")
  return response.json()
}

const definitions = [
  ["document_fetch", "Fetch a public HTTPS source and record immutable SHA256 and PDF page count. Returns document_id; inspect specific pages next.", { url: { type: "string" } }, ["url"]],
  ["document_search", "Search fetched document text; returns 1 based PDF page indices and excerpts.", { document_id: { type: "string" }, query: { type: "string" } }, ["document_id", "query"]],
  ["document_pages", "Read at most eight pages from a fetched source. Cite these PDF page indices, including covers, rather than printed numbering.", { document_id: { type: "string" }, pages: { type: "array", items: { type: "integer" } } }, ["document_id", "pages"]],
  ["document_render", "Render one fetched PDF page for visual inspection of tables or drawings.", { document_id: { type: "string" }, page: { type: "integer" } }, ["document_id", "page"]],
  ["check_spec", "Check renderability and generate review candidates. Inferred footprint geometry is allowed with estimated evidence and a method. Repair structural findings; review warnings do not block drafts.", { spec: specSchema }, ["spec"]],
  ["submit_spec", "Validate and save a best-attempt draft. Geometry estimates and review warnings are accepted. Structural errors return saved=false: repair and resubmit. Never approves or changes catalog data.", { decision: { enum: ["propose", "needs_input"] }, spec: { anyOf: [specSchema, { type: "null" }] }, question: { type: "string" } }, ["decision", "spec"]],
]
const handlers = { document_fetch: downloadDocument, document_search: searchDocument, document_pages: extractPages, document_render: renderPage,
  check_spec: async ({ spec }) => {
    const result = await checkSpec(spec)
    return { findings: result.findings, warnings: result.warnings || [], generated: Object.keys(result.files || {}), review_required: true }
  },
  submit_spec: async (proposal) => {
    return submitProposal(proposal, { check: checkSpec, save: value => writeFile(resolve(process.env.PRISM_AGENT_TASK_ROOT, "proposal.json"), JSON.stringify(value)) })
  },
}
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n")
let pending = Promise.resolve()
createInterface({ input: process.stdin }).on("line", line => {
  pending = pending.then(async () => {
    let message
    try { message = JSON.parse(line) } catch { return }
    const { id, method, params } = message
    if (id === undefined) return
    if (method === "initialize") return send({ jsonrpc: "2.0", id, result: { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "prism-component", version: "1.0.0" } } })
    if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} })
    if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: definitions.map(([name, description, properties, required]) => ({ name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } })) } })
    if (method !== "tools/call") return send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown method" } })
    try {
      if (!handlers[params.name]) throw new Error("Unknown tool")
      const result = await handlers[params.name](params.arguments || {})
      send({ jsonrpc: "2.0", id, result: { ...(result.isError ? { isError: true } : {}), content: [result.type === "image" ? result : { type: "text", text: JSON.stringify(result) }] } })
    } catch (error) {
      send({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: error.message }] } })
    }
  }).catch(() => {})
})
