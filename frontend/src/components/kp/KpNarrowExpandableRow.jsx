import { Children, Fragment, cloneElement, isValidElement } from "react";
import { KpNarrowRowDetail } from "./KpNarrowRowDetail";

function narrowRowTriggerChevron(isExpanded) {
  return (
    <span
      className={`kp-narrow-row-trigger${
        isExpanded ? " kp-narrow-row-trigger--expanded" : ""
      }`}
      aria-hidden
    />
  );
}

function cellAlreadyHasTrigger(children) {
  const list = Children.toArray(children);
  return list.some(
    (node) =>
      isValidElement(node) &&
      typeof node.props?.className === "string" &&
      node.props.className.includes("kp-narrow-row-trigger"),
  );
}

function flattenRowCells(children) {
  const cells = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === Fragment) {
      cells.push(...flattenRowCells(child.props.children));
    } else {
      cells.push(child);
    }
  });
  return cells;
}

function isNarrowHiddenCell(cell) {
  if (!isValidElement(cell) || cell.type !== "td") return true;
  const cls = cell.props?.className;
  if (typeof cls !== "string") return false;
  return (
    cls.includes("kp-data-col--hide-narrow") ||
    cls.includes("materials-list__col--hidden")
  );
}

/** Первая видимая ячейка (не скрытая колонка артикула / spacer). */
function firstVisibleCellIndex(cells) {
  const idx = cells.findIndex((cell) => !isNarrowHiddenCell(cell));
  return idx >= 0 ? idx : 0;
}

function injectTriggerIntoCell(cell, isExpanded) {
  const trigger = narrowRowTriggerChevron(isExpanded);
  const inner = cell.props.children;

  if (isValidElement(inner)) {
    const innerClass = inner.props?.className;
    if (
      typeof innerClass === "string" &&
      (innerClass.includes("kp-narrow-row-summary-cell") ||
        innerClass.includes("kp-page__service-name-cell"))
    ) {
      if (cellAlreadyHasTrigger(inner.props.children)) return cell;
      const innerKids = Children.toArray(inner.props.children);
      return cloneElement(cell, {
        children: cloneElement(inner, {
          children: [trigger, ...innerKids],
        }),
      });
    }
  }

  if (cellAlreadyHasTrigger(inner)) return cell;

  return cloneElement(cell, {
    children: (
      <span className="kp-narrow-row-trigger-wrap">
        {trigger}
        {inner}
      </span>
    ),
  });
}

/** Шеврон в первой видимой ячейке — визуальный триггер раскрытия карточки. */
function injectTriggerIntoFirstCell(children, isExpanded) {
  const cells = flattenRowCells(children);
  if (cells.length === 0) return children;

  const targetIndex = firstVisibleCellIndex(cells);
  const target = cells[targetIndex];
  if (!isValidElement(target) || target.type !== "td") return children;

  const nextCells = [...cells];
  nextCells[targetIndex] = injectTriggerIntoCell(target, isExpanded);
  return nextCells;
}

/**
 * Обёртка строки таблицы КП: на узком экране по клику раскрывает карточку с полями.
 */
export function KpNarrowExpandableRow({
  rowKey,
  expandedKey,
  onToggleRow,
  narrow,
  colSpan,
  children,
  detailTitle,
  detailFields,
}) {
  const isExpanded = narrow && expandedKey === rowKey;

  const rowProps = narrow
    ? {
        className: `kp-narrow-row--clickable${
          isExpanded ? " kp-narrow-row--expanded" : ""
        }`,
        onClick: () => onToggleRow(rowKey),
        role: "button",
        tabIndex: 0,
        "aria-expanded": isExpanded,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleRow(rowKey);
          }
        },
      }
    : {};

  const rowChildren = narrow
    ? injectTriggerIntoFirstCell(children, isExpanded)
    : children;

  return (
    <Fragment>
      <tr {...rowProps}>{rowChildren}</tr>
      {isExpanded && detailFields?.length > 0 && (
        <tr className="kp-narrow-detail-row">
          <td colSpan={colSpan} className="kp-narrow-detail-cell">
            <KpNarrowRowDetail title={detailTitle} fields={detailFields} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
