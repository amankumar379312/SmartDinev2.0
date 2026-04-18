import { useContext, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { setResumeRoute, shouldTrackRoute } from "../utils/authSession";
import API from "../api";
import { buildWorkflowPayload } from "../utils/workflowSession";

export default function SessionTracker() {
  const location = useLocation();
  const { isAuthenticated, roleScope } = useContext(AuthContext);

  useEffect(() => {
    if (!isAuthenticated || !shouldTrackRoute(location.pathname)) return;

    setResumeRoute({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state ?? null,
      roleScope,
    });
  }, [isAuthenticated, location, roleScope]);

  useEffect(() => {
    if (!isAuthenticated || !shouldTrackRoute(location.pathname)) return;

    let cancelled = false;

    (async () => {
      try {
        await API.put("/workflow/current", buildWorkflowPayload({
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          routeState: location.state ?? null,
          roleScope,
          currentStep: location.pathname.replace(/^\//, "") || "home",
        }));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync workflow", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location.hash, location.pathname, location.search, location.state, roleScope]);

  return null;
}
