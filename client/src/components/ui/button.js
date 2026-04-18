import React from "react";

const variants = {
  default:
    "sd-btn sd-btn--primary",
  outline:
    "sd-btn sd-btn--outline",
  ghost:
    "sd-btn sd-btn--ghost",
  success:
    "sd-btn sd-btn--success",
  danger:
    "sd-btn sd-btn--danger",
};

const sizes = {
  sm:      "sd-btn--sm",
  default: "sd-btn--md",
  lg:      "sd-btn--lg",
  icon:    "sd-btn--icon",
};

export function Button({
  children,
  type = "button",
  onClick,
  className = "",
  disabled,
  variant = "default",
  size = "default",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${variants[variant] || variants.default} ${sizes[size] || sizes.default} ${className}`}
    >
      {children}
    </button>
  );
}
