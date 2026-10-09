import test from "node:test"
import assert from "node:assert/strict"
import { submitProposal } from "./proposal.mjs"

test("structural errors return actionable failure and do not save", async () => {
  let saved = false
  const result = await submitProposal({ decision: "propose", spec: {} }, {
    check: async () => ({ files: {}, findings: [{ code: "PIN_NUMBER", path: "pins[0].number", detail: "String required" }] }),
    save: async () => { saved = true },
  })
  assert.equal(saved, false); assert.equal(result.saved, false); assert.equal(result.isError, true)
  assert.equal(result.findings[0].code, "PIN_NUMBER")
})

test("estimated geometry and review warnings do not prevent saving", async () => {
  const proposal = { decision: "propose", spec: { metadata: { land_pattern: { status: "estimated", value: "Provisional", method: "Symmetry" } } } }
  let saved
  const warnings = [{ code: "LAND_SIZE_REVIEW" }]
  const result = await submitProposal(proposal, { check: async () => ({ files: { symbol: {}, footprint: {} }, findings: [], warnings }), save: async value => { saved = value } })
  assert.deepEqual(saved, proposal); assert.equal(result.saved, true)
  assert.deepEqual(result.generated, ["symbol", "footprint"]); assert.deepEqual(result.warnings, warnings)
  assert.equal(result.review_required, true)
})
