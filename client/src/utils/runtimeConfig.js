function firstValidHttpUrl(values, fallback = "") {
  const match = values.find((value) => /^https?:\/\//i.test(String(value || "").trim()));
  return match || fallback;
}

function stripTrailingSlash(value = "") {
  return String(value).replace(/\/+$/, "");
}

function stripApiSuffix(value = "") {
  return stripTrailingSlash(String(value).replace(/\/api\/?$/i, ""));
}

export function resolveApiBaseUrl() {
  const explicitApiUrl = firstValidHttpUrl(
    [
      process.env.REACT_APP_API_URL,
      process.env.VITE_API_URL,
      process.env.REACT_APP_BASE_URL,
    ],
    ""
  );

  if (explicitApiUrl) {
    return stripTrailingSlash(explicitApiUrl);
  }

  const socketBaseUrl = firstValidHttpUrl(
    [
      process.env.REACT_APP_API_WS,
      process.env.VITE_API_WS,
      process.env.REACT_APP_API_BASE,
      process.env.VITE_API_BASE,
      process.env.REACT_APP_SOCKET_URL,
    ],
    ""
  );

  if (socketBaseUrl) {
    return `${stripApiSuffix(socketBaseUrl)}/api`;
  }

  return firstValidHttpUrl(
    "http://localhost:5000/api"
  );
}

export function resolveSocketBaseUrl() {
  const explicitSocketUrl = firstValidHttpUrl(
    [
      process.env.REACT_APP_API_WS,
      process.env.VITE_API_WS,
      process.env.REACT_APP_API_BASE,
      process.env.VITE_API_BASE,
      process.env.REACT_APP_SOCKET_URL,
    ],
    ""
  );

  if (explicitSocketUrl) {
    return stripApiSuffix(explicitSocketUrl);
  }

  const apiBaseUrl = firstValidHttpUrl(
    [
      process.env.REACT_APP_API_URL,
      process.env.VITE_API_URL,
      process.env.REACT_APP_BASE_URL,
    ],
    ""
  );

  if (apiBaseUrl) {
    return stripApiSuffix(apiBaseUrl);
  }

  return firstValidHttpUrl(
    "http://localhost:5000"
  );
}
