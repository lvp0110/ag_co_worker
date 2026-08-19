import { useNavigate } from "react-router-dom";
import FloorForm from "./forms/FloorForm";
import CeilingForm from "./forms/CeilingForm";
import FacingForm from "./forms/FacingForm";
import SoundboardForm from "./forms/SoundboardForm";
import ConstructionParameters from "./ConstructionParameters";
import CalcApiOptions from "./CalcApiOptions";
import { hasCalcApiOptions, defaultCalcApiValues } from "../utils/isolationCalcV2";

/**
 * Формы выбранного элемента: размеры — старые формы по секции,
 * параметры и доп. материалы — из calculation-params / composition.
 * Замена материалов — в таблице состава, не в этой форме.
 */
const SelectedItemForms = ({
  selectedItem,
  constR,
  setConstR,
  currentSubCategory,
  unvisible,
  setUnvisible,
  opening,
  setOpening,
  constrSent,
  onAddOpening,
  onDeleteOpening,
  calcApiSpec,
  calcApiValues,
  onCalcApiValuesChange,
}) => {
  const cId = selectedItem?.c_id;
  const template = selectedItem?.template;
  const isFloor = cId === "F";
  const isCeiling = cId === "C";
  const isFacing = cId === "L" || cId === "W";
  const isSoundboardTemplate = [201, 202].includes(template);
  const isVerticalSoundboard = template === 201 && selectedItem?.c_id === "5";
  const showApiOptions = hasCalcApiOptions(calcApiSpec);
  const apiValues = calcApiValues || defaultCalcApiValues();
  const navigate = useNavigate();

  const getStartParam = () => {
    setUnvisible(!unvisible);
  };

  const handleInfoClick = (e) => {
    e.stopPropagation();
    if (!selectedItem?.ag_id) return;
    navigate(`/info/${selectedItem.ag_id}`, { state: { c_id: selectedItem.c_id } });
  };

  const displayTitle = selectedItem?.title ?? "";

  const toggleParams = showApiOptions || isFacing ? getStartParam : undefined;
  const apiOptions =
    showApiOptions && unvisible ? (
      <CalcApiOptions
        spec={calcApiSpec}
        values={apiValues}
        onChange={onCalcApiValuesChange}
        itemId={selectedItem.id}
      />
    ) : null;

  return (
    <div className="selected-item-forms">
      <button
        type="button"
        className="selected-item-header"
        onClick={handleInfoClick}
        aria-label={`Информация: ${displayTitle}`}
        title="Информация"
      >
        <h3>{displayTitle}</h3>
        <span className="selected-item-header-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
            <text x="10" y="14" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" fontStyle="italic">i</text>
          </svg>
        </span>
      </button>

      {isFloor && (
        <>
          <FloorForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenYChange={(value) => setConstR({ ...constR, lenY: value })}
            onShowParams={toggleParams}
          />
          {apiOptions}
        </>
      )}

      {isCeiling && (
        <>
          <CeilingForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenYChange={(value) => setConstR({ ...constR, lenY: value })}
            onAddCeilShiftChange={(value) =>
              setConstR({ ...constR, AddCeilShift: value })
            }
            showCeilShift={false}
            onShowParams={toggleParams}
          />
          {apiOptions}
        </>
      )}

      {isFacing && (
        <>
          <FacingForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenZChange={(value) => setConstR({ ...constR, lenZ: value })}
            onShowParams={toggleParams}
          />
          {apiOptions}
          {unvisible && (
            <ConstructionParameters
              selectedItem={selectedItem}
              currentSubCategory={currentSubCategory}
              opening={opening}
              setOpening={setOpening}
              openings={constrSent.Openings}
              onAddOpening={onAddOpening}
              onDeleteOpening={onDeleteOpening}
              openingsOnly
            />
          )}
        </>
      )}

      {isSoundboardTemplate && !isFloor && !isCeiling && !isFacing && (
        <>
          <SoundboardForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenYChange={(value) => setConstR({ ...constR, lenY: value })}
            onLenZChange={(value) => setConstR({ ...constR, lenZ: value })}
            isVertical={isVerticalSoundboard}
            onShowParams={toggleParams}
          />
          {apiOptions}
        </>
      )}
    </div>
  );
};

export default SelectedItemForms;
