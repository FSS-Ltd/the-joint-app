"use client";

import React, { useState } from "react";

type Perspective = "combined" | "alex" | "taylor";

interface TransactionRow {
  id: string;
  merchant: string;
  date: string;
  category: string;
  amountMinor: number;
  sharedPct: number;
  visibility: "shared" | "alex_only" | "taylor_only";
}

const SAMPLE_DATA: TransactionRow[] = [
  {
    id: "tx-1",
    merchant: "Apartment Rent & Utilities",
    date: "1 Nov",
    category: "Home & Utilities",
    amountMinor: 145000,
    sharedPct: 50,
    visibility: "shared",
  },
  {
    id: "tx-2",
    merchant: "Supermarket & Market Stall",
    date: "3 Nov",
    category: "Groceries",
    amountMinor: 13420,
    sharedPct: 50,
    visibility: "shared",
  },
  {
    id: "tx-3",
    merchant: "Bookshop & Tech Hardware",
    date: "4 Nov",
    category: "Discretionary (Alex)",
    amountMinor: 4850,
    sharedPct: 0,
    visibility: "alex_only",
  },
  {
    id: "tx-4",
    merchant: "Boutique Fitness Studio",
    date: "5 Nov",
    category: "Discretionary (Taylor)",
    amountMinor: 3800,
    sharedPct: 0,
    visibility: "taylor_only",
  },
];

function formatGbp(minor: number): string {
  return "£" + (minor / 100).toFixed(2);
}

export function InteractivePreview(): React.ReactElement {
  const [view, setView] = useState<Perspective>("combined");

  return (
    <div
      className="preview-container"
      aria-label="Interactive Household Ledger"
    >
      <div className="preview-card">
        <div className="preview-header">
          <div className="preview-status">
            <span className="preview-radar-pulse" aria-hidden="true" />
            <span className="preview-status-text">
              Dual-Adult Privacy Shield Active
            </span>
          </div>
          <span className="preview-tag">Interactive Simulation</span>
        </div>

        <div className="preview-intro">
          <h2 className="preview-title">
            Test the household privacy boundary in action
          </h2>
          <p className="preview-subtitle">
            Toggle between partner perspectives to observe how shared
            obligations stay transparent while personal discretionary items
            remain protected.
          </p>
        </div>

        <div
          className="preview-tabs"
          role="tablist"
          aria-label="Partner perspective switcher"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "combined"}
            className={`preview-tab ${view === "combined" ? "preview-tab--active" : ""}`}
            onClick={() => setView("combined")}
          >
            Combined View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "alex"}
            className={`preview-tab ${view === "alex" ? "preview-tab--active" : ""}`}
            onClick={() => setView("alex")}
          >
            Alex&#39;s View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "taylor"}
            className={`preview-tab ${view === "taylor" ? "preview-tab--active" : ""}`}
            onClick={() => setView("taylor")}
          >
            Taylor&#39;s View
          </button>
        </div>

        <div className="preview-metrics-grid">
          <div className="preview-metric">
            <span className="preview-metric-label">Shared Obligations</span>
            <span className="preview-metric-value">
              {formatGbp(145000 + 13420)}
            </span>
            <span className="preview-metric-sub">50/50 mutual split</span>
          </div>
          <div className="preview-metric">
            <span className="preview-metric-label">
              {view === "alex"
                ? "Alex Discretionary"
                : view === "taylor"
                  ? "Taylor Discretionary"
                  : "Protected Discretionary"}
            </span>
            <span className="preview-metric-value">
              {view === "alex"
                ? formatGbp(4850)
                : view === "taylor"
                  ? formatGbp(3800)
                  : "Shielded"}
            </span>
            <span className="preview-metric-sub">
              {view === "combined"
                ? "Items visible only to owner"
                : "Private to your account"}
            </span>
          </div>
          <div className="preview-metric">
            <span className="preview-metric-label">Emergency Buffer</span>
            <span className="preview-metric-value">£4,800.00</span>
            <span className="preview-metric-sub">Consensus reserve</span>
          </div>
        </div>

        <div className="preview-ledger">
          <div className="preview-ledger-header">
            <span>Transaction</span>
            <span>Date</span>
            <span>Category</span>
            <span style={{ textAlign: "right" }}>Amount</span>
          </div>

          <div className="preview-ledger-rows">
            {SAMPLE_DATA.map((item) => {
              const isMaskedForUser =
                (view === "alex" && item.visibility === "taylor_only") ||
                (view === "taylor" && item.visibility === "alex_only");

              const isPrivateOwner =
                (view === "alex" && item.visibility === "alex_only") ||
                (view === "taylor" && item.visibility === "taylor_only");

              return (
                <div key={item.id} className="preview-row">
                  <div className="preview-row-merchant">
                    <span className="preview-row-icon" aria-hidden="true">
                      {item.visibility === "shared" ? "👥" : "🔒"}
                    </span>
                    <div>
                      <div className="preview-row-title">
                        {isMaskedForUser
                          ? "Confidential Discretionary"
                          : item.merchant}
                      </div>
                      <div className="preview-row-note">
                        {item.visibility === "shared"
                          ? "Shared 50/50"
                          : isPrivateOwner
                            ? "Your private record"
                            : "Protected by partner privacy"}
                      </div>
                    </div>
                  </div>

                  <div className="preview-row-date">{item.date}</div>

                  <div className="preview-row-category">
                    <span
                      className={`preview-badge ${
                        item.visibility === "shared"
                          ? "preview-badge--shared"
                          : "preview-badge--private"
                      }`}
                    >
                      {isMaskedForUser ? "Partner Private" : item.category}
                    </span>
                  </div>

                  <div className="preview-row-amount">
                    {isMaskedForUser ? (
                      <span className="preview-masked-text">Confidential</span>
                    ) : (
                      formatGbp(item.amountMinor)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="preview-footer-note">
          <p>
            Zero financial data is shared with advertisers or third parties. All
            discretionary classifications remain encrypted on local device
            hardware.
          </p>
        </div>
      </div>
    </div>
  );
}
