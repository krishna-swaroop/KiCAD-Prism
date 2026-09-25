import { describe, expect, it } from "vitest";

import { CATALOG_WORKFLOW_POLICY } from "./catalog-workflow-policy.generated";
import { ROLE_OPTIONS, allowedWorkflowTransitions, allowedWorkflowTransitionsFrom, normalizeWorkflowStage, workflowStage } from "./roles";
import type { UserRole } from "@/types/auth";
import type { CatalogComponent, WorkflowStage } from "@/types/catalog";

const STAGES: WorkflowStage[] = ["open", "in_progress", "qa_review", "done", "released", "archived"];

// Written by hand, independently of the generated contract, so a bad
// regeneration on the server side fails here too.
const EXPECTED: Record<UserRole, Record<WorkflowStage, WorkflowStage[]>> = {
  viewer: { open: [], in_progress: [], qa_review: [], done: [], released: [], archived: [] },
  designer: {
    open: ["in_progress", "archived"],
    in_progress: ["qa_review", "open", "archived"],
    qa_review: ["in_progress", "archived"],
    done: ["released", "qa_review", "archived"],
    released: ["archived", "open"],
    archived: ["open"],
  },
  qa: { open: [], in_progress: [], qa_review: ["done", "in_progress", "archived"], done: [], released: [], archived: [] },
  admin: {
    open: ["in_progress", "archived"],
    in_progress: ["qa_review", "open", "archived"],
    qa_review: ["done", "in_progress", "archived"],
    done: ["released", "qa_review", "archived"],
    released: ["archived", "open"],
    archived: ["open"],
  },
};

function component(stage: string): CatalogComponent {
  return { workflow_stage: stage, release_status: stage } as unknown as CatalogComponent;
}

describe("catalog workflow policy contract", () => {
  it("covers every role the app knows and every stage", () => {
    expect(Object.keys(CATALOG_WORKFLOW_POLICY.allowed).sort()).toEqual([...ROLE_OPTIONS].sort());
    expect([...CATALOG_WORKFLOW_POLICY.stages]).toEqual(STAGES);
    for (const role of ROLE_OPTIONS) {
      expect(Object.keys(CATALOG_WORKFLOW_POLICY.allowed[role])).toEqual(STAGES);
    }
  });

  it("offers exactly the server's transitions for every role and stage", () => {
    for (const role of ROLE_OPTIONS) {
      for (const stage of STAGES) {
        expect(allowedWorkflowTransitionsFrom(role, stage), `${role}@${stage}`).toEqual(EXPECTED[role][stage]);
        expect(allowedWorkflowTransitionsFrom(role, stage), `${role}@${stage} vs contract`).toEqual([
          ...CATALOG_WORKFLOW_POLICY.allowed[role][stage],
        ]);
        expect(allowedWorkflowTransitions(role, component(stage))).toEqual(EXPECTED[role][stage]);
      }
    }
  });

  it("never offers the current stage, and only offers graph edges", () => {
    for (const role of ROLE_OPTIONS) {
      for (const stage of STAGES) {
        const offered = allowedWorkflowTransitionsFrom(role, stage);
        expect(offered).not.toContain(stage);
        for (const next of offered) {
          expect([...CATALOG_WORKFLOW_POLICY.transitions[stage]]).toContain(next);
        }
      }
    }
  });

  it("QA returns or approves only from review; designers cannot approve", () => {
    expect(allowedWorkflowTransitionsFrom("qa", "qa_review")).toEqual(["done", "in_progress", "archived"]);
    expect(allowedWorkflowTransitionsFrom("qa", "done")).toEqual([]);
    expect(allowedWorkflowTransitionsFrom("designer", "qa_review")).not.toContain("done");
    expect(allowedWorkflowTransitionsFrom("admin", "qa_review")).toContain("done");
  });

  it("offers nothing for unknown roles, unknown stages, or no user", () => {
    expect(allowedWorkflowTransitionsFrom(undefined, "open")).toEqual([]);
    expect(allowedWorkflowTransitionsFrom(null, "open")).toEqual([]);
    expect(allowedWorkflowTransitionsFrom("owner" as UserRole, "open")).toEqual([]);
    expect(allowedWorkflowTransitionsFrom("admin", "bogus")).toEqual([]);
    expect(allowedWorkflowTransitions("admin", component("bogus"))).toEqual([]);
  });

  it("normalizes the server's legacy aliases before offering transitions", () => {
    for (const [legacy, current] of Object.entries(CATALOG_WORKFLOW_POLICY.legacyAliases)) {
      expect(normalizeWorkflowStage(legacy)).toBe(current);
      expect(normalizeWorkflowStage(` ${legacy.toUpperCase()} `)).toBe(current);
      expect(workflowStage(component(legacy))).toBe(current);
      expect(allowedWorkflowTransitions("admin", component(legacy))).toEqual(EXPECTED.admin[current as WorkflowStage]);
    }
    expect(normalizeWorkflowStage("in_review")).toBe("qa_review");
    expect(allowedWorkflowTransitions("qa", component("in_review"))).toEqual(["done", "in_progress", "archived"]);
    expect(normalizeWorkflowStage("")).toBeNull();
    expect(normalizeWorkflowStage(undefined)).toBeNull();
    for (const stage of STAGES) expect(normalizeWorkflowStage(stage)).toBe(stage);
  });

  it("falls back to release_status when workflow_stage is absent", () => {
    const legacyRow = { release_status: "qa_approved" } as unknown as CatalogComponent;
    expect(workflowStage(legacyRow)).toBe("done");
  });
});
