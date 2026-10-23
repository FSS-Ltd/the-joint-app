import Image from "next/image";
import type { ReactNode } from "react";
import "./brand.css";

export function Brand(): ReactNode {
  return (
    <a className="brand" href="/" aria-label="The Family Fund App home">
      <Image
        className="brand-logo"
        src="/brand/family-fund-forest.png"
        alt="The Family Fund App"
        width={2172}
        height={724}
        priority
      />
    </a>
  );
}
