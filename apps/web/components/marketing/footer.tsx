import React from "react";
import { marketingCopy } from "./content";

export function MarketingFooter(): React.ReactElement {
  const { footerLinks } = marketingCopy;
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <div className="marketing-footer-top">
          <div className="marketing-footer-brand">
            <h2>The Family Fund</h2>
            <p>
              Household finance with individual privacy. Collaborative planning
              without commercial telemetry.
            </p>
          </div>

          <div className="marketing-footer-navs">
            <div className="marketing-footer-group">
              <h3>Security & Access</h3>
              <ul>
                <li>
                  <a href={footerLinks.security}>Account Security & MFA</a>
                </li>
                <li>
                  <a href="/sign-in">Web Sign In</a>
                </li>
                <li>
                  <a href="/recovery">Emergency Recovery</a>
                </li>
              </ul>
            </div>

            <div className="marketing-footer-group">
              <h3>Privacy & Rights</h3>
              <ul>
                <li>
                  <a href={footerLinks.privacy}>Privacy Controls</a>
                </li>
                <li>
                  <a href={footerLinks.archive}>Download Data Archive</a>
                </li>
                <li>
                  <a href={footerLinks.deletion}>Statutory Deletion</a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="marketing-footer-bottom">
          <p>© 2026 The Family Fund Ltd. All rights reserved.</p>
          <p>Registered in England and Wales. Hosted in the United Kingdom.</p>
        </div>
      </div>
    </footer>
  );
}
