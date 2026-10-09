import http from "node:http"
import { timingSafeEqual } from "node:crypto"
import { mkdir, readFile, writeFile, readdir, rename, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { spawn } from "node:child_process"
import { OpenCodeRuntime, prepareWorkspace } from "./runtime.mjs"

const root = resolve(process.env.PRISM_AGENT_WORKSPACE_ROOT || "/tmp/prism-component-agent")
const token = process.env.COMPONENT_AGENT_TOKEN
if (!token || token.length < 32) throw new Error("COMPONENT_AGENT_TOKEN must contain at least 32 characters")
const runtime = new OpenCodeRuntime()
const tasks = new Map()
const active = new Map()
const directory = id => resolve(root, id)
async function save(task) {
  const target = resolve(directory(task.id), "task.json")
  // All writes for one task are serialized to avoid cancellation/progress races.
  const previous = task.write || Promise.resolve()
  const snapshot = JSON.stringify({ ...task, write: undefined })
  task.write = previous.then(async () => { await writeFile(target + ".tmp", snapshot); await rename(target + ".tmp", target) })
  await task.write
}
function publicTask(task) { const { write, ...record } = task; return record }
async function documentManifest(dir) {
  const docs = resolve(dir, "documents")
  try { return await Promise.all((await readdir(docs)).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).map(n => readFile(resolve(docs, n), "utf8").then(JSON.parse))) } catch (error) { if (error.code === "ENOENT") return []; throw error }
}
async function run(task) {
  const controller = new AbortController()
  active.set(task.id, controller)
  task.status = "running"
  let poll
  const captureTrace = async () => {
    if (!task.session_id) return
    const messages = await runtime.messages(task.session_id)
    task.trace = messages.map(m => ({ id: m.id, model: m.model, finish: m.finish, error: m.error ? { name: m.error.name || "runtime_error" } : undefined, content: (m.content || []).map(p => p.type === "tool" ? { type: "tool", name: p.name, state: p.state?.type || p.state?.status } : { type: p.type, text: (p.text || "").slice(0, 16000) }) }))
  }
  try {
    await save(task)
    await prepareWorkspace(directory(task.id))
    task.session_id = await runtime.create(task, directory(task.id))
    task.model = process.env.PRISM_AGENT_MODEL_ID || "prism-gemma4-26b-bf16"
    if (controller.signal.aborted) throw new Error("cancelled")
    await save(task)
    await runtime.prompt(task.session_id, task)
    let polling = false
    poll = setInterval(async () => {
      if (polling || controller.signal.aborted) return
      polling = true
      try {
        const messages = await runtime.messages(task.session_id)
        const tool = messages.flatMap(m => m.content || []).find(p => p.type === "tool")
        task.message = tool ? "Using " + tool.name : "Researching " + task.identity.mpn
        await captureTrace()
      } catch { /* Final runtime call reports failures. */ } finally { polling = false }
    }, 2000)
    const seconds = Number(process.env.PRISM_AGENT_TIMEOUT_SECONDS ?? 1800)
    const waitSignal = seconds > 0 ? AbortSignal.any([controller.signal, AbortSignal.timeout(seconds * 1000)]) : controller.signal
    await runtime.wait(task.session_id, waitSignal)
    if (controller.signal.aborted) throw new Error("cancelled")
    await captureTrace()
    task.proposal = await runtime.finish(task.session_id, directory(task.id))
    task.documents = await documentManifest(directory(task.id))
    task.status = "completed"
    task.message = "Research finished; Prism validation and engineering review required"
  } catch (error) {
    if (task.session_id) await runtime.cancel(task.session_id).catch(() => {})
    await captureTrace().catch(() => {})
    task.documents = await documentManifest(directory(task.id)).catch(() => [])
    task.status = controller.signal.aborted ? "cancelled" : "failed"
    task.error_code = controller.signal.aborted ? "cancelled" : error.name === "TimeoutError" || error.cause?.name === "TimeoutError" ? "research_timeout" : error.cause?.code === "UND_ERR_HEADERS_TIMEOUT" ? "runtime_http_timeout" : error.code === "ENOENT" ? "missing_structured_proposal" : /^opencode_/.test(error.message) ? error.message : "runtime_failed"
    task.message = "Research " + task.status
    console.error("Component task", task.id, task.error_code)
  } finally {
    clearInterval(poll)
    active.delete(task.id)
    task.finished_at = new Date().toISOString()
    await save(task)
    pump()
  }
}
function pump() {
  const concurrency = Math.max(1, Math.min(4, Number(process.env.PRISM_AGENT_CONCURRENCY || 1)))
  for (const task of tasks.values()) {
    if (active.size >= concurrency) break
    if (task.status === "queued") void run(task)
  }
}
function authorized(request) {
  const value = Buffer.from(request.headers.authorization || "")
  const expected = Buffer.from("Bearer " + token)
  return value.length === expected.length && timingSafeEqual(value, expected)
}
async function body(request) {
  let text = ""
  for await (const chunk of request) { text += chunk; if (text.length > 20000) throw new Error("body_limit") }
  return JSON.parse(text || "{}")
}
function send(response, status, value) { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)) }
await mkdir(root, { recursive: true })
for (const id of await readdir(root)) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue
  try {
    const task = JSON.parse(await readFile(resolve(directory(id), "task.json"), "utf8"))
    if (task.status === "running") { task.status = "failed"; task.error_code = "service_restarted"; task.message = "Research interrupted by service restart"; task.finished_at = new Date().toISOString(); await save(task) }
    tasks.set(id, task)
  } catch { /* An incomplete workspace has no admitted task. */ }
}
// Expired task files and source PDFs belong only to this isolated agent volume.
const retention = Number(process.env.PRISM_AGENT_RETENTION_DAYS || 7) * 86400000
const clean = async () => {
  for (const [id, task] of tasks) if (task.finished_at && Date.parse(task.finished_at) < Date.now() - retention && !active.has(id)) {
    if (task.session_id) await runtime.call("DELETE", `/api/session/${task.session_id}`).catch(() => {})
    await rm(directory(id), { recursive: true, force: true }); tasks.delete(id)
  }
}
setInterval(() => clean().catch(() => {}), 3600000).unref()

