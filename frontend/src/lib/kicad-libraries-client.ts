import { fetchChecked, fetchJson } from "@/lib/api";
import type {
    KicadLibrary,
    KicadLibraryChanges,
    KicadLibraryList,
    LibraryCheckResult,
    LibraryVersion,
    NewKicadLibrary,
    RemoteCheckResult,
} from "@/types/kicad-libraries";

const ROOT = "/api/settings/kicad-libraries";
const JSON_HEADERS = { "Content-Type": "application/json" };

export const KICAD_LIBRARIES_KEY = ["kicad-libraries"] as const;

function at(library: Pick<KicadLibrary, "name">, action = ""): string {
    return `${ROOT}/${encodeURIComponent(library.name)}${action}`;
}

/** A write to `library`: guarded by the ETag the list gave, so a change made elsewhere is refused. */
function guarded(library: Pick<KicadLibrary, "etag">, method: string, body?: unknown): RequestInit {
    return {
        method,
        headers: { ...(body === undefined ? {} : JSON_HEADERS), "If-Match": library.etag },
        body: body === undefined ? undefined : JSON.stringify(body),
    };
}

export function listLibraries(signal?: AbortSignal): Promise<KicadLibraryList> {
    return fetchJson<KicadLibraryList>(ROOT, { signal }, "Failed to load the KiCad libraries");
}

export function createLibrary(library: NewKicadLibrary): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(
        ROOT,
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(library) },
        "Failed to add the library",
    );
}

export function updateLibrary(library: KicadLibrary, changes: KicadLibraryChanges): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(at(library), guarded(library, "PATCH", changes), "Failed to save the library");
}

export function fetchLibraryAgain(library: KicadLibrary): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(at(library, "/fetch"), { method: "POST" }, "Failed to start the fetch");
}

export function refreshLibrary(library: KicadLibrary): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(at(library, "/refresh"), guarded(library, "POST"), "Failed to refresh the library");
}

export function checkLibraryNow(library: KicadLibrary): Promise<LibraryCheckResult> {
    return fetchJson<LibraryCheckResult>(at(library, "/check"), { method: "POST" }, "Failed to check the repository");
}

export function updateLibraryNow(library: KicadLibrary): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(at(library, "/update"), guarded(library, "POST"), "Failed to update the library");
}

export function freezeLibrary(library: KicadLibrary): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(at(library, "/freeze"), guarded(library, "POST"), "Failed to pin the library");
}

export function unfreezeLibrary(library: KicadLibrary): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(at(library, "/unfreeze"), guarded(library, "POST"), "Failed to let the library follow its ref");
}

export function pinLibraryAt(library: KicadLibrary, commit: string): Promise<KicadLibrary> {
    return fetchJson<KicadLibrary>(
        at(library, `/versions/${encodeURIComponent(commit)}/use`),
        guarded(library, "POST"),
        "Failed to use that version",
    );
}

export function listVersions(library: Pick<KicadLibrary, "name">, signal?: AbortSignal): Promise<LibraryVersion[]> {
    return fetchJson<LibraryVersion[]>(at(library, "/versions"), { signal }, "Failed to load the versions");
}

export async function deleteLibrary(library: KicadLibrary): Promise<void> {
    await fetchChecked(at(library), guarded(library, "DELETE"), "Failed to remove the library");
}

export function checkRemote(git: string, signal?: AbortSignal): Promise<RemoteCheckResult> {
    return fetchJson<RemoteCheckResult>(
        `${ROOT}/check`,
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ git }), signal },
        "Failed to check the repository",
    );
}
