import { useId, useState } from "react";

export default function AdminCollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="admin-page__collapsible">
      <div className="admin-page__composition-head">
        <h3 className="admin-page__composition-title">
          <button
            type="button"
            className="admin-page__collapsible-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <span
              className={
                "admin-page__collapsible-chevron" +
                (open ? " admin-page__collapsible-chevron--open" : "")
              }
              aria-hidden
            />
            {title}
            {count != null && count !== "" ? (
              <span className="admin-page__count">{count}</span>
            ) : null}
          </button>
        </h3>
      </div>
      <div
        id={panelId}
        className="admin-page__collapsible-body"
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
