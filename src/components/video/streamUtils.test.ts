import { describe, it, expect } from "vitest";
import {
    cleanStreamUrl,
    isHlsUrl,
    isKnownVideoPlatform,
    getYouTubeEmbedUrl,
    getProxiedStreamUrl,
    getProxiedIframeUrl,
    getStreamErrorMessage,
} from "./streamUtils";

describe("streamUtils", () => {
    describe("cleanStreamUrl", () => {
        it("returns empty string for empty input", () => {
            expect(cleanStreamUrl("")).toBe("");
        });

        it("strips video: prefix", () => {
            expect(cleanStreamUrl("video:http://81.133.30.194:82/mjpg/video.mjpg")).toBe(
                "http://81.133.30.194:82/mjpg/video.mjpg"
            );
        });

        it("strips image: prefix", () => {
            expect(cleanStreamUrl("image:https://example.com/snapshot.jpg")).toBe(
                "https://example.com/snapshot.jpg"
            );
        });

        it("strips url: prefix", () => {
            expect(cleanStreamUrl("url:https://example.com/live")).toBe(
                "https://example.com/live"
            );
        });

        it("leaves clean URLs unchanged", () => {
            expect(cleanStreamUrl("https://example.com/feed.m3u8")).toBe(
                "https://example.com/feed.m3u8"
            );
        });
    });

    describe("isHlsUrl", () => {
        it("detects .m3u8 URLs", () => {
            expect(isHlsUrl("https://stream.example.com/live.m3u8")).toBe(true);
            expect(isHlsUrl("https://stream.example.com/live.m3u8?token=xyz")).toBe(true);
        });

        it("detects .m3u8 URLs with tagged video: prefix", () => {
            expect(isHlsUrl("video:https://stream.example.com/live.m3u8")).toBe(true);
        });

        it("returns false for non-HLS URLs", () => {
            expect(isHlsUrl("https://example.com/video.mp4")).toBe(false);
            expect(isHlsUrl("image:https://example.com/snapshot.jpg")).toBe(false);
            expect(isHlsUrl("")).toBe(false);
        });
    });

    describe("isKnownVideoPlatform", () => {
        it("identifies YouTube, Twitch, Vimeo, and player URLs", () => {
            expect(isKnownVideoPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
            expect(isKnownVideoPlatform("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
            expect(isKnownVideoPlatform("https://twitch.tv/example")).toBe(true);
            expect(isKnownVideoPlatform("video:https://vimeo.com/123456")).toBe(true);
            expect(isKnownVideoPlatform("https://example.com/player/index.html")).toBe(true);
        });

        it("returns false for direct video feeds and images", () => {
            expect(isKnownVideoPlatform("http://81.133.30.194:82/mjpg/video.mjpg")).toBe(false);
            expect(isKnownVideoPlatform("https://example.com/feed.jpg")).toBe(false);
            expect(isKnownVideoPlatform("")).toBe(false);
        });
    });

    describe("getYouTubeEmbedUrl", () => {
        it("converts standard YouTube watch URLs to embed format with autoplay", () => {
            const res = getYouTubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
            expect(res).toContain("youtube.com/embed/dQw4w9WgXcQ");
            expect(res).toContain("autoplay=1");
        });

        it("converts youtu.be short URLs", () => {
            const res = getYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ");
            expect(res).toContain("youtube.com/embed/dQw4w9WgXcQ");
        });

        it("handles tagged video: prefix gracefully", () => {
            const res = getYouTubeEmbedUrl("video:https://www.youtube.com/watch?v=dQw4w9WgXcQ");
            expect(res).toContain("youtube.com/embed/dQw4w9WgXcQ");
        });
    });

    describe("getProxiedStreamUrl", () => {
        it("returns empty string for empty input", () => {
            expect(getProxiedStreamUrl("")).toBe("");
        });

        it("strips video: prefix and generates valid proxy route parameter (Issue #447)", () => {
            const raw = "video:http://81.133.30.194:82/mjpg/video.mjpg";
            const proxied = getProxiedStreamUrl(raw);
            expect(proxied).toBe(
                "/api/camera/proxy/stream?url=http%3A%2F%2F81.133.30.194%3A82%2Fmjpg%2Fvideo.mjpg"
            );
            expect(proxied).not.toContain("video%3A");
        });

        it("strips image: prefix and generates valid proxy route parameter", () => {
            const raw = "image:http://185.94.82.113:80/cgi-bin/faststream.jpg";
            const proxied = getProxiedStreamUrl(raw);
            expect(proxied).toBe(
                "/api/camera/proxy/stream?url=http%3A%2F%2F185.94.82.113%3A80%2Fcgi-bin%2Ffaststream.jpg"
            );
            expect(proxied).not.toContain("image%3A");
        });
    });

    describe("getProxiedIframeUrl", () => {
        it("strips prefixes and encodes iframe URL", () => {
            const raw = "video:https://example.com/player/camera1";
            expect(getProxiedIframeUrl(raw)).toBe(
                "/api/camera/proxy/iframe?url=https%3A%2F%2Fexample.com%2Fplayer%2Fcamera1"
            );
        });
    });

    describe("getStreamErrorMessage", () => {
        it("returns HLS explanation when URL is an m3u8", () => {
            const msg = getStreamErrorMessage("video:https://example.com/feed.m3u8");
            expect(msg).toContain("HLS streams (.m3u8) require a dedicated player");
        });

        it("returns fallback message for generic stream errors", () => {
            const msg = getStreamErrorMessage("http://81.133.30.194:82/mjpg/video.mjpg");
            expect(msg).toContain("Stream Failed");
        });
    });

    // Issue #447: WWV media markers must never reach the proxy as a protocol.
    describe("media-tag proxy boundary invariant (Issue #447)", () => {
        const decodeUrlParam = (proxied: string): string => {
            const match = proxied.match(/[?&]url=([^&]*)/);
            expect(match, `no url param in ${proxied}`).not.toBeNull();
            return decodeURIComponent(match![1]);
        };

        const TAGGED_VARIANTS = [
            "video:http://cam.example/feed.mjpg",
            "image:http://cam.example/snap.jpg",
            "url:http://cam.example/live",
            "VIDEO:http://cam.example/feed.mjpg",
            "ViDeO:http://cam.example/feed.mjpg",
            "  video:http://cam.example/feed.mjpg",
            "video: http://cam.example/feed.mjpg",
            "video:video:http://cam.example/feed.mjpg",
        ];

        it.each(TAGGED_VARIANTS)(
            "getProxiedStreamUrl(%s) yields an http(s) url param with no marker",
            (raw) => {
                const decoded = decodeUrlParam(getProxiedStreamUrl(raw));
                expect(decoded).toMatch(/^https?:\/\//);
                expect(decoded).not.toMatch(/^(video|image|url):/i);
            },
        );

        it.each(TAGGED_VARIANTS)(
            "getProxiedIframeUrl(%s) yields an http(s) url param with no marker",
            (raw) => {
                const decoded = decodeUrlParam(getProxiedIframeUrl(raw));
                expect(decoded).toMatch(/^https?:\/\//);
                expect(decoded).not.toMatch(/^(video|image|url):/i);
            },
        );

        it("does not launder a nested dangerous scheme into an http url", () => {
            const decoded = decodeUrlParam(getProxiedStreamUrl("video:javascript:alert(1)"));
            expect(decoded).toBe("javascript:alert(1)");
            expect(decoded).not.toMatch(/^https?:\/\//);
        });

        it.each([
            "video:image:http://cam.example/feed.mjpg",
            "image:video:http://cam.example/feed.mjpg",
            "url:video:https://cam.example/feed",
        ])("returns no proxy URL for the contradictory value %s", (raw) => {
            // Contradictory markers have no defensible interpretation, so the
            // boundary fails closed rather than proxying a guessed URL.
            expect(getProxiedStreamUrl(raw)).toBe("");
            expect(getProxiedIframeUrl(raw)).toBe("");
        });

        it("leaves a marker occurring later in the path intact", () => {
            const decoded = decodeUrlParam(getProxiedStreamUrl("http://cam.example/video:clip"));
            expect(decoded).toBe("http://cam.example/video:clip");
        });
    });
});