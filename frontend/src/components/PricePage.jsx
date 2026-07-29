import { Fragment, useMemo, useState } from "react";
import { formatRub } from "./tables/MaterialsList";
import {
  REGION_SELECT_OPTIONS,
  filterVisibleRegionOptions,
  getPriceCoefficient,
} from "../constants/regionSelectOptions.js";
import { setPriceRegion, usePriceData } from "../services/priceApi";
import { filterPriceRows } from "./priceSearch";
import { usePriceNarrowViewport } from "../hooks/usePriceNarrowViewport";
import "./PricePage.css";

const getDefaultRegionOption = (availableRegionKeys) =>
  REGION_SELECT_OPTIONS.find((option) => availableRegionKeys.has(option.regionKey))?.value ??
  "";

function formatPriceCell(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return formatRub(Number(value));
}

function getPriceByRegion(row, region, key, cityValue) {
  if (!row) return undefined;
  const regional = region ? row.regionalPrices?.[region]?.[key] : undefined;
  if (regional != null) {
    if (region === "ural") {
      const coef = getPriceCoefficient(cityValue);
      return coef === 1 ? regional : regional * coef;
    }
    return regional;
  }
  return row[key];
}

function getPriceRowKey(row, region) {
  return `${row.article}-${region || "default"}`;
}

function PriceRowDetailCard({ row, selectedRegion, selectedCity }) {
  return (
    <div className="price-page__detail-card">
      <p className="price-page__detail-name">
        {row.name?.trim() ? row.name : "—"}
      </p>
      <dl className="price-page__detail-meta">
        <div className="price-page__detail-meta-row">
          <dt>Артикул</dt>
          <dd>{row.article ?? "—"}</dd>
        </div>
        <div className="price-page__detail-meta-row">
          <dt>Ед. изм.</dt>
          <dd>{row.units?.trim() ? row.units : "—"}</dd>
        </div>
        <div className="price-page__detail-meta-row">
          <dt>₽ / м²</dt>
          <dd>
            {formatPriceCell(
              getPriceByRegion(row, selectedRegion, "pricePerM2", selectedCity)
            )}
          </dd>
        </div>
        <div className="price-page__detail-meta-row">
          <dt>₽ / ед.</dt>
          <dd>
            {formatPriceCell(
              getPriceByRegion(row, selectedRegion, "pricePerUnit", selectedCity)
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const PricePage = () => {
  const [query, setQuery] = useState("");
  const [expandedRowKey, setExpandedRowKey] = useState(null);
  const isPriceNarrow = usePriceNarrowViewport();
  const {
    list: priceList,
    error,
    loaded,
    loading,
    regions,
    selectedRegion,
    selectedCityRegion,
  } = usePriceData();

  const visibleRegionOptions = useMemo(
    () => filterVisibleRegionOptions(regions),
    [regions]
  );

  const availableRegionKeys = useMemo(
    () => new Set(visibleRegionOptions.map((option) => option.regionKey)),
    [visibleRegionOptions]
  );

  const isPriceRegionsLoading = loading || (!loaded && !error);

  const effectiveSelectedRegionOption = useMemo(() => {
    if (
      selectedCityRegion &&
      visibleRegionOptions.some((option) => option.value === selectedCityRegion)
    ) {
      return selectedCityRegion;
    }
    if (selectedRegion) {
      const regionKey = String(selectedRegion).toLowerCase();
      const match = visibleRegionOptions.find(
        (option) => option.regionKey === regionKey
      );
      if (match) return match.value;
    }
    return getDefaultRegionOption(availableRegionKeys);
  }, [
    selectedCityRegion,
    selectedRegion,
    visibleRegionOptions,
    availableRegionKeys,
  ]);

  const handleRegionChange = (optionValue) => {
    const selectedOption = REGION_SELECT_OPTIONS.find(
      (option) => option.value === optionValue
    );
    if (!selectedOption) return;
    setPriceRegion(selectedOption.regionKey, { cityValue: optionValue });
  };

  const copyArticle = (row) => {
    try {
      navigator.clipboard?.writeText(String(row.article ?? row.name ?? ""));
    } catch {
      // ignore
    }
  };

  const filtered = useMemo(() => {
    return filterPriceRows(priceList, query);
  }, [query, priceList]);

  return (
    <div className="price-page">
      <main className="price-page__main">
        <h1 className="price-page__title">Прайс</h1>
        {error && (
          <p className="price-page__empty">
            Не удалось загрузить прайс: {error}
          </p>
        )}

        <label className="price-page__search-label" htmlFor="price-region">
          Регион
        </label>
        <select
          id="price-region"
          className="price-page__search price-page__region-select"
          value={
            isPriceRegionsLoading || visibleRegionOptions.length === 0
              ? ""
              : effectiveSelectedRegionOption
          }
          onChange={(e) => handleRegionChange(e.target.value)}
          disabled={isPriceRegionsLoading || visibleRegionOptions.length === 0}
        >
          {isPriceRegionsLoading ? (
            <option value="">Загрузка регионов...</option>
          ) : visibleRegionOptions.length === 0 ? (
            <option value="">Регионы не найдены</option>
          ) : (
            visibleRegionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          )}
        </select>

        <label className="price-page__search-label" htmlFor="price-search">
          Поиск по артикулу или наименованию
        </label>
        <input
          id="price-search"
          className="price-page__search"
          type="search"
          autoComplete="off"
          placeholder="Артикул или название"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="price-page__table-wrap">
          <table className="price-page__table">
            <thead>
              <tr>
                <th scope="col">Артикул</th>
                <th scope="col">Наименование</th>
                <th scope="col">Ед.изм.</th>
                <th scope="col">₽ / м²</th>
                <th scope="col">₽ / ед.</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const rowKey = getPriceRowKey(row, selectedRegion);
                const isExpanded = expandedRowKey === rowKey;
                const rowClassName = isExpanded
                  ? "price-page__row--expanded"
                  : undefined;

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={rowClassName}
                      onClick={() =>
                        setExpandedRowKey((prev) =>
                          prev === rowKey ? null : rowKey
                        )
                      }
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedRowKey((prev) =>
                            prev === rowKey ? null : rowKey
                          );
                        }
                      }}
                    >
                      <td className="price-page__article">{row.article}</td>
                      <td className="price-page__name">
                        <span className="price-page__name-cell">
                          {isPriceNarrow ? (
                            <span
                              className={`price-page__row-trigger${
                                isExpanded
                                  ? " price-page__row-trigger--expanded"
                                  : ""
                              }`}
                              aria-hidden
                            />
                          ) : null}
                          <span className="price-page__name-text">
                            {row.name?.trim() ? row.name : "—"}
                          </span>
                        </span>
                      </td>
                      <td className="price-page__units">
                        {row.units?.trim() ? row.units : "—"}
                      </td>
                      <td>
                        {formatPriceCell(
                          getPriceByRegion(
                            row,
                            selectedRegion,
                            "pricePerM2",
                            effectiveSelectedRegionOption
                          )
                        )}
                      </td>
                      <td>
                        {formatPriceCell(
                          getPriceByRegion(
                            row,
                            selectedRegion,
                            "pricePerUnit",
                            effectiveSelectedRegionOption
                          )
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="price-page__add-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyArticle(row);
                          }}
                          aria-label={`Копировать артикул ${row.article ?? ""}`}
                        >
                          Копировать
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="price-page__detail-row">
                        <td className="price-page__detail-cell" colSpan={6}>
                          <PriceRowDetailCard
                            row={row}
                            selectedRegion={selectedRegion}
                            selectedCity={effectiveSelectedRegionOption}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default PricePage;
