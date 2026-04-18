import React, { useState } from "react";
import API from "../api";

import { useNavigate, Link } from "react-router-dom";

export default function SignUpAdmin() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
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
        password: form.password,
      };
      // ✅ use the new admin route
      await API.post("/admin/signup", payload);
      alert("Admin account created. You can log in now.");
      navigate("/login-admin");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to create admin");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="background">
      <div id="container">
        <h2>Create Admin Account</h2>
        <p>Set up an admin to manage your restaurant.</p>

        <form onSubmit={onSubmit}>
          <label htmlFor="name">Full Name</label>
          <div className="input-group">
            <input
              id="name"
              name="name"
              placeholder="Alex Manager"
              value={form.name}
              onChange={onChange}
              required
            />
            <span className="icon">🧑‍💼</span>
          </div>

          <label htmlFor="phone">Phone Number</label>
          <div className="input-group">
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+91 90000 00000"
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
              placeholder="admin@smartdine.com"
              value={form.email}
              onChange={onChange}
            />
            <span className="icon">📧</span>
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
            {submitting ? "Creating..." : "Create Admin"}
          </button>

          <div className="signup">
            Already an admin? <Link to="/login-admin">Log in</Link> • Staff?{" "}
            <Link to="/signup-staff">Create staff</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
