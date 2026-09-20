/**
 * TR-22: privacy-safe mention candidates and tokens (F1, F8).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommentForm, type CommentFormSubmitPayload } from "@/components/comment-form";
import type { CommentLocation, MentionCandidate } from "@/types/comments";

const examples = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../../docs/tracker-integration/dto-examples.json"), "utf8"),
) as {
    comments: {
        MentionCandidate: MentionCandidate;
    };
};

const location: CommentLocation = { x: 1, y: 2, layer: "F.Cu", page: "" };

const candidates: MentionCandidate[] = [
    examples.comments.MentionCandidate,
    {
        userId: "u_mira",
        displayName: "Mira",
        role: "viewer",
        linkedProviders: [],
    },
];

describe("TR-22 mention form", () => {
    it("matches the frozen MentionCandidate example", () => {
        expect(examples.comments.MentionCandidate).toEqual({
            userId: "u_7f2a",
            displayName: "Arjun",
            role: "designer",
            linkedProviders: ["github"],
        });
    });

    it("shows display names instead of emails in suggestions", () => {
        render(
            <CommentForm
                isOpen
                onClose={() => {}}
                onSubmit={() => {}}
                location={location}
                context="PCB"
                mentionCandidates={candidates}
            />,
        );

        const textarea = screen.getByLabelText("Comment");
        fireEvent.change(textarea, { target: { value: "@Ar" } });
        expect(screen.getByText("Arjun")).toBeInTheDocument();
        expect(screen.queryByText(/@example\.com/)).not.toBeInTheDocument();
    });

    it("inserts privacy-safe mention tokens and submits Mention DTOs", () => {
        let payload: CommentFormSubmitPayload | null = null;
        render(
            <CommentForm
                isOpen
                onClose={() => {}}
                onSubmit={(next) => {
                    payload = next;
                }}
                location={location}
                context="PCB"
                mentionCandidates={candidates}
            />,
        );

        const textarea = screen.getByLabelText("Comment");
        fireEvent.change(textarea, { target: { value: "Please review @Ar" } });
        fireEvent.mouseDown(screen.getByText("Arjun"));
        fireEvent.click(screen.getByRole("button", { name: "Post Comment" }));

        expect(payload).not.toBeNull();
        expect(payload!.content).toContain("@[Arjun](user:u_7f2a)");
        expect(payload!.content).not.toContain("arjun@example.com");
        expect(payload!.mentions).toEqual([{ userId: "u_7f2a", displayName: "Arjun" }]);
    });

    it("supports keyboard selection of mention candidates", () => {
        render(
            <CommentForm
                isOpen
                onClose={() => {}}
                onSubmit={() => {}}
                location={location}
                context="PCB"
                mentionCandidates={candidates}
            />,
        );

        const textarea = screen.getByLabelText("Comment");
        fireEvent.change(textarea, { target: { value: "@" } });
        fireEvent.keyDown(textarea, { key: "Enter" });
        expect((textarea as HTMLTextAreaElement).value).toContain("@[Arjun](user:u_7f2a)");
    });
});
