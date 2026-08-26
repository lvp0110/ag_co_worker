/**
 * Проёмы для облицовок/перегородок (facing).
 * Панель в том же стиле, что и «размер конструкции».
 */
const OpeningsForm = ({
  selectedItem,
  opening,
  setOpening,
  openings,
  onAddOpening,
  onDeleteOpening,
}) => {
  const itemId = selectedItem?.id;

  return (
    <div className="selected-item-forms__panel selected-item-forms__dimensions">
      <h4 className="selected-item-forms__title">тип проема</h4>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) =>
            setOpening({
              ...opening,
              Type: e.target.value,
            })
          }
          id={`doors_${itemId}`}
          name={`opening_${itemId}`}
          value="OST_Doors"
          checked={opening.Type == "OST_Doors"}
        />
        <label className="label" htmlFor={`doors_${itemId}`}>
          дверь
        </label>
      </div>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) =>
            setOpening({
              ...opening,
              Type: e.target.value,
            })
          }
          id={`wind_${itemId}`}
          name={`opening_${itemId}`}
          value="OST_Windows"
          checked={opening.Type == "OST_Windows"}
        />
        <label className="label" htmlFor={`wind_${itemId}`}>
          окно
        </label>
      </div>

      <div className="selected-item-forms__dimensions-inputs">
        <input
          type="number"
          placeholder="ширина,мм"
          value={opening.lenX || ""}
          onChange={(e) =>
            setOpening({
              ...opening,
              lenX: e.target.value,
            })
          }
        />
        <input
          type="number"
          placeholder="высота,мм"
          value={opening.lenZ || ""}
          onChange={(e) =>
            setOpening({
              ...opening,
              lenZ: e.target.value,
            })
          }
        />
      </div>

      <button
        type="button"
        className="counter__button_param selected-item-forms__param-btn"
        onClick={onAddOpening}
        disabled={
          !opening.lenX ||
          !opening.lenZ ||
          isNaN(+opening.lenX) ||
          isNaN(+opening.lenZ) ||
          +opening.lenX <= 0 ||
          +opening.lenZ <= 0
        }
      >
        добавить проем
      </button>

      {openings.length > 0 && (
        <div className="tbl-in selected-item-forms__openings-table">
          <table className="data">
            <thead>
              <tr>
                <th colSpan="3">список проемов</th>
              </tr>
              <tr>
                <th>тип проема</th>
                <th>размеры, мм</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {openings.map((op, idx) => (
                <tr key={idx}>
                  <td>{op.Type == "OST_Doors" ? "дверь" : "окно"}</td>
                  <td>
                    {op.lenX} x {op.lenZ}
                  </td>
                  <td>
                    <input
                      type="button"
                      className="counter__button_minus"
                      onClick={() => onDeleteOpening(idx)}
                    />
                    <img
                      src={`${import.meta.env.BASE_URL}delete-icon.jpg`}
                      alt=""
                      className="selected-item-forms__openings-delete"
                      loading="lazy"
                      decoding="async"
                      onClick={() => onDeleteOpening(idx)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OpeningsForm;
