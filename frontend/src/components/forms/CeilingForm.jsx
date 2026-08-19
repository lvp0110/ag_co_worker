
/**
 * Форма ввода размеров для потолков
 */
const CeilingForm = ({
  constR,
  onLenXChange,
  onLenYChange,
  onAddCeilShiftChange,
  showCeilShift = false,
  onShowParams,
}) => {
  return (
    <div className="selected-item-forms__panel selected-item-forms__dimensions">
      <h4 className="selected-item-forms__title">размер конструкции</h4>
      <div className="selected-item-forms__dimensions-inputs">
        <input
          type="number"
          placeholder="ширина,мм"
          value={constR.lenX || ""}
          onChange={(e) => onLenXChange(e.target.value)}
        />
        <input
          type="number"
          placeholder="длина,мм"
          value={constR.lenY || ""}
          onChange={(e) => onLenYChange(e.target.value)}
        />
        {showCeilShift && (
          <input
            type="number"
            placeholder="смещение от потолка,мм"
            value={constR.AddCeilShift || ""}
            onChange={(e) => onAddCeilShiftChange(e.target.value)}
          />
        )}
      </div>
      {onShowParams && (
        <button
          type="button"
          className="counter__button_param selected-item-forms__param-btn"
          onClick={onShowParams}
        >
          параметры
        </button>
      )}
    </div>
  );
};

export default CeilingForm;