let opencode
if (process.env.PRISM_AGENT_START_OPENCODE !== "false") {
  await new Promise((ready, reject) => {
    const timeout = setTimeout(() => reject(new Error("OpenCode startup timed out")), 30000)
    opencode = spawn(process.env.PRISM_AGENT_OPENCODE_BIN || "opencode", ["serve", "--hostname", "127.0.0.1", "--port", "4096"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    let pending = ""
    const consume = chunk => {
      pending += chunk.toString()
      const lines = pending.split("\n"); pending = lines.pop()
      for (const line of lines) {
        const password = line.match(/^server password (\S+)$/)
        if (password) { runtime.password = password[1]; clearTimeout(timeout); ready() }
        else console.log(line)
      }
    }
    opencode.stdout.on("data", consume)
    opencode.stderr.on("data", consume)
    opencode.on("exit", () => { clearTimeout(timeout); reject(new Error("OpenCode exited")); process.exit(1) })
    opencode.on("error", error => { clearTimeout(timeout); reject(error) })
  })
}
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://agent")
  if (url.pathname === "/health" && request.method === "GET") {
    try { await runtime.call("GET", "/api/info"); return send(response, 200, { ready: true }) } catch { return send(response, 503, { ready: false }) }
  }
  if (!authorized(request)) return send(response, 401, { error: "unauthorized" })
  try {
    if (request.method === "POST" && url.pathname === "/tasks") {
      const input = await body(request)
      if (!/^[a-f0-9-]{36}$/.test(input.id) || !input.identity?.mpn?.trim() || !input.identity?.manufacturer?.trim() || !Array.isArray(input.source_urls) || input.source_urls.length > 12) return send(response, 400, { error: "invalid_task" })
      const existing = tasks.get(input.id)
      if (existing) {
        if (JSON.stringify(existing.identity) !== JSON.stringify(input.identity)) return send(response, 409, { error: "task_identity_conflict" })
        return send(response, 200, publicTask(existing))
      }
      if ([...tasks.values()].filter(t => ["running", "queued"].includes(t.status)).length >= 20) return send(response, 503, { error: "agent_busy" })
      await mkdir(directory(input.id), { recursive: true })
      const task = { id: input.id, identity: input.identity, source_urls: input.source_urls, thinking: input.thinking === true,
        instructions: String(input.instructions || "").slice(0, 4000), status: "queued", message: "Starting research", created_at: new Date().toISOString() }
      tasks.set(task.id, task)
      await save(task)
      pump()
      return send(response, 202, publicTask(task))
    }
    const match = url.pathname.match(/^\/tasks\/([a-f0-9-]{36})(\/cancel)?$/)
    const task = match && tasks.get(match[1])
    if (!task) return send(response, 404, { error: "task_not_found" })
    if (request.method === "GET" && !match[2]) return send(response, 200, publicTask(task))
    if (request.method === "POST" && match[2]) {
      if (task.status === "queued") { task.status = "cancelled"; task.message = "Research cancelled"; task.finished_at = new Date().toISOString(); await save(task) }
      active.get(task.id)?.abort()
      if (task.session_id) await runtime.cancel(task.session_id).catch(() => {})
      return send(response, 202, { status: "cancel_requested" })
    }
    send(response, 405, { error: "method_not_allowed" })
  } catch { send(response, 500, { error: "agent_service_error" }) }
})
server.listen(Number(process.env.PRISM_AGENT_PORT || 4097), "0.0.0.0", pump)
const stop = () => { for (const controller of active.values()) controller.abort(); opencode?.kill("SIGTERM"); server.close(() => process.exit(0)) }
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
