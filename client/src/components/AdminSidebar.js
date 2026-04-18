import React from "react";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  PlusCircle,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";

const sections = [
  {
    label: "General",
    items: [
      { key: "overview",   label: "Overview",        icon: LayoutDashboard },
      { key: "analytics",  label: "Sales Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Management",
    items: [
      { key: "staff",    label: "Manage Staff",    icon: Users },
      { key: "dish",     label: "Add Dish",         icon: PlusCircle },
      { key: "requests", label: "Requests",         icon: ClipboardList, badgeKey: "requests" },
      { key: "users",    label: "Users & Coupons",  icon: Sparkles },
    ],
  },
];

export default function AdminSidebar({ active, setActive, badges = {} }) {
  return (
    <aside className="sd-sidebar">
      {/* ── Brand ── */}
      <div className="sd-sidebar__brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', height: '36px', width: '36px', flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: '#f97316', color: 'white' }}>
          <UtensilsCrossed size={18} />
        </div>
        <div>
          <div className="sd-sidebar__brand-title" style={{ fontSize: '1.15rem', fontWeight: 'bold', letterSpacing: '-0.025em' }}>
            Smart<span>Dine</span>
          </div>
          <p className="sd-sidebar__brand-sub">Admin Portal</p>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="sd-sidebar__nav">
        {sections.map((section) => (
          <div key={section.label} className="sd-sidebar__section">
            <div className="sd-sidebar__section-label">{section.label}</div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const badgeValue = item.badgeKey ? badges[item.badgeKey] : null;
              return (
                <button
                  key={item.key}
                  className={`sd-sidebar__item${active === item.key ? " active" : ""}`}
                  onClick={() => setActive(item.key)}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  {badgeValue ? (
                    <span className="sd-sidebar__badge">{badgeValue}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Footer / Profile ── */}
      <div className="sd-sidebar__footer">
        <div className="sd-sidebar__profile">
          <div className="sd-sidebar__avatar">SA</div>
          <div>
            <div className="sd-sidebar__profile-name">SmartDine</div>
            <div className="sd-sidebar__profile-role">Administrator</div>
          </div>
          <div className="sd-sidebar__profile-dot" />
        </div>
      </div>
    </aside>
  );
}
