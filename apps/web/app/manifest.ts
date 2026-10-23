import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Family Fund App",
    short_name: "Family Fund",
    description:
      "Household finance with individual privacy. Local development.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#244f42",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
