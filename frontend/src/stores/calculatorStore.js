import { useCallback } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { syncConstructionsTitlesFromItems } from "../utils/itemsCatalog.js";

/**
 * Глобальный стор калькулятора. Сохраняется в sessionStorage — состояние
 * живёт до закрытия вкладки, но переживает переходы между /calc, /kp/:id,
 * /kp/list и т.д. При открытии в новой вкладке — чистый стейт.
 *
 * Хранятся только поля, которые имеет смысл переживать навигацию:
 *   - накопленные конструкции (ConstrToCalc, ConstrToCalcToSent, materialsByConstruction);
 *   - табличное состояние (tableConstrToCalc);
 *   - выбор пользователя в UI (currentSubCategory/Items, openedSubCategories,
 *     template, profileStep (лаги пола), facingProfileStep (облицовка/перегородки),
 *     dFrame, currentConstr, currentFloorSealant,
 *     currentCeilingMats, currentGkla/Wool, unvisible).
 *
 * Эфемерные вещи (текущая форма нового элемента `constR`/`constrSent`/`opening`,
 * лоадеры, модалки) остаются useState в компоненте.
 */

const initialState = {
  currentGkla: "default",
  currentWool: "default",
  unvisible: false,
  tableConstrToCalc: null,
  currentSubCategory: 0,
  currentItems: 0,
  openedSubCategories: { F: null, C: null, L: null, W: null },
  template: null,
  profileStep: 400,
  facingProfileStep: 600,
  dFrame: false,
  currentConstr: "",
  currentFloorSealant: "vibrosil",
  currentCeilingMats: [],
  ConstrToCalcToSent: [],
  ConstrToCalc: [],
  materialsByConstruction: [],
};

export const useCalculatorStore = create(
  persist(
    (set) => ({
      ...initialState,

      /** Универсальный setter: принимает значение или (prev) => next — как useState. */
      setField: (key, v) =>
        set((state) => ({
          [key]: typeof v === "function" ? v(state[key]) : v,
        })),

      /** Полный сброс состояния (например при выходе из КП в список). */
      reset: () => set(initialState),

      /**
       * Подстановка состава КП в калькулятор (режим редактирования).
       * Если есть конструкции — таблица всегда открыта (tableConstrToCalc ≠ null).
       */
      loadKpEditState: ({
        constrToCalc,
        constrToCalcToSent,
        materialsByConstruction,
        tableConstrToCalc,
      }) =>
        set((state) => {
          const sent = constrToCalcToSent ?? [];
          const ConstrToCalc = syncConstructionsTitlesFromItems(
            constrToCalc ?? [],
            sent,
          );
          const hasConstr = ConstrToCalc.length > 0;
          let table = tableConstrToCalc;
          if (hasConstr && (table == null || table === undefined)) {
            table = {};
          }
          if (!hasConstr) {
            table = null;
          }
          return {
            ...state,
            ConstrToCalc,
            ConstrToCalcToSent: sent,
            materialsByConstruction: materialsByConstruction ?? [],
            tableConstrToCalc: table,
          };
        }),
    }),
    {
      name: "ag_co_worker_calc_store_v1",
      storage: createJSONStorage(() => sessionStorage),
      // не пишем в storage функции и initial-only поля
      partialize: (state) =>
        Object.fromEntries(
          Object.keys(initialState).map((k) => [k, state[k]])
        ),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.currentCeilingMats)) {
          state.currentCeilingMats = [];
        }
        if (!state?.ConstrToCalc?.length) return;
        const synced = syncConstructionsTitlesFromItems(
          state.ConstrToCalc,
          state.ConstrToCalcToSent ?? [],
        );
        state.ConstrToCalc = synced;
      },
    }
  )
);

/**
 * Хук в стиле useState для поля стора — drop-in замена:
 *   const [currentGkla, setCurrentGkla] = useCalcField("currentGkla");
 *
 * Подписка только на одно поле — изменение других ключей не ре-рендерит компонент.
 */
export function useCalcField(key) {
  const value = useCalculatorStore((state) => state[key]);
  const setValue = useCallback(
    (v) => useCalculatorStore.getState().setField(key, v),
    [key]
  );
  return [value, setValue];
}
