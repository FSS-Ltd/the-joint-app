import React from "react";
import "./cutover-banner.css";
import { CUTOVER_LINKS } from "./presentation";

export interface CutoverNoticeBannerProps {
  routeName: string;
}

export function CutoverNoticeBanner({
  routeName,
}: CutoverNoticeBannerProps): React.ReactElement {
  return (
    <aside
      className="cutover-banner"
      role="region"
      aria-label="Native Mobile Transition Notice"
    >
      <div className="cutover-banner-inner">
        <span className="cutover-banner-badge">Mobile Transition</span>
        <p className="cutover-banner-text">
          Household financial management has moved to our native iOS app. The{" "}
          {routeName} workspace is retained as a migration reference.
        </p>
        <div className="cutover-banner-actions">
          <a
            href={CUTOVER_LINKS.appStore}
            className="cutover-banner-btn cutover-banner-btn--primary"
          >
            Get the iOS App
          </a>
          <a href="/cutover" className="cutover-banner-btn">
            View Cutover Details
          </a>
        </div>
      </div>
    </aside>
  );
}
