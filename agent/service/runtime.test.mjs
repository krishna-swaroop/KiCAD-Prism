import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { OpenCodeRuntime, taskConfig, modelRef } from "./runtime.mjs"
import { ipv4IsPublic } from "./documents.mjs"

test("task tools do not grant shell, filesystem, browser, or subagent access", () => {
  const config = taskConfig("/agent-workspaces/test")
  assert.deepEqual(config.permissions[0], { action: "*", resource: "*", effect: "deny" })
  const allowed = config.permissions.filter(p => p.effect === "allow").map(p => p.action)
  for (const action of ["shell", "read", "edit", "browser", "subagent", "webfetch", "external_directory"]) assert.ok(!allowed.includes(action))
  assert.equal(config.mcp.servers.prism.environment.PRISM_AGENT_DOCUMENT_ROOT, "/agent-workspaces/test/documents")
  assert.equal(modelRef(false).variant, "no-thinking")
  assert.equal(modelRef(true).variant, "thinking")
})

test("long wait bypasses fetch header timeout and remains cancellable", async () => {
  const server = http.createServer((_req, res) => {
    const timer = setTimeout(() => { res.writeHead(204); res.end() }, 100)
    res.on("close", () => clearTimeout(timer))
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error("Blocking wait must not use fetch") }
  try {
    const runtime = new OpenCodeRuntime(`http://127.0.0.1:${server.address().port}`)
    await runtime.wait("session", AbortSignal.timeout(2000))
    await assert.rejects(runtime.wait("session", AbortSignal.timeout(20)), error => error.name === "AbortError")
  } finally { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test("document fetch refuses private, local, Tailscale and metadata addresses", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "100.90.11.9", "169.254.169.254", "192.168.1.2", "172.16.0.1", "0.0.0.0"]) assert.equal(ipv4IsPublic(address), false)
  assert.equal(ipv4IsPublic("8.8.8.8"), true)
})

test("adapter uses V2 session creation, prompt, messages, wait and interrupt", async () => {
  const calls = []
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk
    calls.push({ path: req.url, method: req.method, authorization: req.headers.authorization, body: body ? JSON.parse(body) : undefined })
    if (req.url.includes("/wait")) { res.writeHead(204); return res.end() }
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ data: req.url === "/api/session" ? { id: "ses_test" } : [] }))
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    const runtime = new OpenCodeRuntime(`http://127.0.0.1:${server.address().port}`)
    runtime.password = "temporary-test-password"
    const task = { identity: { manufacturer: "Test", mpn: "TEST-4" }, source_urls: [], thinking: false }
    assert.equal(await runtime.create(task, "/isolated"), "ses_test")
    await runtime.prompt("ses_test", task); await runtime.messages("ses_test"); await runtime.wait("ses_test"); await runtime.cancel("ses_test")
    assert.equal(calls[0].body.location.directory, "/isolated")
    assert.equal(calls[0].authorization, "Basic " + Buffer.from("opencode:temporary-test-password").toString("base64"))
    assert.equal(calls[1].path, "/api/session/ses_test/prompt")
    assert.equal(calls[3].path, "/api/experimental/session/ses_test/wait")
    assert.equal(calls[4].path, "/api/session/ses_test/interrupt?resume=false")
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
