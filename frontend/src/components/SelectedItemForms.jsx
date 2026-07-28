import { useNavigate } from "react-router-dom";
import FloorForm from "./forms/FloorForm";
import CeilingForm from "./forms/CeilingForm";
import FacingForm from "./forms/FacingForm";
import SoundboardForm from "./forms/SoundboardForm";
import ConstructionParameters from "./ConstructionParameters";
import {
  hasFloorSealantChoice,
  isSimpleCeilingMatCipher,
} from "../utils/calcUlTapeFallback";
import { isFacingTemplate } from "../utils/validation";

/**
 * Компонент для отображения форм выбранного элемента
 */
const SelectedItemForms = ({
  selectedItem,
  constR,
  setConstR,
  currentSubCategory,
  currentConstr,
  setCurrentConstr,
  currentFloorSealant,
  setCurrentFloorSealant,
  currentCeilingMats,
  setCurrentCeilingMats,
  unvisible,
  setUnvisible,
  currentGkla,
  setCurrentGkla,
  currentWool,
  setCurrentWool,
  profileStep,
  setProfileStep,
  facingProfileStep,
  setFacingProfileStep,
  dFrame,
  setDFrame,
  opening,
  setOpening,
  constrSent,
  onAddOpening,
  onDeleteOpening,
}) => {
  const template = selectedItem?.template;
  const isFloorTemplate = [1, 111, 3, 607.1, 608.1, 609.1, 610.1, 2.1, 9, 9.1].includes(template);
  const hasFloorParameters = [3, 607.1, 608.1, 609.1, 610.1, 2.1, 9, 9.1].includes(
    template
  );
  const showFloorConstructionParameters =
    hasFloorParameters || hasFloorSealantChoice({ agId: selectedItem?.ag_id });
  const isCeilingTemplate = [4, 5].includes(template);
  const showCeilingConstructionParameters =
    !isSimpleCeilingMatCipher(selectedItem?.ag_id);
  const isFacing = isFacingTemplate(template);
  const isSoundboardTemplate = [201, 202].includes(template);
  const isVerticalSoundboard = template === 201 && selectedItem?.c_id === "5";
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

      {isFloorTemplate && (
        <>
          <FloorForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenYChange={(value) => setConstR({ ...constR, lenY: value })}
          />
          {showFloorConstructionParameters && (
            <ConstructionParameters
              mode="floor"
              selectedItem={selectedItem}
              template={template}
              currentConstr={currentConstr}
              setCurrentConstr={setCurrentConstr}
              currentFloorSealant={currentFloorSealant}
              setCurrentFloorSealant={setCurrentFloorSealant}
              profileStep={profileStep}
              setProfileStep={setProfileStep}
              unvisible={unvisible}
              onToggleVisible={getStartParam}
            />
          )}
        </>
      )}

      {isCeilingTemplate && (
        <>
          <CeilingForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenYChange={(value) => setConstR({ ...constR, lenY: value })}
            onAddCeilShiftChange={(value) =>
              setConstR({ ...constR, AddCeilShift: value })
            }
            showCeilShift={false}
          />
          {showCeilingConstructionParameters && (
            <ConstructionParameters
              mode="ceiling"
              selectedItem={selectedItem}
              template={template}
              currentConstr={currentConstr}
              setCurrentConstr={setCurrentConstr}
              currentGkla={currentGkla}
              setCurrentGkla={setCurrentGkla}
              currentWool={currentWool}
              setCurrentWool={setCurrentWool}
              currentFloorSealant={currentFloorSealant}
              setCurrentFloorSealant={setCurrentFloorSealant}
              currentCeilingMats={currentCeilingMats}
              setCurrentCeilingMats={setCurrentCeilingMats}
              constR={constR}
              setConstR={setConstR}
              unvisible={unvisible}
              onToggleVisible={getStartParam}
            />
          )}
        </>
      )}

      {isFacing && (
        <>
          <FacingForm
            constR={constR}
            onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
            onLenZChange={(value) => setConstR({ ...constR, lenZ: value })}
            onShowParams={getStartParam}
          />
          {unvisible && (
            <ConstructionParameters
              selectedItem={selectedItem}
              currentSubCategory={currentSubCategory}
              currentConstr={currentConstr}
              setCurrentConstr={setCurrentConstr}
              currentGkla={currentGkla}
              setCurrentGkla={setCurrentGkla}
              currentWool={currentWool}
              setCurrentWool={setCurrentWool}
              currentFloorSealant={currentFloorSealant}
              setCurrentFloorSealant={setCurrentFloorSealant}
              currentCeilingMats={currentCeilingMats}
              setCurrentCeilingMats={setCurrentCeilingMats}
              profileStep={facingProfileStep}
              setProfileStep={setFacingProfileStep}
              dFrame={dFrame}
              setDFrame={setDFrame}
              opening={opening}
              setOpening={setOpening}
              openings={constrSent.Openings}
              onAddOpening={onAddOpening}
              onDeleteOpening={onDeleteOpening}
            />
          )}
        </>
      )}

      {isSoundboardTemplate && (
        <SoundboardForm
          constR={constR}
          onLenXChange={(value) => setConstR({ ...constR, lenX: value })}
          onLenYChange={(value) => setConstR({ ...constR, lenY: value })}
          onLenZChange={(value) => setConstR({ ...constR, lenZ: value })}
          isVertical={isVerticalSoundboard}
        />
      )}
    </div>
  );
};

export default SelectedItemForms;
