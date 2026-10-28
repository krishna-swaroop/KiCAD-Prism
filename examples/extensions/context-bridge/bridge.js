"use strict";

// This page is a separately hosted extension. It has no access to Prism's
// window or session and makes no API requests on behalf of the host.
const query = new URLSearchParams(window.location.search);
const context = {
  prism_origin: query.get("prism_origin") || null,
  prism_project_id: query.get("prism_project_id") || null,
  prism_commit: query.get("prism_commit") || null,
  prism_branch: query.get("prism_branch") || null,
};

for (const [id, value] of [
  ["origin", context.prism_origin],
  ["project", context.prism_project_id],
  ["commit", context.prism_commit],
  ["branch", context.prism_branch],
]) {
  document.getElementById(id).textContent = value || "Not supplied";
}

document.getElementById("context").value = JSON.stringify(context, null, 2);
document.getElementById("status").textContent = context.prism_project_id
  ? "Project context received. No design data has been fetched."
  : "Open a project in Prism, choose Extensions, then Inspect context.";
