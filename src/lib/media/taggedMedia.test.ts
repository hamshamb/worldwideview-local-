import { describe, it, expect } from "vitest";

import {
    parseTaggedMediaValue,
    stripMediaTypePrefix,
    MEDIA_TAGS,
} from "./taggedMedia";

describe("parseTaggedMediaValue: well-formed values", () => {
    it.each(MEDIA_TAGS)("splits a %s: marker from its URL", (tag) => {
        const parsed = parseTaggedMediaValue(`${tag}:https://host/feed`);
        expect(parsed.type).toBe(tag);
        expect(parsed.url).toBe("https://host/feed");
        expect(parsed.tags).toEqual([tag]);
        expect(parsed.malformed).toBe(false);
    });

    it("reports no marker for a plain URL", () => {
        const parsed = parseTaggedMediaValue("https://host/feed");
        expect(parsed.type).toBeNull();
        expect(parsed.url).toBe("https://host/feed");
        expect(parsed.tags).toEqual([]);
        expect(parsed.malformed).toBe(false);
    });

    it("handles empty input", () => {
        expect(parseTaggedMediaValue("")).toEqual({
            type: null, url: "", raw: "", tags: [], malformed: false,
        });
    });
});

describe("parseTaggedMediaValue: provenance", () => {
    it.each([
        "video:https://host/feed",
        "  VIDEO: https://host/feed  ",
        "video:image:https://host/x",
        "https://host/feed",
    ])("retains %s byte-for-byte in raw", (input) => {
        expect(parseTaggedMediaValue(input).raw).toBe(input);
    });

    it("exposes type, normalized url and raw as separate values", () => {
        const raw = "  VIDEO: https://host/feed  ";
        const parsed = parseTaggedMediaValue(raw);
        expect(parsed.raw).toBe(raw);            // untouched
        expect(parsed.type).toBe("video");       // interpreted
        expect(parsed.url).toBe("https://host/feed"); // normalized
    });
});

describe("parseTaggedMediaValue: tolerated malformation", () => {
    it("tolerates an uppercase marker", () => {
        expect(parseTaggedMediaValue("VIDEO:http://host/f").type).toBe("video");
    });

    it("tolerates a mixed-case marker", () => {
        expect(parseTaggedMediaValue("ViDeO:http://host/f").type).toBe("video");
    });

    it("tolerates leading whitespace", () => {
        expect(parseTaggedMediaValue("  video:http://host/f").url).toBe("http://host/f");
    });

    it("tolerates whitespace between marker and URL", () => {
        expect(parseTaggedMediaValue("video: http://host/f").url).toBe("http://host/f");
    });

    it("normalizes a repeated identical marker (unambiguous)", () => {
        const parsed = parseTaggedMediaValue("video:video:http://host/f");
        expect(parsed.type).toBe("video");
        expect(parsed.url).toBe("http://host/f");
        expect(parsed.tags).toEqual(["video", "video"]);
        expect(parsed.malformed).toBe(false);
    });

    it("normalizes a repeated marker regardless of case", () => {
        expect(parseTaggedMediaValue("VIDEO:video:http://host/f").type).toBe("video");
    });
});

describe("parseTaggedMediaValue: contradictory markers are malformed", () => {
    it.each([
        "video:image:http://host/f",
        "image:video:http://host/f",
        "url:video:https://host/f",
        "video:url:image:https://host/f",
    ])("refuses to interpret %s", (input) => {
        const parsed = parseTaggedMediaValue(input);
        expect(parsed.malformed).toBe(true);
        expect(parsed.type).toBeNull();
        expect(parsed.url).toBe("");
    });

    it("preserves the conflicting markers for reporting", () => {
        const parsed = parseTaggedMediaValue("video:image:http://host/f");
        expect(parsed.tags).toEqual(["video", "image"]);
        expect(parsed.raw).toBe("video:image:http://host/f");
    });

    it("does not surface the embedded URL for a contradictory value", () => {
        // The whole point: an http URL appearing later must not license a request.
        const parsed = parseTaggedMediaValue("video:image:http://host/f");
        expect(parsed.url).not.toContain("host");
        expect(stripMediaTypePrefix("video:image:http://host/f")).toBe("");
    });
});

describe("stripMediaTypePrefix: values that must NOT be altered", () => {
    it.each(["http://host/feed", "https://host/feed"])("leaves %s unchanged", (v) => {
        expect(stripMediaTypePrefix(v)).toBe(v);
    });

    it("ignores a marker appearing later in the path", () => {
        expect(stripMediaTypePrefix("http://host/video:clip")).toBe("http://host/video:clip");
    });

    it("ignores a marker appearing in the query string", () => {
        expect(stripMediaTypePrefix("http://host/f?src=video:x")).toBe("http://host/f?src=video:x");
    });

    it.each(["ftp://host/f", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x"])(
        "does not strip the unknown scheme %s",
        (value) => { expect(stripMediaTypePrefix(value)).toBe(value); },
    );

    it("does not strip datetime:, which never carries a URL", () => {
        expect(stripMediaTypePrefix("datetime:2026-06-01T05:00:00Z"))
            .toBe("datetime:2026-06-01T05:00:00Z");
    });

    it("is idempotent", () => {
        const once = stripMediaTypePrefix("video:https://host/feed");
        expect(stripMediaTypePrefix(once)).toBe(once);
    });

    it("handles empty input", () => {
        expect(stripMediaTypePrefix("")).toBe("");
    });
});

describe("stripMediaTypePrefix: must not become a security bypass", () => {
    it("exposes a nested dangerous scheme rather than laundering it into http", () => {
        expect(stripMediaTypePrefix("video:javascript:alert(1)")).toBe("javascript:alert(1)");
    });

    it("leaves a nested file: scheme intact for downstream rejection", () => {
        expect(stripMediaTypePrefix("video:file:///etc/passwd")).toBe("file:///etc/passwd");
    });

    it("never yields an http(s) URL from a value that contained none", () => {
        for (const v of ["video:javascript:alert(1)", "image:file:///etc/passwd", "url:data:text/html,x"]) {
            expect(stripMediaTypePrefix(v)).not.toMatch(/^https?:\/\//i);
        }
    });
});
