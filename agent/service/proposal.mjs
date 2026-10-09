// Saving a proposal is not engineering approval. Only malformed/unrenderable
// specs require repair; estimates and review warnings are valid draft output.
export async function submitProposal(proposal, { check, save }) {
  if (!["propose", "needs_input"].includes(proposal.decision)) throw new Error("Invalid decision")
  if (proposal.decision === "needs_input") {
    if (!proposal.question?.trim()) throw new Error("Explain the missing identity or pin mapping")
    await save(proposal)
    return { saved: true, review_required: true }
  }
  const result = await check(proposal.spec)
  const generated = Object.keys(result.files || {})
  if (!generated.length) return { saved: false, isError: true, findings: result.findings,
    next_action: "Repair these structural errors and submit again. Geometry estimates are allowed; missing manufacturer land recommendations are not a reason to stop." }
  await save(proposal)
  return { saved: true, generated, findings: result.findings, warnings: result.warnings || [], review_required: true }
}
