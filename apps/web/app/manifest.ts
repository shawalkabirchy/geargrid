import type { MetadataRoute } from "next";

// What a phone needs to install the dashboard (DokaanBondhu spec D243): "Add to Home screen" gives a GearGrid icon
// that opens full screen at Home. Over HTTPS this is enough; there is no service worker, since there is no offline.

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GearGrid",
    short_name: "GearGrid",
    description: "গাড়ির পার্টসের দোকানের হিসাব: বিক্রি, কেনা, বাকি, স্টক আর টাকা",
    lang: "bn",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e2556",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
