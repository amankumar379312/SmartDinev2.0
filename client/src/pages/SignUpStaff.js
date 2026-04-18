import React, { useState } from "react";
import API from "../api";

import { useNavigate, Link } from "react-router-dom";

export default function SignUpStaff() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    role: "cook", // cook | waiter
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return alert("Passwords do not match");
    }
    if (form.password.length < 6) {
      return alert("Password must be at least 6 characters");
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        role: form.role, // "cook" or "waiter"
        password: form.password,
      };
      await API.post("/auth/staff-signup", payload);
      alert("Staff account created. You can log in now.");
      navigate("/login-cw");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to create staff");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="background">
      <div id="container">
        <h2>Create Staff Account</h2>
        <p>For kitchen and floor team (Cook / Waiter).</p>

        <form onSubmit={onSubmit}>
          <label htmlFor="name">Full Name</label>
          <div className="input-group">
            <input
              id="name"
              name="name"
              placeholder="Sam Worker"
              value={form.name}
              onChange={onChange}
              required
            />
            <span className="icon">🧑‍🍳</span>
          </div>

          <label htmlFor="phone">Phone Number</label>
          <div className="input-group">
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+91 95555 55555"
              value={form.phone}
              onChange={onChange}
              required
            />
            <span className="icon">📞</span>
          </div>

          <label htmlFor="email">Email (optional)</label>
          <div className="input-group">
            <input
              id="email"
              name="email"
              type="email"
              placeholder="sam@smartdine.com"
              value={form.email}
              onChange={onChange}
            />
            <span className="icon">📧</span>
          </div>

          <label htmlFor="role">Role</label>
          <div className="input-group">
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={onChange}
              required
            >
              <option value="cook">Cook</option>
              <option value="waiter">Waiter</option>
            </select>
            <span className="icon">🛠️</span>
          </div>

          <label htmlFor="password">Password</label>
          <div className="input-group">
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Create a password"
              value={form.password}
              onChange={onChange}
              required
            />
            <span className="icon">🔒</span>
          </div>

          <label htmlFor="confirmPassword">Confirm Password</label>
          <div className="input-group">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Re-enter password"
              value={form.confirmPassword}
              onChange={onChange}
              required
            />
            <span className="icon">✅</span>
          </div>

          <button id="loginbtn" type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Staff"}
          </button>

          <div className="signup">
            Already staff? <Link to="/login-cw">Log in</Link> • User?{" "}
            <Link to="/signup">Sign up</Link> • Admin?{" "}
            <Link to="/signup-admin">Create admin</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
