import type { MetadataRoute } from "next";

// Installable to the home screen (FR-26). PNGs for Android/iOS, a maskable icon for adaptive launchers.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FINN — Financial Investment Agent",
    short_name: "FINN",
    description: "What changed, why it matters, and who you know who can explain it.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f3ee",
    theme_color: "#f5f3ee",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Brief", url: "/" },
      { name: "Research", url: "/research" },
      { name: "Alerts", url: "/alerts" },
    ],
  };
}
