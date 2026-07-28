import { useCallback, useState } from "react";

export function useKpExpandedRow() {
  const [expandedKey, setExpandedKey] = useState(null);
  const toggleRow = useCallback((rowKey) => {
    setExpandedKey((prev) => (prev === rowKey ? null : rowKey));
  }, []);
  return { expandedKey, toggleRow };
}
