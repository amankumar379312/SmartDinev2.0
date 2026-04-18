import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { clearSession } from "../utils/authSession";
function Stars({ value, onChange }) {
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className={`text-3xl sm:text-4xl transition-all duration-300 hover:scale-110 focus:outline-none ${
            value >= n ? "text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.6)]" : "text-slate-600 hover:text-slate-500"
          }`}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function ThankYou() {
  const navigate = useNavigate();

  const [ratings, setRatings] = useState({
    foodQuality: 0,
    ambience: 0,
    overall: 0,
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    API.delete("/workflow/current").catch((error) => {
      console.error("Failed to close workflow on thank-you", error);
    });
  }, []);

  const setRating = (key, val) => setRatings((r) => ({ ...r, [key]: val }));

  const logoutAndGoLogin = () => {
    clearSession();
    navigate("/login", { replace: true });
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

  return (
    <main className="min-h-screen bg-[#020617] flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-orange-500 selection:text-white relative">
      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-[#020617] to-[#020617]" />
      </div>

      <div className="relative z-10 w-full max-w-xl bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10">
        <header className="text-center mb-10">
          <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.15)]">
            <span className="text-3xl">🍽️</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">Thank You!</h1>
          <p className="text-sm font-medium text-slate-400">We value your feedback to improve our service.</p>
        </header>

        <section className="space-y-8 mb-8">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-3">Food Quality</h2>
            <Stars value={ratings.foodQuality} onChange={(v) => setRating("foodQuality", v)} />
          </div>

          <div className="flex flex-col items-center text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-3">Ambience</h2>
            <Stars value={ratings.ambience} onChange={(v) => setRating("ambience", v)} />
          </div>

          <div className="flex flex-col items-center text-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-3">Overall Experience</h2>
            <Stars value={ratings.overall} onChange={(v) => setRating("overall", v)} />
          </div>
        </section>

        <section className="mb-8">
          <label htmlFor="ty-comment" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 ml-1">
            Any comments? (optional)
          </label>
          <textarea
            id="ty-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all resize-none shadow-inner"
          />
        </section>

        {msg && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold text-center">
            {msg}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
          <button 
            className="w-full sm:w-1/3 py-3.5 rounded-xl text-slate-400 font-bold hover:text-white hover:bg-white/5 transition-all outline-none"
            onClick={onSkip} 
            disabled={submitting}
          >
            Skip
          </button>
          <button 
            className="w-full sm:w-2/3 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 outline-none"
            onClick={onSubmit} 
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit Feedback"}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-xs font-medium text-slate-500 tracking-wide">Your feedback helps us serve you better ❤️</p>
        </div>
      </div>
    </main>
  );
}
