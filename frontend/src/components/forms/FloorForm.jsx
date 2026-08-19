
/**
 * Форма ввода размеров для полов
 */
const FloorForm = ({ constR, onLenXChange, onLenYChange, onShowParams }) => {
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

export default FloorForm;











