import {
    describe, it, expect, vi, beforeEach, afterEach,
} from "vitest";
import { render, screen } from "@testing-library/react";

import { CameraStream } from "./CameraStream";
import * as streamUtils from "./streamUtils";

vi.mock("@/core/state/store", () => ({
    useStore: () => ({ addFloatingStream: vi.fn() }),
}));

vi.mock("./HlsPlayer", () => ({
    HlsPlayer: ({ src }: { src: string }) => <div data-testid="hls" data-src={src} />,
}));

vi.mock("@/components/common/PannableView", () => ({
    PannableView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const MALFORMED = "video:image:http://cam.example/feed.mjpg";
const CANONICAL = "video:http://cam.example/feed.mjpg";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(streamUtils, "getProxiedStreamUrl");
    vi.spyOn(streamUtils, "getProxiedIframeUrl");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** Every element type that would cause the browser to hit the network. */
function networkElements(container: HTMLElement) {
    return container.querySelectorAll("img, iframe, video, source, [data-testid='hls']");
}

describe("CameraStream — contradictory tagged source", () => {
    it("renders an explicit invalid-source state", () => {
        render(<CameraStream streamUrl={MALFORMED} label="Cam" />);
        const el = screen.getByTestId("camera-stream-malformed");
        expect(el.textContent).toContain("Invalid source");
        expect(el.textContent).toContain("video");
        expect(el.textContent).toContain("image");
    });

    it("renders NO network-consuming element at all", () => {
        const { container } = render(<CameraStream streamUrl={MALFORMED} label="Cam" />);
        expect(networkElements(container).length).toBe(0);
    });

    it("never renders an empty-src element", () => {
        const { container } = render(<CameraStream streamUrl={MALFORMED} label="Cam" />);
        // An empty src still resolves against the document URL in browsers.
        for (const el of Array.from(container.querySelectorAll("[src]"))) {
            expect(el.getAttribute("src")).not.toBe("");
        }
    });

    it("constructs no proxy URL", () => {
        render(<CameraStream streamUrl={MALFORMED} label="Cam" />);
        expect(streamUtils.getProxiedStreamUrl).not.toHaveBeenCalled();
        expect(streamUtils.getProxiedIframeUrl).not.toHaveBeenCalled();
    });

    it("issues no camera proxy or extract request", () => {
        render(<CameraStream streamUrl={MALFORMED} label="Cam" />);
        const called = fetchSpy.mock.calls.map((c) => String(c[0]));
        expect(called.filter((u) => u.includes("/api/camera"))).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does not render a malformed preview image either", () => {
        const { container } = render(
            <CameraStream streamUrl={CANONICAL} previewUrl={MALFORMED} label="Cam" />,
        );
        for (const img of Array.from(container.querySelectorAll("img"))) {
            expect(img.getAttribute("src") ?? "").not.toContain("image%3A");
            expect(img.getAttribute("src")).not.toBe("");
        }
    });
});

describe("CameraStream — canonical source still works", () => {
    it("renders a preview image through the proxy for a canonical tagged value", () => {
        const { container } = render(
            <CameraStream streamUrl={CANONICAL} previewUrl="image:http://cam.example/s.jpg" label="Cam" />,
        );
        const imgs = Array.from(container.querySelectorAll("img"));
        expect(imgs.length).toBeGreaterThan(0);
        const src = imgs[0].getAttribute("src") ?? "";
        expect(src).toContain("/api/camera/proxy/stream?url=");
        expect(decodeURIComponent(src.split("url=")[1])).toMatch(/^https?:\/\//);
    });

    it("shows no invalid-source state for a canonical value", () => {
        render(<CameraStream streamUrl={CANONICAL} label="Cam" />);
        expect(screen.queryByTestId("camera-stream-malformed")).toBeNull();
    });
});
