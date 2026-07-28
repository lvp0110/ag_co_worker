import "./KpNarrowRowDetail.css";

/**
 * Карточка полей строки таблицы КП на узком экране.
 * @param {{ title?: string, fields: { id: string, label: string, children: import('react').ReactNode }[] }} props
 */
export function KpNarrowRowDetail({ title, fields }) {
  return (
    <div
      className="kp-narrow-row-detail"
      onClick={(e) => e.stopPropagation()}
    >
      {title ? <p className="kp-narrow-row-detail__title">{title}</p> : null}
      <dl className="kp-narrow-row-detail__fields">
        {fields.map(({ id, label, children }) => (
          <div key={id} className="kp-narrow-row-detail__row">
            <dt>{label}</dt>
            <dd>{children}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
