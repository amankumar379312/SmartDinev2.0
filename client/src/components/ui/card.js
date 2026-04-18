import React from "react";

export function Card({ children, className = "" }) {
  return (
    <div
      className={`sd-card-base ${className}`}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        transition: "border-color 0.2s, background 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className = "" }) {
  return (
    <div
      className={className}
      style={{ padding: "20px" }}
    >
      {children}
    </div>
  );
}
