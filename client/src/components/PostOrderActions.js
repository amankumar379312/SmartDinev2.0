// src/components/PostOrderActions.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { resolveSocketBaseUrl } from "../utils/runtimeConfig";

// If you already create the socket globally, reuse that instead.
const socket = io(resolveSocketBaseUrl(), {
  transports: ["websocket"],
});

export default function PostOrderActions({ tableId }) {
  const navigate = useNavigate();

  const handleDone = () => {
    // Go to a simple “Thanks / feedback” page or table status page
    navigate("/thank-you"); 
  };

  const handleOrderMore = () => {
    // Send them back to the menu / ordering flow
    navigate("/menu");
  };

  const callWaiter = () => {
    socket.emit("callWaiter", { tableId });
    // Optional: tiny confirmation UI
    alert("A waiter has been notified. They'll be with you shortly.");
  };

  return (
    <div className="poa-wrap">
      <div className="poa-card">
        <h1>What would you like to do next?</h1>
        <p>Your order has been placed successfully.</p>

        <div className="poa-actions">
          <button className="poa-btn poa-secondary" onClick={handleOrderMore}>
            Order More
          </button>
          <button className="poa-btn poa-primary" onClick={handleDone}>
            Done with Eating
          </button>
        </div>
      </div>

      {/* Floating “Call Waiter” button */}
      <button
        className="poa-fab"
        aria-label="Call waiter"
        title="Call waiter"
        onClick={callWaiter}
      >
        🛎️ Call Waiter
      </button>
    </div>
  );
}
