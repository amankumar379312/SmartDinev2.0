// src/email.js
import emailjs from "@emailjs/browser";

// 🔐 Replace these with your real IDs from EmailJS dashboard
const SERVICE_ID = "service_r0ir7khz";
const TEMPLATE_ID = "template_qi26bhf";
const PUBLIC_KEY = "XTAQOPf8B4h-O35GY";

export async function sendCouponEmail(user, coupon) {
  if (!user?.email) return;

  const discountText =
    coupon.discountType === "percent"
      ? `${coupon.discountValue}% OFF`
      : `₹${coupon.discountValue} OFF`;

  const templateParams = {
    // must match EmailJS variables
    to_email: user.email,
    user_name: user.name || "SmartDine Guest",

    coupon_title: coupon.title,
    coupon_code: coupon.code,
    discount_text: discountText,
    min_order_value: coupon.minOrderValue
      ? `₹${coupon.minOrderValue}`
      : "No minimum order",
    expires_at: coupon.expiresAt || "No expiry date",
    custom_message: coupon.message,

    // only if you used {{reply_to}} in template
    reply_to: user.email,
  };

  return emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, {
    publicKey: PUBLIC_KEY,
  });
}
