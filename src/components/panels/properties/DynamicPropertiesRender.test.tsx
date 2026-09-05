import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";

import { DynamicPropertiesRender } from "./DynamicPropertiesRender";

// Stub the leaf renderers so each assertion can see exactly which component was
// dispatched and what URL it received.
vi.mock("./VideoProperty", () => ({
    VideoProperty: ({ label, href }: { label: string; href: string }) => (
        <div data-testid="video" data-label={label} data-href={href} />
    ),
}));
vi.mock("./ImageProperty", () => ({
    ImageProperty: ({ label, imageUrl }: { label: string; imageUrl: string }) => (
        <div data-testid="image" data-label={label} data-url={imageUrl} />
    ),
}));
vi.mock("./UrlProperty", () => ({
    UrlProperty: ({ label, url }: { label: string; url: string }) => (
        <div data-testid="url" data-label={label} data-url={url} />
    ),
}));
vi.mock("./DatetimePropertyRow", () => ({
    DatetimePropertyRow: ({ label, iso }: { label: string; iso: string }) => (
        <div data-testid="datetime" data-label={label} data-iso={iso} />
    ),
}));

function entityWith(properties: Record<string, unknown>): GeoEntity {
    return {
        id: "e1",
        pluginId: "test",
        latitude: 0,
        longitude: 0,
        timestamp: new Date("2026-06-01T00:00:00Z"),
        label: "Test entity",
        properties,
    };
}

const renderProps = (properties: Record<string, unknown>) =>
    render(<DynamicPropertiesRender entity={entityWith(properties)} />);

describe("DynamicPropertiesRender — canonical media dispatch", () => {
    it("renders a video: value via VideoProperty with the marker stripped", () => {
        renderProps({ feed: "video:https://host/live" });
        expect(screen.getByTestId("video").getAttribute("data-href")).toBe("https://host/live");
    });

    it("renders an image: value via ImageProperty with the marker stripped", () => {
        renderProps({ snap: "image:https://host/s.jpg" });
        expect(screen.getByTestId("image").getAttribute("data-url")).toBe("https://host/s.jpg");
    });

    it("renders a url: value via UrlProperty with the marker stripped", () => {
        renderProps({ source: "url:https://host/page" });
        expect(screen.getByTestId("url").getAttribute("data-url")).toBe("https://host/page");
    });

    it("keeps datetime: handling separate from the media parser", () => {
        renderProps({ seen: "datetime:2026-06-01T05:00:00Z" });
        expect(screen.getByTestId("datetime").getAttribute("data-iso")).toBe("2026-06-01T05:00:00Z");
    });
});

describe("DynamicPropertiesRender — shares the canonical parser", () => {
    // These inputs are only handled because the panel now delegates to
    // parseTaggedMediaValue; the previous startsWith/slice logic missed them.
    it("tolerates an uppercase marker", () => {
        renderProps({ feed: "VIDEO:https://host/live" });
        expect(screen.getByTestId("video").getAttribute("data-href")).toBe("https://host/live");
    });

    it("tolerates leading whitespace", () => {
        renderProps({ feed: "  video:https://host/live" });
        expect(screen.getByTestId("video").getAttribute("data-href")).toBe("https://host/live");
    });

    it("normalizes a repeated identical marker", () => {
        renderProps({ feed: "video:video:https://host/live" });
        expect(screen.getByTestId("video").getAttribute("data-href")).toBe("https://host/live");
    });
});

describe("DynamicPropertiesRender — contradictory markers", () => {
    it.each([
        "video:image:https://host/x",
        "image:video:https://host/x",
    ])("does not dispatch a media component for %s", (value) => {
        renderProps({ feed: value });
        expect(screen.queryByTestId("video")).toBeNull();
        expect(screen.queryByTestId("image")).toBeNull();
        expect(screen.queryByTestId("url")).toBeNull();
    });

    it("renders an explicit invalid-source state naming the conflict", () => {
        renderProps({ feed: "video:image:https://host/x" });
        const el = screen.getByTestId("malformed-media-property");
        expect(el.textContent).toContain("Invalid source");
        expect(el.textContent).toContain("video");
        expect(el.textContent).toContain("image");
    });

    it("preserves the raw value for provenance without rendering it as a source", () => {
        renderProps({ feed: "video:image:https://host/x" });
        expect(screen.getByTestId("malformed-media-property").getAttribute("title"))
            .toBe("video:image:https://host/x");
    });

    it("renders no network-consuming element for a contradictory value", () => {
        const { container } = renderProps({ feed: "video:image:https://host/x" });
        expect(container.querySelectorAll("img, iframe, video, a[href]").length).toBe(0);
    });
});

describe("DynamicPropertiesRender — untagged values keep their heuristics", () => {
    it("still treats a bare https URL as a link", () => {
        renderProps({ source: "https://host/page" });
        expect(screen.getByTestId("url").getAttribute("data-url")).toBe("https://host/page");
    });

    it("still routes an image-named property to ImageProperty", () => {
        renderProps({ image_url: "https://host/pic.png" });
        expect(screen.getByTestId("image").getAttribute("data-url")).toBe("https://host/pic.png");
    });

    it("does not treat a marker later in the path as a tag", () => {
        renderProps({ source: "https://host/video:clip" });
        expect(screen.getByTestId("url").getAttribute("data-url")).toBe("https://host/video:clip");
    });
});
