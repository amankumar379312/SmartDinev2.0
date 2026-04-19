import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../api";
import { clearSession, getLoginPathForRoleScope } from "../utils/authSession";
import { getAfterOrderStorageKey } from "../utils/workflowSession";
import { resolveSocketBaseUrl } from "../utils/runtimeConfig";
import "../styles/thankyou.css";
import {
  UtensilsCrossed,
  Star,
  CheckCircle2,
  Loader2,
  Heart,
  MessageSquare,
  LogOut,
} from "lucide-react";

const socket = io(resolveSocketBaseUrl(), { transports: ["websocket"] });

function Stars({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="ty-stars-row" role="radiogroup" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={`ty-star-btn ${(hovered || value) >= n ? "ty-star-btn--active" : ""}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
        >
          <Star
            size={32}
            fill={(hovered || value) >= n ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export default function ThankYou() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processedRef = useRef(false);

  const [ratings, setRatings] = useState({
    foodQuality: 0,
    ambience: 0,
    overall: 0,
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [paymentFinalizing, setPaymentFinalizing] = useState(false);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const orderIds = String(searchParams.get("orderIds") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const tableId = searchParams.get("tableId") || localStorage.getItem("tableId") || "";

    if (!sessionId || orderIds.length === 0 || processedRef.current) {
      return;
    }

    processedRef.current = true;
    setPaymentFinalizing(true);

    (async () => {
      try {
        const { data: session } = await API.get(`/payment/checkout-session/${sessionId}`);
        if (session?.payment_status !== "paid") {
          throw new Error("Payment was not completed successfully.");
        }

        await API.post("/orders/markPaid/bulk", { orderIds });

        localStorage.removeItem(getAfterOrderStorageKey(tableId));

        socket.emit("table:paid", {
          tableId: tableId || "-",
          orderId: orderIds[orderIds.length - 1] || null,
          total: Number(session?.amount_total || 0) / 100,
        });

        await API.delete("/workflow/current").catch(() => {});
      } catch (error) {
        console.error("Failed to finalize payment on thank-you page", error);
        setMsg(error?.response?.data?.msg || error?.message || "Payment was received, but finalizing the order failed.");
      } finally {
        setPaymentFinalizing(false);
      }
    })();
  }, [searchParams]);

  useEffect(() => {
    API.delete("/workflow/current").catch((error) => {
      console.error("Failed to close workflow on thank-you", error);
    });
  }, []);

  const setRating = (key, val) => setRatings((r) => ({ ...r, [key]: val }));

  const logoutAndGoLogin = () => {
    const loginPath = getLoginPathForRoleScope("user");
    clearSession();
    navigate(loginPath, { replace: true });
    window.location.replace(loginPath);
  };

  const onSkip = () => logoutAndGoLogin();

  const onSubmit = async () => {
    const { foodQuality, ambience, overall } = ratings;
    if (!foodQuality || !ambience || !overall) {
      setMsg("Please rate all questions before submitting.");
      return;
    }
    try {
      setSubmitting(true);
      const res = await API.post("/feedbacks", {
        ratings,
        comment: comment.trim() || undefined,
      });
      if (!res?.data?.ok) throw new Error("Failed to save feedback");
      logoutAndGoLogin();
    } catch (e) {
      setMsg(e.message || "Could not save feedback.");
      setSubmitting(false);
    }
  };

  const ratingQuestions = [
    { key: "foodQuality", label: "Food Quality", icon: "🍽️" },
    { key: "ambience", label: "Ambience", icon: "✨" },
    { key: "overall", label: "Overall Experience", icon: "🌟" },
  ];

  return (
    <main className="ty-page-shell">
      {/* Ambient blobs */}
      <div className="ty-blob ty-blob-1" />
      <div className="ty-blob ty-blob-2" />
      <div className="ty-blob ty-blob-3" />

      <div className="ty-card-outer">

        {/* ── Brand Header ── */}
        <header className="ty-brand-header">
          <div className="ty-brand-logo">
            <div className="ty-logo-icon-wrap">
              <UtensilsCrossed size={22} className="ty-logo-icon" />
            </div>
            <span className="ty-logo-text">SmartDine</span>
          </div>
        </header>

        {/* ── Main Card ── */}
        <div className="ty-main-card">

          {/* Success indicator */}
          <div className="ty-success-ring">
            <div className="ty-success-ring-inner">
              <CheckCircle2 size={36} className="ty-success-icon" />
            </div>
            <div className="ty-success-pulse" />
          </div>

          <h1 className="ty-title">Thank You!</h1>
          <p className="ty-subtitle">
            Your payment was successful. We hope you enjoyed your meal!
          </p>

          {paymentFinalizing && (
            <div className="ty-finalizing-bar">
              <Loader2 size={14} className="ty-spin" />
              <span>Finalizing payment &amp; updating table status…</span>
            </div>
          )}

          {/* Divider */}
          <div className="ty-divider-labeled">
            <div className="ty-divider-line" />
            <span className="ty-divider-label">
              <Heart size={12} />
              Share your experience
            </span>
            <div className="ty-divider-line" />
          </div>

          {/* Rating questions */}
          <div className="ty-ratings-grid">
            {ratingQuestions.map(({ key, label, icon }) => (
              <div key={key} className="ty-rating-card">
                <div className="ty-rating-card-header">
                  <span className="ty-rating-emoji">{icon}</span>
                  <h2 className="ty-rating-label">{label}</h2>
                  {ratings[key] > 0 && (
                    <span className="ty-rating-text-badge">
                      {RATING_LABELS[ratings[key]]}
                    </span>
                  )}
                </div>
                <Stars value={ratings[key]} onChange={(v) => setRating(key, v)} />
              </div>
            ))}
          </div>

          {/* Comment */}
          <div className="ty-comment-section">
            <label htmlFor="ty-comment" className="ty-comment-label">
              <MessageSquare size={14} />
              Any additional comments? <span className="ty-optional">(optional)</span>
            </label>
            <textarea
              id="ty-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your thoughts about your dining experience..."
              rows={3}
              className="ty-comment-textarea"
            />
          </div>

          {/* Error message */}
          {msg && (
            <div className="ty-error-bar">
              {msg}
            </div>
          )}

          {/* Actions */}
          <div className="ty-actions-row">
            <button
              className="ty-skip-btn"
              onClick={onSkip}
              disabled={submitting || paymentFinalizing}
              id="ty-skip-btn"
            >
              <LogOut size={16} />
              Skip &amp; Exit
            </button>
            <button
              className="ty-submit-btn"
              onClick={onSubmit}
              disabled={submitting || paymentFinalizing}
              id="ty-submit-btn"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="ty-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Submit Feedback
                </>
              )}
            </button>
          </div>

          {/* Footer */}
          <p className="ty-footer-note">
            Your feedback helps us serve you better. Thank you for dining with us! 🙏
          </p>
        </div>
      </div>
    </main>
  );
}
