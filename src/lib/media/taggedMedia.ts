/**
 * @file taggedMedia.ts
 * @description Canonical boundary between WorldWideView's internal media-type
 * markers and real network URLs.
 * @module lib/media
 */

/**
 * Internal dispatch markers WWV prefixes onto property values so the Intel panel
 * knows how to render them. Produced by the SDK helpers `videoProp`, `imageProp`
 * and `urlProp`.
 *
 * These are metadata, NOT network protocols. `datetime:` is deliberately absent —
 * it never carries a URL and so never reaches a network boundary.
 */
export const MEDIA_TAGS = ["video", "image", "url"] as const;

export type MediaTagType = (typeof MEDIA_TAGS)[number];

export interface TaggedMediaValue {
    /**
     * The interpreted marker, or null when the value carried none — or when the
     * markers contradicted each other and no single interpretation is defensible.
     */
    type: MediaTagType | null;
    /**
     * The URL safe to hand to a network boundary.
     *
     * Empty when the value is malformed: a contradictory value has no trustworthy
     * interpretation, so none is offered.
     */
    url: string;
    /** The exact original input, byte-for-byte, retained for provenance. */
    raw: string;
    /** Every marker seen, outermost first, so callers can report the conflict. */
    tags: MediaTagType[];
    /** True when markers disagree (e.g. `video:image:`). `url` is withheld. */
    malformed: boolean;
}

const TAG_PATTERN = new RegExp(`^(${MEDIA_TAGS.join("|")}):`, "i");

/**
 * Split a possibly-tagged property value into its marker and its URL.
 *
 * A single string carries two meanings in WWV — `video:https://host/feed` is a
 * render hint plus a transport URL. Treating it as one opaque string is what let
 * `video:` reach `new URL()` and be read as a protocol (issue #447). This is the
 * one place that separates them.
 *
 * Tolerated, because producers are third-party plugins and the SDK's `videoProp`
 * helpers do no validation of their input:
 *  - surrounding whitespace
 *  - any letter case (`VIDEO:`)
 *  - the same marker repeated (`video:video:`) — unambiguous, so normalised
 *
 * Rejected: markers that disagree, such as `video:image:https://host/x`. Nothing
 * in this repository produces nested markers, so there is no supported meaning to
 * fall back on — is that a video or an image? Collapsing it would invent an
 * answer and turn ambiguous OSINT metadata into a live network request. Such a
 * value is reported as `malformed` with an empty `url`, and the markers seen are
 * preserved in `tags` so callers can surface the real problem.
 *
 * Only the markers in {@link MEDIA_TAGS} are removed; unknown schemes such as
 * `ftp:`, `file:` or `javascript:` are left intact so downstream validation still
 * sees — and rejects — them. Stripping is therefore never a security bypass.
 *
 * @example
 * parseTaggedMediaValue("video:https://host/feed")
 * // { type: "video", url: "https://host/feed", tags: ["video"], malformed: false, raw: ... }
 * @example
 * parseTaggedMediaValue("video:image:https://host/x")
 * // { type: null, url: "", tags: ["video", "image"], malformed: true, raw: ... }
 */
export function parseTaggedMediaValue(value: string): TaggedMediaValue {
    const raw = value;

    if (!value) {
        return {
            type: null, url: value, raw, tags: [], malformed: false,
        };
    }

    let remainder = value.trim();
    const tags: MediaTagType[] = [];

    let match = TAG_PATTERN.exec(remainder);
    while (match) {
        tags.push(match[1].toLowerCase() as MediaTagType);
        remainder = remainder.slice(match[0].length).trim();
        match = TAG_PATTERN.exec(remainder);
    }

    const distinct = new Set(tags);

    // Contradictory markers: refuse to guess, and withhold the URL.
    if (distinct.size > 1) {
        return {
            type: null, url: "", raw, tags, malformed: true,
        };
    }

    return {
        type: tags.length > 0 ? tags[0] : null,
        url: remainder,
        raw,
        tags,
        malformed: false,
    };
}

/**
 * Return a value with any WWV media markers removed, or an empty string when the
 * value carries contradictory markers.
 *
 * Thin wrapper over {@link parseTaggedMediaValue} for callers that only need the
 * URL. Named for what it does — it strips dispatch markers, it does not sanitise
 * or validate; that remains the job of the SSRF layer at the network boundary.
 */
export function stripMediaTypePrefix(value: string): string {
    if (!value) return value;
    return parseTaggedMediaValue(value).url;
}
