import axios from 'axios';
import {
  clearSession,
  getLoginPathForRoleScope,
  getResumeRoute,
  getStoredSession,
  inferRoleScopeFromPath,
  setResumeRoute,
} from "./utils/authSession";
import { resolveApiBaseUrl } from "./utils/runtimeConfig";

const API = axios.create({
  baseURL: resolveApiBaseUrl(),
});
API.interceptors.request.use(cfg => {
  const token = getStoredSession()?.token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith("/login")) {
        const roleScope = getResumeRoute()?.roleScope || inferRoleScopeFromPath(currentPath);
        setResumeRoute({
          pathname: currentPath,
          search: window.location.search,
          hash: window.location.hash,
          state: getResumeRoute()?.state ?? null,
          roleScope,
        });
        clearSession({ clearResumeRoute: false });
        window.location.replace(getLoginPathForRoleScope(roleScope));
      }
    }
    return Promise.reject(error);
  }
);

export default API;
 
