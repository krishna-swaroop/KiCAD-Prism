import { createHash } from "node:crypto"
import { lookup } from "node:dns/promises"
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import https from "node:https"

const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_TEXT_BYTES = 200 * 1024
const USER_AGENT = "PrismComponentResearch/0.1 (public datasheet retrieval)"
const SOURCE_DIR = resolve(process.env.PRISM_AGENT_DOCUMENT_ROOT || "documents")

export function ipv4IsPublic(address) {
  const parts = address.split(".").map(Number)
  const [a, b, c] = parts
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) ||
    (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113))
}

async function resolvePublicIpv4(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Local and private network hosts are not accepted.")
  }
  const addresses = await lookup(host, { all: true, family: 4, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !ipv4IsPublic(address))) {
    throw new Error("The host did not resolve exclusively to public IPv4 addresses.")
  }
  return addresses[0].address
}

function getHttps(url, pinnedAddress, signal) {
  return new Promise((resolveResponse, reject) => {
    const request = https.get(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,text/html,text/plain,text/csv,application/json,application/xml,text/xml,*/*;q=0.5" },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address: pinnedAddress, family: 4 }])
        else callback(null, pinnedAddress, 4)
      },
      signal,
    }, (response) => resolveResponse(response))
    request.setTimeout(30000, () => request.destroy(new Error("Request timed out.")))
    request.on("error", reject)
  })
}

async function fetchPublic(urlText) {
  let current = new URL(urlText)
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    if (current.protocol !== "https:" || current.username || current.password || current.port && current.port !== "443") {
      throw new Error("Only public HTTPS URLs on the default port are accepted.")
    }
    const pinnedAddress = await resolvePublicIpv4(current.hostname)
    const response = await getHttps(current, pinnedAddress, AbortSignal.timeout(35000))
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location
      response.destroy()
      if (!location || redirect === 5) throw new Error("Too many or invalid redirects.")
      current = new URL(location, current)
      continue
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.destroy()
      throw new Error("HTTP " + response.statusCode + " fetching " + current.origin)
    }
    return { response, finalUrl: current }
  }
  throw new Error("Too many redirects.")
}

async function readLimited(response, limit) {
  const advertised = Number(response.headers["content-length"] || "0")
  if (advertised > limit) {
    response.destroy()
    throw new Error("Document exceeds the configured download limit.")
  }
  const chunks = []
  let total = 0
  for await (const chunk of response) {
    total += chunk.length
    if (total > limit) {
      response.destroy()
      throw new Error("Document exceeds the configured download limit.")
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}


import { execFile } from "node:child_process"
import { promisify } from "node:util"
const runFile = promisify(execFile)

function docPath(id, extension) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid document ID")
  return resolve(SOURCE_DIR, id + extension)
}

export async function documentManifest() {
  await mkdir(SOURCE_DIR, { recursive: true })
  const names = (await readdir(SOURCE_DIR)).filter(n => /^[a-f0-9]{64}\.json$/.test(n))
  return Promise.all(names.map(n => readFile(resolve(SOURCE_DIR, n), "utf8").then(JSON.parse)))
}

export async function downloadDocument({ url }) {
  if (typeof url !== "string" || url.length > 2048) throw new Error("Invalid document URL")
  if ((await documentManifest()).length >= 12) throw new Error("Task document limit reached")
  const { response, finalUrl } = await fetchPublic(url)
  const type = String(response.headers["content-type"] || "").split(";")[0].toLowerCase()
  const isPdf = type === "application/pdf" || finalUrl.pathname.toLowerCase().endsWith(".pdf")
  const bytes = await readLimited(response, isPdf ? MAX_PDF_BYTES : MAX_TEXT_BYTES)
  const id = createHash("sha256").update(bytes).digest("hex")
  let pages = 1, text
  if (isPdf) {
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid PDF signature")
    await writeFile(docPath(id, ".pdf"), bytes)
    const info = await runFile("pdfinfo", [docPath(id, ".pdf")], { timeout: 30000, maxBuffer: 1024 * 1024 })
    pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1])
    if (!Number.isInteger(pages) || pages < 1 || pages > 1000) throw new Error("PDF page count exceeds task limits")
    const result = await runFile("pdftotext", ["-layout", docPath(id, ".pdf"), "-"], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 })
    text = result.stdout
  } else {
    if (!type.startsWith("text/") && !["application/json", "application/xml"].includes(type)) throw new Error("Unsupported source type")
    text = bytes.toString("utf8")
    await writeFile(docPath(id, ".source"), bytes)
  }
  await writeFile(docPath(id, ".txt"), text)
  const manifest = { id, sha256: id, url: finalUrl.href, pages, media_type: isPdf ? "application/pdf" : type, bytes: bytes.length }
  await writeFile(docPath(id, ".json"), JSON.stringify(manifest))
  return manifest
}

export async function extractPages({ document_id, pages }) {
  const doc = JSON.parse(await readFile(docPath(document_id, ".json"), "utf8"))
  if (!Array.isArray(pages) || !pages.length || pages.length > 8 || pages.some(p => !Number.isInteger(p) || p < 1 || p > doc.pages)) throw new Error("Choose at most eight valid PDF page indices (1 based)")
  const text = (await readFile(docPath(document_id, ".txt"), "utf8")).split("\f")
  return pages.map(page => ({ page, text: (text[page - 1] || "").slice(0, 24000) }))
}

export async function searchDocument({ document_id, query }) {
  if (typeof query !== "string" || query.length < 2 || query.length > 200) throw new Error("Invalid search query")
  await readFile(docPath(document_id, ".json"))
  const pages = (await readFile(docPath(document_id, ".txt"), "utf8")).split("\f")
  const hits = []
  for (let i = 0; i < pages.length && hits.length < 20; i++) {
    const offset = pages[i].toLowerCase().indexOf(query.toLowerCase())
    if (offset >= 0) hits.push({ page: i + 1, text: pages[i].slice(Math.max(0, offset - 300), offset + 2000) })
  }
  return hits
}

export async function renderPage({ document_id, page }) {
  const doc = JSON.parse(await readFile(docPath(document_id, ".json"), "utf8"))
  if (doc.media_type !== "application/pdf" || !Number.isInteger(page) || page < 1 || page > doc.pages) throw new Error("Invalid PDF page")
  const prefix = docPath(document_id, "-page-" + page)
  await runFile("pdftoppm", ["-f", String(page), "-l", String(page), "-singlefile", "-scale-to", "1600", "-png", docPath(document_id, ".pdf"), prefix], { timeout: 30000, maxBuffer: 1024 * 1024 })
  return { type: "image", mimeType: "image/png", data: (await readFile(prefix + ".png")).toString("base64") }
}
