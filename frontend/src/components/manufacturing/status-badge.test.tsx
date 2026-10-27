import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RUN_STATUSES, RUN_STATUS_LABELS } from "@/types/manufacturing";
import { RUN_STATUS_VARIANT, RunStatusBadge, SEVERITY_VARIANT } from "./status-badge";

describe("RunStatusBadge", () => {
    afterEach(cleanup);

    it("labels and tones every run status, each stage distinct", () => {
        const tones = new Set<string>();
        for (const status of RUN_STATUSES) {
            const { unmount } = render(<RunStatusBadge status={status} />);
            const badge = screen.getByText(RUN_STATUS_LABELS[status]);
            expect(badge.getAttribute("data-variant")).toBe(RUN_STATUS_VARIANT[status]);
            tones.add(RUN_STATUS_VARIANT[status]);
            unmount();
        }
        expect(tones.size).toBe(RUN_STATUSES.length);
    });

    it("gives a cancelled run its own quiet badge, outside the five lifecycle tones", () => {
        render(<RunStatusBadge status="cancelled" />);
        const badge = screen.getByText("Cancelled");
        expect(badge.getAttribute("data-variant")).toBe("secondary");
        expect(RUN_STATUS_VARIANT.cancelled).toBe("secondary");
    });

    it("escalates defect severity from quiet to destructive", () => {
        expect(SEVERITY_VARIANT).toEqual({
            aesthetic: "outline",
            minor: "secondary",
            major: "warning",
            critical: "destructive",
        });
    });
});
