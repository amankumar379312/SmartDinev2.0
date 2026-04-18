function firstValidHttpUrl(values, fallback = "") {
  const match = values.find((value) => /^https?:\/\//i.test(String(value || "").trim()));
  return match || fallback;
}

export function resolveApiBaseUrl() {
  return firstValidHttpUrl(
    [
      process.env.REACT_APP_API_URL,
      process.env.VITE_API_URL,
      process.env.REACT_APP_BASE_URL,
    ],
    "http://localhost:5000/api"
  );
}

export function resolveSocketBaseUrl() {
  return firstValidHttpUrl(
    [
      process.env.REACT_APP_API_WS,
      process.env.VITE_API_WS,
      process.env.REACT_APP_API_BASE,
      process.env.VITE_API_BASE,
      process.env.REACT_APP_SOCKET_URL,
    ],
    "http://localhost:5000"
  );
}
