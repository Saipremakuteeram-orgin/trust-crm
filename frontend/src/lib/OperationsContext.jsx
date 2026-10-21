import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import api from "./api";
import { isOperationsEnabled } from "./operationsFlags";

export const ALL_TRUSTS_ID = "all";
const SELECTED_TRUST_STORAGE_KEY = "trust-crm.operations.selected-trust";

const defaultOperationsContext = {
  enabled: false,
  trusts: [],
  selectedTrustId: ALL_TRUSTS_ID,
  setSelectedTrustId: () => {},
  loading: false,
  error: null,
};

const OperationsContext = createContext(defaultOperationsContext);

function readStoredTrustId() {
  if (typeof window === "undefined") return ALL_TRUSTS_ID;
  try {
    return window.localStorage.getItem(SELECTED_TRUST_STORAGE_KEY) || ALL_TRUSTS_ID;
  } catch {
    return ALL_TRUSTS_ID;
  }
}

function writeStoredTrustId(trustId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SELECTED_TRUST_STORAGE_KEY, trustId);
  } catch {
    // Local storage is only a convenience preference; the API remains the source of truth.
  }
}

function isKnownTrust(trusts, trustId) {
  return trusts.some((trust) => trust.id === trustId);
}

export function OperationsProvider({ children }) {
  const { session } = useAuth();
  const enabled = isOperationsEnabled("trusts");
  const [trusts, setTrusts] = useState([]);
  const [selectedTrustIdState, setSelectedTrustIdState] = useState(readStoredTrustId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !session?.user?.id) {
      setTrusts([]);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.get("/v2/operations/trusts")
      .then(({ data }) => {
        if (cancelled) return;
        const nextTrusts = Array.isArray(data?.result) ? data.result : [];
        setTrusts(nextTrusts);
        setSelectedTrustIdState((current) => (
          current === ALL_TRUSTS_ID || isKnownTrust(nextTrusts, current)
            ? current
            : ALL_TRUSTS_ID
        ));
      })
      .catch((requestError) => {
        if (cancelled) return;
        setTrusts([]);
        setError(requestError.response?.data?.message || "Unable to load Operations trusts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, session?.user?.id]);

  const setSelectedTrustId = useCallback((trustId) => {
    const nextTrustId = trustId === ALL_TRUSTS_ID || isKnownTrust(trusts, trustId)
      ? trustId
      : ALL_TRUSTS_ID;
    setSelectedTrustIdState(nextTrustId);
  }, [trusts]);

  useEffect(() => {
    if (enabled && session?.user?.id) writeStoredTrustId(selectedTrustIdState);
  }, [enabled, selectedTrustIdState, session?.user?.id]);

  const value = useMemo(() => ({
    enabled,
    trusts,
    selectedTrustId: selectedTrustIdState,
    setSelectedTrustId,
    loading,
    error,
  }), [enabled, trusts, selectedTrustIdState, setSelectedTrustId, loading, error]);

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  return useContext(OperationsContext);
}
