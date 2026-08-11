import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./markdown-content";

const identity = (src?: string) => src;

/**
 * README content comes out of somebody's Git repository, and raw HTML in it is
 * turned into real DOM. Everything here is a payload that would have executed,
 * navigated or exfiltrated before the sanitizer was added.
 */
describe("markdown rendering of untrusted repository content", () => {
    it("drops script elements", async () => {
        const { container } = render(
            <MarkdownContent
                content={'# Readme\n\n<script>window.__owned = true;</script>\n'}
                resolveImageSrc={identity}
            />,
        );

        await waitFor(() => expect(container.querySelector("h1")).not.toBeNull());
        expect(container.querySelector("script")).toBeNull();
        expect(container.innerHTML).not.toContain("__owned");
    });

    it("strips inline event handlers", async () => {
        const { container } = render(
            <MarkdownContent
                content={'<img src="x" onerror="window.__owned = true" alt="boom">'}
                resolveImageSrc={identity}
            />,
        );

        await waitFor(() => expect(container.querySelector(".markdown-body")).not.toBeNull());
        expect(container.innerHTML).not.toContain("onerror");
    });

    it("refuses javascript: links", async () => {
        const { container } = render(
            <MarkdownContent
                content={'[click me](javascript:window.__owned=true)'}
                resolveImageSrc={identity}
            />,
        );

        await waitFor(() => expect(container.querySelector(".markdown-body")).not.toBeNull());
        const anchor = container.querySelector("a");
        expect(anchor?.getAttribute("href") ?? "").not.toContain("javascript:");
    });

    it("keeps iframes out", async () => {
        const { container } = render(
            <MarkdownContent
                content={'<iframe src="https://evil.example/"></iframe>'}
                resolveImageSrc={identity}
            />,
        );

        await waitFor(() => expect(container.querySelector(".markdown-body")).not.toBeNull());
        expect(container.querySelector("iframe")).toBeNull();
    });

    it("still renders the HTML a real README uses", async () => {
        const { container } = render(
            <MarkdownContent
                content={
                    '<div align="center">\n\n# Project\n\n</div>\n\n' +
                    "<details><summary>Build notes</summary>\n\nRun `make`.\n\n</details>\n"
                }
                resolveImageSrc={identity}
            />,
        );

        await waitFor(() => expect(container.querySelector("details")).not.toBeNull());
        expect(container.querySelector("summary")?.textContent).toBe("Build notes");
        expect(container.querySelector("div[align='center']")).not.toBeNull();
    });

    it("routes image sources through the resolver", async () => {
        const { container } = render(
            <MarkdownContent
                content={"![diagram](./docs/diagram.png)"}
                resolveImageSrc={(src) => `/api/resolved?path=${src}`}
            />,
        );

        await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
        expect(container.querySelector("img")?.getAttribute("src")).toBe(
            "/api/resolved?path=./docs/diagram.png",
        );
    });
});
