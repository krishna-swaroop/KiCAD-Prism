import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
    ProjectSectionPanel,
    useVisitedProjectSections,
    type ProjectSection,
} from "./project-section-cache";

function StatefulProbe({
    name,
    onMount,
}: {
    name: string;
    onMount: (name: string) => void;
}) {
    const [count, setCount] = useState(0);
    useEffect(() => onMount(name), [name, onMount]);
    return (
        <button type="button" onClick={() => setCount((value) => value + 1)}>
            {name} {count}
        </button>
    );
}

function Harness({
    projectId,
    activeSection,
    onMount,
}: {
    projectId: string;
    activeSection: ProjectSection;
    onMount: (name: string) => void;
}) {
    const visited = useVisitedProjectSections(projectId, activeSection);
    return (
        <>
            {(["overview", "history", "visualizers", "assets", "documentation", "workflows"] as const)
                .map((section) => visited.has(section) && (
                    <ProjectSectionPanel
                        key={`${projectId}:${section}`}
                        active={activeSection === section}
                    >
                        <StatefulProbe name={section} onMount={onMount} />
                    </ProjectSectionPanel>
                ))}
        </>
    );
}

describe("project section cache", () => {
    it("mounts sections lazily and retains their state while hidden", () => {
        const onMount = vi.fn();
        const view = render(
            <Harness projectId="p1" activeSection="overview" onMount={onMount} />,
        );
        expect(screen.getByRole("button", { name: "overview 0" })).toBeVisible();
        expect(screen.queryByText("history 0")).not.toBeInTheDocument();

        view.rerender(
            <Harness projectId="p1" activeSection="history" onMount={onMount} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "history 0" }));
        expect(screen.getByRole("button", { name: "history 1" })).toBeVisible();
        expect(screen.getByText("overview 0").closest("section")).toHaveAttribute("hidden");

        view.rerender(
            <Harness projectId="p1" activeSection="visualizers" onMount={onMount} />,
        );
        expect(screen.queryByRole("button", { name: "history 1" })).not.toBeInTheDocument();
        expect(screen.getByText("history 1").closest("section")).toHaveAttribute("aria-hidden", "true");
        view.rerender(
            <Harness projectId="p1" activeSection="history" onMount={onMount} />,
        );
        expect(screen.getByRole("button", { name: "history 1" })).toBeVisible();
        expect(onMount.mock.calls.filter(([name]) => name === "history")).toHaveLength(1);
    });

    it("discards visited sections and local state when the project changes", () => {
        const onMount = vi.fn();
        const view = render(
            <Harness projectId="p1" activeSection="history" onMount={onMount} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "history 0" }));

        view.rerender(
            <Harness projectId="p2" activeSection="history" onMount={onMount} />,
        );

        expect(screen.getByRole("button", { name: "history 0" })).toBeVisible();
        expect(onMount.mock.calls.filter(([name]) => name === "history")).toHaveLength(2);
    });

    it.each(["assets", "documentation", "workflows"] as const)(
        "retains local state in the %s section",
        (section) => {
            const onMount = vi.fn();
            const view = render(
                <Harness projectId="p1" activeSection={section} onMount={onMount} />,
            );
            fireEvent.click(screen.getByRole("button", { name: `${section} 0` }));

            view.rerender(
                <Harness projectId="p1" activeSection="overview" onMount={onMount} />,
            );
            view.rerender(
                <Harness projectId="p1" activeSection={section} onMount={onMount} />,
            );

            expect(screen.getByRole("button", { name: `${section} 1` })).toBeVisible();
            expect(onMount.mock.calls.filter(([name]) => name === section)).toHaveLength(1);
        },
    );
});
