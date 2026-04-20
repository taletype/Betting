"use client";

import { useState } from "react";
import { createOrder } from "../../../lib/api";
import { formatPrice, formatQuantity, formatUsdc } from "../../../lib/format";

interface OrderTicketProps {
  marketId: string;
  outcomes: Array<{ id: string; title: string }>;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

export function OrderTicket({ marketId, outcomes }: OrderTicketProps) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [outcomeId, setOutcomeId] = useState(outcomes[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [shares, setShares] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Convert price from decimal (e.g., 0.75) to ticks (e.g., 7500)
  // Assuming 4 decimal places for price ticks
  const priceToTicks = (decimalPrice: string): string => {
    const num = parseFloat(decimalPrice);
    if (isNaN(num)) return "0";
    return Math.floor(num * 10000).toString();
  };

  // Convert shares to atoms (assuming 1:1 for simplicity)
  const sharesToAtoms = (sharesStr: string): string => {
    const num = parseInt(sharesStr, 10);
    if (isNaN(num)) return "0";
    return num.toString();
  };

  // Calculate total cost in USDC
  const totalCost = (): string => {
    const priceNum = parseFloat(price);
    const sharesNum = parseInt(shares, 10);
    if (isNaN(priceNum) || isNaN(sharesNum)) return "0";
    const cost = priceNum * sharesNum;
    return cost.toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!price || !shares) return;

    setSubmitState("submitting");
    setError(null);

    try {
      await createOrder({
        marketId,
        outcomeId,
        side,
        orderType: "limit",
        price: priceToTicks(price),
        quantity: sharesToAtoms(shares),
      });
      setSubmitState("success");
      // Reset form after successful submission
      setPrice("");
      setShares("");
      setTimeout(() => setSubmitState("idle"), 3000);
    } catch (err) {
      setSubmitState("error");
      setError(err instanceof Error ? err.message : "Failed to submit order");
      setTimeout(() => setSubmitState("idle"), 5000);
    }
  };

  const isDisabled = submitState !== "idle" || !price || !shares;

  return (
    <section className="panel stack">
      <strong>Place Order</strong>
      
      {submitState === "success" && (
        <div className="banner banner-success">Order submitted successfully!</div>
      )}
      
      {submitState === "error" && error && (
        <div className="error-state">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="stack">
        <div className="grid">
          <label className="stack">
            Side
            <select 
              value={side} 
              onChange={(e) => setSide(e.target.value as "buy" | "sell")}
              disabled={submitState !== "idle"}
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label className="stack">
            Outcome
            <select
              value={outcomeId}
              onChange={(e) => setOutcomeId(e.target.value)}
              disabled={submitState !== "idle"}
            >
              {outcomes.map((outcome) => (
                <option key={outcome.id} value={outcome.id}>
                  {outcome.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid">
          <label className="stack">
            Price
            <input
              type="number"
              step="0.0001"
              min="0"
              max="1"
              placeholder="0.75"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={submitState !== "idle"}
              required
            />
          </label>
          <label className="stack">
            Shares
            <input
              type="number"
              step="1"
              min="1"
              placeholder="100"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              disabled={submitState !== "idle"}
              required
            />
          </label>
        </div>

        <div className="kv">
          <span className="kv-key">Total cost</span>
          <span className="kv-value">${totalCost()} USDC</span>
        </div>

        <button type="submit" disabled={isDisabled}>
          {submitState === "submitting" ? "Submitting..." : `Place ${side.charAt(0).toUpperCase() + side.slice(1)} Order`}
        </button>
      </form>
    </section>
  );
}
