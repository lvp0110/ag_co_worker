
/**
 * Форма ввода размеров для звукобордов
 */
const SoundboardForm = ({ constR, onLenXChange, onLenYChange, onLenZChange, isVertical = false }) => {
  return (
    <div className="selected-item-forms__panel selected-item-forms__dimensions">
      <h4 className="selected-item-forms__title">размер конструкции</h4>
      <div className="selected-item-forms__dimensions-inputs">
        {isVertical ? (
          <>
            <input
              type="number"
              placeholder="ширина,мм"
              value={constR.lenX || ""}
              onChange={(e) => onLenXChange(e.target.value)}
            />
            <input
              type="number"
              placeholder="высота,мм"
              value={constR.lenZ || ""}
              onChange={(e) => onLenZChange(e.target.value)}
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

export default SoundboardForm;











