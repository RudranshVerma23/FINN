import type { MetadataRoute } from "next";

// Installable to the home screen (FR-26).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FINN — Financial Investment Agent",
    short_name: "FINN",
    description: "What changed, why it matters, and who you know who can explain it.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ee",
    theme_color: "#f5f3ee",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
