import { useCallback, useRef, useState } from "react";

/**
 * Мультивыбор ячеек скидки в сводке КП.
 * - обычный клик: выбрать одну строку
 * - Ctrl/Cmd+клик: добавить/убрать из выбора
 * - Shift+клик: диапазон от последней кликнутой
 */
export function useKpDiscountMultiSelect(rowKeys) {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const lastClickedRef = useRef(null);
  const keys = Array.isArray(rowKeys) ? rowKeys : [];

  const selectOnPointer = useCallback(
    (rowKey, event) => {
      const additive = Boolean(event?.metaKey || event?.ctrlKey);
      const range = Boolean(event?.shiftKey);
      setSelectedKeys((prev) => {
        if (range && lastClickedRef.current != null) {
          const start = keys.indexOf(lastClickedRef.current);
          const end = keys.indexOf(rowKey);
          if (start >= 0 && end >= 0) {
            const from = Math.min(start, end);
            const to = Math.max(start, end);
            const next = additive ? new Set(prev) : new Set();
            for (let i = from; i <= to; i += 1) {
              next.add(keys[i]);
            }
            return next;
          }
        }
        if (additive) {
          const next = new Set(prev);
          if (next.has(rowKey)) next.delete(rowKey);
          else next.add(rowKey);
          return next;
        }
        return new Set([rowKey]);
      });
      if (!range) {
        lastClickedRef.current = rowKey;
      }
    },
    [keys],
  );

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    lastClickedRef.current = null;
  }, []);

  const keysForEdit = useCallback(
    (rowKey) => {
      if (selectedKeys.has(rowKey) && selectedKeys.size > 1) {
        return keys.filter((key) => selectedKeys.has(key));
      }
      return [rowKey];
    },
    [keys, selectedKeys],
  );

  return {
    selectedKeys,
    selectOnPointer,
    clearSelection,
    keysForEdit,
    isSelected: (rowKey) => selectedKeys.has(rowKey),
  };
}
