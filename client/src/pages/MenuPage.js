import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";

function groupMenuItems(items) {
  return items.reduce((acc, item) => {
    const category = String(item.category || "others").trim().toLowerCase();
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});
}

function formatCategoryName(category) {
  return category
    .replace(/maincourse/gi, "main course")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function MenuPage() {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let res;
        try {
          res = await API.get("/menu/items");
        } catch {
          res = await API.get("/menu");
        }
        const items = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
        setMenuItems(items);
      } catch (error) {
        console.error("Failed to fetch menu", error);
        setMenuItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groupedMenu = useMemo(() => groupMenuItems(menuItems), [menuItems]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.24),_transparent_40%),linear-gradient(135deg,#020617,#111827)]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-orange-400">SmartDine Menu</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Browse before you book.</h1>
              <p className="mt-4 max-w-2xl text-slate-300">
                Explore the current menu, then continue to login or sign up when you are ready to place an order.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/login")}
                className="rounded-xl border border-white/15 bg-white px-5 py-3 font-semibold text-slate-900 transition hover:bg-orange-50"
              >
                Log In
              </button>
              <button
                onClick={() => navigate("/signup")}
                className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-400"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-12 w-12 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
          </div>
        ) : Object.keys(groupedMenu).length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-10 text-center text-slate-400">
            Menu is not available right now.
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedMenu).map(([category, items]) => (
              <section key={category}>
                <div className="mb-5 flex items-center gap-4">
                  <h2 className="text-2xl font-bold text-orange-300">{formatCategoryName(category)}</h2>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {items.map((item) => (
                    <article key={item._id || `${category}-${item.name}`} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">{item.name}</h3>
                          <p className="mt-2 text-sm text-slate-400">{item.description || "Chef special from SmartDine."}</p>
                        </div>
                        <div className="rounded-xl bg-orange-500/15 px-3 py-2 text-sm font-bold text-orange-300">
                          Rs {Number(item.price) || 0}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
