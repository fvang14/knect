import { render, screen } from "@testing-library/react";

describe("LockedMapPreview", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("renders Mapbox Static Image when token is present", () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-mapbox-token";
    // Require dynamically so that module evaluation picks up the mocked process.env
    const { LockedMapPreview } = require("../components/map/locked-map-preview");
    render(<LockedMapPreview />);

    const img = screen.getByTestId("locked-map-image");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/");
    expect(img.getAttribute("src")).toContain("access_token=test-mapbox-token");
    expect(screen.queryByTestId("locked-map-fallback")).not.toBeInTheDocument();

    // Verify overlay text and pins
    expect(screen.getByText(/Sign in to view live map/)).toBeInTheDocument();
    expect(screen.getByTestId("locked-map-pin-0")).toBeInTheDocument();
  });

  test("renders fallback SVG when token is missing", () => {
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const { LockedMapPreview } = require("../components/map/locked-map-preview");
    render(<LockedMapPreview />);

    expect(screen.getByTestId("locked-map-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("locked-map-image")).not.toBeInTheDocument();

    // Verify overlay text and pins
    expect(screen.getByText(/Sign in to view live map/)).toBeInTheDocument();
    expect(screen.getByTestId("locked-map-pin-0")).toBeInTheDocument();
  });
});
