import { useEffect } from "react";
import {
  ceilingPerimeterTapeCodes,
  facingPerimeterTapeCodes,
  FLOOR_K2_PERIMETER_AG_IDS,
  FLOOR_NO_UL_TAPE_AG_IDS,
  floorPerimeterTapeCodes,
  hasCeilingMatChoice,
  hasCeilingTapeChoice,
  hasFacingTapeChoice,
  hasFloorSealantChoice,
  hasEcoSWoolChoice,
  hasGklaChoice,
  UL_TAPE_SUFFIX,
  WOOL_ECO_S,
  AG_CT_ECO_CIPHER,
  AG_CS_MAT_CIPHER,
  AG_CU_MEM_CIPHER,
} from "../utils/calcUlTapeFallback";
import {
  getMaxLenZInMeters,
  normalizeFacingProfileStep,
  normalizeLagProfileStep,
} from "../utils/validation";

function TapeChoiceRadios({ idPrefix, itemId, agId, value, onChange }) {
  return (
    <>
      <h4 className="selected-item-forms__group-heading">
        выбрать тип ленты
      </h4>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_vibro_${itemId}`}
          name={`${idPrefix}_tape_${itemId}`}
          value={agId}
          checked={value === agId}
        />
        <label className="label" htmlFor={`${idPrefix}_vibro_${itemId}`}>
          Вибростек по периметру
        </label>
      </div>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_ul_tape_${itemId}`}
          name={`${idPrefix}_tape_${itemId}`}
          value={`${agId}${UL_TAPE_SUFFIX}`}
          checked={value === `${agId}${UL_TAPE_SUFFIX}`}
        />
        <label className="label" htmlFor={`${idPrefix}_ul_tape_${itemId}`}>
          Ультракустик F100 по периметру
        </label>
      </div>
    </>
  );
}

function WoolChoiceRadios({ idPrefix, itemId, value, onChange, showEcoS }) {
  return (
    <>
      <h4 className="selected-item-forms__group-heading">
        выбрать тип минваты
      </h4>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_wool_default_${itemId}`}
          name={`${idPrefix}_wool_${itemId}`}
          value="default"
          checked={value == "default"}
        />
        <label
          className="label"
          htmlFor={`${idPrefix}_wool_default_${itemId}`}
        >
          Шуманет-Эко
        </label>
      </div>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_wool_bm_${itemId}`}
          name={`${idPrefix}_wool_${itemId}`}
          value="bm"
          checked={value == "bm"}
        />
        <label className="label" htmlFor={`${idPrefix}_wool_bm_${itemId}`}>
          Шуманет-БМ
        </label>
      </div>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_wool_sk_${itemId}`}
          name={`${idPrefix}_wool_${itemId}`}
          value="skNeo"
          checked={value == "skNeo"}
        />
        <label className="label" htmlFor={`${idPrefix}_wool_sk_${itemId}`}>
          Шуманет-СК Neo
        </label>
      </div>
      {showEcoS && (
        <div className="radio-option">
          <input
            className="radio"
            type="radio"
            onChange={(e) => onChange(e.target.value)}
            id={`${idPrefix}_wool_eco_s_${itemId}`}
            name={`${idPrefix}_wool_${itemId}`}
            value={WOOL_ECO_S}
            checked={value == WOOL_ECO_S}
          />
          <label
            className="label"
            htmlFor={`${idPrefix}_wool_eco_s_${itemId}`}
          >
            Шуманет-Eco S
          </label>
        </div>
      )}
    </>
  );
}

function SealantChoiceRadios({ idPrefix, itemId, value, onChange }) {
  return (
    <>
      <h4 className="selected-item-forms__group-heading">
        выбрать тип герметика
      </h4>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_sealant_vibrosil_${itemId}`}
          name={`${idPrefix}_sealant_${itemId}`}
          value="vibrosil"
          checked={value === "vibrosil"}
        />
        <label
          className="label"
          htmlFor={`${idPrefix}_sealant_vibrosil_${itemId}`}
        >
          Вибросил
        </label>
      </div>
      <div className="radio-option">
        <input
          className="radio"
          type="radio"
          onChange={(e) => onChange(e.target.value)}
          id={`${idPrefix}_sealant_ul_${itemId}`}
          name={`${idPrefix}_sealant_${itemId}`}
          value="ultracoustic"
          checked={value === "ultracoustic"}
        />
        <label className="label" htmlFor={`${idPrefix}_sealant_ul_${itemId}`}>
          Ультракустик
        </label>
      </div>
    </>
  );
}

function CeilingMatChoiceCheckboxes({ idPrefix, itemId, value, onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (code) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  return (
    <>
      <h4 className="selected-item-forms__group-heading">
        Добавить к конструкции
      </h4>
      <div className="radio-option">
        <input
          className="checkbox"
          type="checkbox"
          onChange={() => toggle(AG_CT_ECO_CIPHER)}
          id={`${idPrefix}_ceiling_mat_ct_eco_${itemId}`}
          checked={selected.includes(AG_CT_ECO_CIPHER)}
        />
        <label
          className="label"
          htmlFor={`${idPrefix}_ceiling_mat_ct_eco_${itemId}`}
        >
          Шуманет-Термо ЭКО
        </label>
      </div>
      <div className="radio-option">
        <input
          className="checkbox"
          type="checkbox"
          onChange={() => toggle(AG_CS_MAT_CIPHER)}
          id={`${idPrefix}_ceiling_mat_cs_mat_${itemId}`}
          checked={selected.includes(AG_CS_MAT_CIPHER)}
        />
        <label
          className="label"
          htmlFor={`${idPrefix}_ceiling_mat_cs_mat_${itemId}`}
        >
          Ультракустик Супер Мат
        </label>
      </div>
      <div className="radio-option">
        <input
          className="checkbox"
          type="checkbox"
          onChange={() => toggle(AG_CU_MEM_CIPHER)}
          id={`${idPrefix}_ceiling_mat_cu_mem_${itemId}`}
          checked={selected.includes(AG_CU_MEM_CIPHER)}
        />
        <label
          className="label"
          htmlFor={`${idPrefix}_ceiling_mat_cu_mem_${itemId}`}
        >
          Мембрана звукоизоляционная Ультракустик
        </label>
      </div>
    </>
  );
}

/**
 * Компонент параметров конструкции (гипсокартон, минвата, шаг профиля, проемы)
 */
const ConstructionParameters = ({
  mode = "facing",
  selectedItem,
  template,
  currentConstr,
  setCurrentConstr,
  currentFloorSealant,
  setCurrentFloorSealant,
  currentCeilingMats,
  setCurrentCeilingMats,
  unvisible,
  onToggleVisible,
  currentSubCategory,
  currentGkla,
  setCurrentGkla,
  currentWool,
  setCurrentWool,
  profileStep,
  setProfileStep,
  constR,
  setConstR,
  dFrame,
  setDFrame,
  opening,
  setOpening,
  openings,
  onAddOpening,
  onDeleteOpening,
}) => {
  const isZIPSFacing =
    mode === "facing" &&
    Boolean(
      selectedItem?.ag_id &&
        selectedItem.ag_id.startsWith("AG.Z") &&
        selectedItem.c_id == "L"
    );
  const facingProfileStep = normalizeFacingProfileStep(profileStep);
  const lagProfileStep = normalizeLagProfileStep(profileStep);

  useEffect(() => {
    if (mode !== "facing" || isZIPSFacing) return;
    const normalized = normalizeFacingProfileStep(profileStep);
    if (normalized !== Number(profileStep)) {
      setProfileStep(normalized);
    }
  }, [mode, selectedItem?.id, isZIPSFacing, profileStep, setProfileStep]);

  useEffect(() => {
    if (
      hasEcoSWoolChoice(selectedItem?.ag_id) ||
      currentWool !== WOOL_ECO_S
    ) {
      return;
    }
    setCurrentWool("default");
  }, [selectedItem?.ag_id, currentWool, setCurrentWool]);

  useEffect(() => {
    if (mode !== "floor" || !selectedItem?.ag_id) return;
    const agId = selectedItem.ag_id;
    if (FLOOR_K2_PERIMETER_AG_IDS.has(agId)) {
      setCurrentConstr(agId);
    }
  }, [mode, selectedItem?.id, selectedItem?.ag_id, setCurrentConstr]);

  useEffect(() => {
    if (mode !== "floor" || !selectedItem?.ag_id) return;
    const agId = selectedItem.ag_id;
    if (FLOOR_K2_PERIMETER_AG_IDS.has(agId)) return;
    const validTape = floorPerimeterTapeCodes(agId);
    if (validTape.length > 0 && !validTape.includes(currentConstr)) {
      setCurrentConstr(agId);
    }
  }, [mode, selectedItem?.ag_id, selectedItem?.id, currentConstr, setCurrentConstr]);

  useEffect(() => {
    if (mode !== "ceiling" || !selectedItem?.ag_id) return;
    const agId = selectedItem.ag_id;
    if (!hasCeilingTapeChoice(agId)) {
      if (currentConstr !== agId) {
        setCurrentConstr(agId);
      }
      return;
    }
    const validTape = ceilingPerimeterTapeCodes(agId);
    if (!validTape.includes(currentConstr)) {
      setCurrentConstr(agId);
    }
  }, [mode, selectedItem?.ag_id, selectedItem?.id, currentConstr, setCurrentConstr]);

  useEffect(() => {
    if (mode !== "facing" || !selectedItem?.ag_id) return;
    const agId = selectedItem.ag_id;
    if (!hasFacingTapeChoice(agId)) {
      if (currentConstr !== agId) {
        setCurrentConstr(agId);
      }
      return;
    }
    const validTape = facingPerimeterTapeCodes(agId);
    if (!validTape.includes(currentConstr)) {
      setCurrentConstr(agId);
    }
  }, [mode, selectedItem?.ag_id, selectedItem?.id, currentConstr, setCurrentConstr]);

  useEffect(() => {
    if (!selectedItem?.ag_id || hasGklaChoice(selectedItem.ag_id)) return;
    if (currentGkla !== "default") {
      setCurrentGkla("default");
    }
  }, [selectedItem?.ag_id, currentGkla, setCurrentGkla]);

  useEffect(() => {
    if (!setCurrentCeilingMats) return;
    if (hasCeilingMatChoice(selectedItem?.ag_id)) return;
    if (Array.isArray(currentCeilingMats) && currentCeilingMats.length > 0) {
      setCurrentCeilingMats([]);
    }
  }, [selectedItem?.ag_id, currentCeilingMats, setCurrentCeilingMats]);

  if (mode === "ceiling") {
    const currentTemplate = template ?? selectedItem?.template;
    const isSuspendedCeiling = currentTemplate == 5;
    const showCeilingTapeChoice = hasCeilingTapeChoice(selectedItem?.ag_id);
    const showGklaChoice = hasGklaChoice(selectedItem?.ag_id);
    const showCeilingMatChoice = hasCeilingMatChoice(selectedItem?.ag_id);

    return (
      <div className="selected-item-forms__stack">
        <button
          type="button"
          className="counter__button_param selected-item-forms__param-btn"
          onClick={onToggleVisible}
        >
          изменить параметры конструкции
        </button>

        {unvisible && (
          <>
            {showGklaChoice && (
              <>
                <h4 className="selected-item-forms__group-heading">
                  выбрать тип гипсокартона
                </h4>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => setCurrentGkla(e.target.value)}
                    id={`ceiling_gkla_default_${selectedItem.id}`}
                    name={`ceiling_gkla_${selectedItem.id}`}
                    value="default"
                    checked={currentGkla == "default"}
                  />
                  <label
                    className="label"
                    htmlFor={`ceiling_gkla_default_${selectedItem.id}`}
                  >
                    Ветонит АКУ-лайн 2500х1200х12,5 мм
                  </label>
                </div>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => setCurrentGkla(e.target.value)}
                    id={`ceiling_gkla_2500P_${selectedItem.id}`}
                    name={`ceiling_gkla_${selectedItem.id}`}
                    value="2500P"
                    checked={currentGkla == "2500P"}
                  />
                  <label
                    className="label"
                    htmlFor={`ceiling_gkla_2500P_${selectedItem.id}`}
                  >
                    Ветонит АКУ-лайн Про 2500х1200х12,5 мм
                  </label>
                </div>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => setCurrentGkla(e.target.value)}
                    id={`ceiling_gkla_2000_${selectedItem.id}`}
                    name={`ceiling_gkla_${selectedItem.id}`}
                    value="2000"
                    checked={currentGkla == "2000"}
                  />
                  <label
                    className="label"
                    htmlFor={`ceiling_gkla_2000_${selectedItem.id}`}
                  >
                    Ветонит АКУ-лайн 2000х1200х12,5 мм
                  </label>
                </div>
              </>
            )}

            {isSuspendedCeiling && (
              <>
                <WoolChoiceRadios
                  idPrefix="ceiling"
                  itemId={selectedItem.id}
                  value={currentWool}
                  onChange={setCurrentWool}
                  showEcoS={hasEcoSWoolChoice(selectedItem?.ag_id)}
                />

                {selectedItem.id == 503 && (
                  <>
                    <h4 className="selected-item-forms__group-heading">
                      дополнительный отступ конструкции от перекрытия
                    </h4>
                    <input
                      type="number"
                      placeholder="размер,мм"
                      value={constR?.AddCeilShift || ""}
                      onChange={(e) =>
                        setConstR({
                          ...constR,
                          AddCeilShift: e.target.value,
                        })
                      }
                    />
                  </>
                )}
              </>
            )}

            {showCeilingTapeChoice && (
              <TapeChoiceRadios
                idPrefix="ceiling"
                itemId={selectedItem.id}
                agId={selectedItem.ag_id}
                value={currentConstr}
                onChange={setCurrentConstr}
              />
            )}

            {showCeilingMatChoice && (
              <CeilingMatChoiceCheckboxes
                idPrefix="ceiling"
                itemId={selectedItem.id}
                value={currentCeilingMats}
                onChange={setCurrentCeilingMats}
              />
            )}

            <SealantChoiceRadios
              idPrefix="ceiling"
              itemId={selectedItem.id}
              value={currentFloorSealant}
              onChange={setCurrentFloorSealant}
            />
          </>
        )}
      </div>
    );
  }

  if (mode === "floor") {
    const currentTemplate = template ?? selectedItem?.template;
    const needsToggle = [607.1, 608.1, 609.1, 610.1, 2.1, 3].includes(
      currentTemplate
    );
    const isPerimeterType = [607.1, 608.1, 609.1, 610.1, 2.1].includes(
      currentTemplate
    );
    const hideUlTapePerimeter = FLOOR_NO_UL_TAPE_AG_IDS.has(selectedItem?.ag_id);
    const isLagsType = currentTemplate == 3;
    const showSealantChoice = hasFloorSealantChoice({ agId: selectedItem?.ag_id });
    const showSealantUi =
      (showSealantChoice || isPerimeterType) && (!isPerimeterType || unvisible);

    const floorSealantRadios = showSealantUi ? (
      <SealantChoiceRadios
        idPrefix="floor"
        itemId={selectedItem.id}
        value={currentFloorSealant}
        onChange={setCurrentFloorSealant}
      />
    ) : null;

    return (
      <div className="selected-item-forms__stack">
        {needsToggle && (
          <button
            type="button"
            className="counter__button_param selected-item-forms__param-btn"
            onClick={onToggleVisible}
          >
            изменить параметры конструкции
          </button>
        )}

        {unvisible && isPerimeterType && (
          <>
            <h4 className="selected-item-forms__group-heading">
              выбрать тип ленты
            </h4>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`floor_default_${selectedItem.id}`}
                name={`floor_type_${selectedItem.id}`}
                value={selectedItem.ag_id}
                checked={currentConstr === selectedItem.ag_id}
              />
              <label
                className="label"
                htmlFor={`floor_default_${selectedItem.id}`}
              >
                {currentTemplate == 2.1
                  ? "Акуфлор S20 по периметру"
                  : "К2 по периметру"}
              </label>
            </div>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`floor_vibro_${selectedItem.id}`}
                name={`floor_type_${selectedItem.id}`}
                value={`${selectedItem.ag_id}_vibrostek`}
                checked={currentConstr === `${selectedItem.ag_id}_vibrostek`}
              />
              <label
                className="label"
                htmlFor={`floor_vibro_${selectedItem.id}`}
              >
                Вибростек по периметру
              </label>
            </div>
            {!hideUlTapePerimeter && (
              <div className="radio-option">
                <input
                  className="radio"
                  type="radio"
                  onChange={(e) => setCurrentConstr(e.target.value)}
                  id={`floor_ul_tape_${selectedItem.id}`}
                  name={`floor_type_${selectedItem.id}`}
                  value={`${selectedItem.ag_id}_ul_tape`}
                  checked={currentConstr === `${selectedItem.ag_id}_ul_tape`}
                />
                <label
                  className="label"
                  htmlFor={`floor_ul_tape_${selectedItem.id}`}
                >
                  Ультракустик F100 по периметру
                </label>
              </div>
            )}
          </>
        )}

        {isLagsType && (
          <>
            <h4 className="selected-item-forms__title">тип конструкции</h4>
            {unvisible && (
              <>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => {
                      setCurrentConstr(e.target.value);
                      if (lagProfileStep !== 300 && lagProfileStep !== 400) {
                        setProfileStep(400);
                      }
                    }}
                    id={`lags_silomer_${selectedItem.id}`}
                    name={`lags_type_${selectedItem.id}`}
                    value="AG.F615"
                    checked={currentConstr === "AG.F615"}
                  />
                  <label
                    className="label"
                    htmlFor={`lags_silomer_${selectedItem.id}`}
                  >
                    с применением материала Silomer
                  </label>
                </div>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => {
                      setCurrentConstr(e.target.value);
                      if (lagProfileStep !== 300 && lagProfileStep !== 400) {
                        setProfileStep(400);
                      }
                    }}
                    id={`lags_vibroflex_${selectedItem.id}`}
                    name={`lags_type_${selectedItem.id}`}
                    value="AG.F615_vibroflex_LD"
                    checked={currentConstr === "AG.F615_vibroflex_LD"}
                  />
                  <label
                    className="label"
                    htmlFor={`lags_vibroflex_${selectedItem.id}`}
                  >
                    с применением опор Виброфлекс LD
                  </label>
                </div>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => setProfileStep(Number(e.target.value))}
                    id={`lags_step400_${selectedItem.id}`}
                    name={`lags_step_${selectedItem.id}`}
                    value="400"
                    checked={lagProfileStep === 400}
                  />
                  <label
                    className="label"
                    htmlFor={`lags_step400_${selectedItem.id}`}
                  >
                    шаг профиля 400 мм
                  </label>
                </div>
                <div className="radio-option">
                  <input
                    className="radio"
                    type="radio"
                    onChange={(e) => setProfileStep(Number(e.target.value))}
                    id={`lags_step300_${selectedItem.id}`}
                    name={`lags_step_${selectedItem.id}`}
                    value="300"
                    checked={lagProfileStep === 300}
                  />
                  <label
                    className="label"
                    htmlFor={`lags_step300_${selectedItem.id}`}
                  >
                    шаг профиля 300 мм
                  </label>
                </div>
              </>
            )}
          </>
        )}

        {currentTemplate == 9 && (
          <>
            <h4 className="selected-item-forms__title">тип конструкции</h4>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`splast_20_${selectedItem.id}`}
                name={`splast_type_${selectedItem.id}`}
                value="AG.F606"
                checked={currentConstr === "AG.F606"}
              />
              <label className="label" htmlFor={`splast_20_${selectedItem.id}`}>
                толщина слоя 20 мм
              </label>
            </div>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`splast_30_${selectedItem.id}`}
                name={`splast_type_${selectedItem.id}`}
                value="AG.F606_30"
                checked={currentConstr === "AG.F606_30"}
              />
              <label className="label" htmlFor={`splast_30_${selectedItem.id}`}>
                толщина слоя 30 мм
              </label>
            </div>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`splast_40_${selectedItem.id}`}
                name={`splast_type_${selectedItem.id}`}
                value="AG.F606_40"
                checked={currentConstr === "AG.F606_40"}
              />
              <label className="label" htmlFor={`splast_40_${selectedItem.id}`}>
                толщина слоя 40 мм
              </label>
            </div>
          </>
        )}

        {currentTemplate == 9.1 && (
          <>
            <h4 className="selected-item-forms__title">тип конструкции</h4>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`tehno_350_${selectedItem.id}`}
                name={`tehno_type_${selectedItem.id}`}
                value="AG.F612"
                checked={currentConstr === "AG.F612"}
              />
              <label className="label" htmlFor={`tehno_350_${selectedItem.id}`}>
                Шумостоп-Техно 350
              </label>
            </div>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`tehno_600_${selectedItem.id}`}
                name={`tehno_type_${selectedItem.id}`}
                value="AG.F612_600"
                checked={currentConstr === "AG.F612_600"}
              />
              <label className="label" htmlFor={`tehno_600_${selectedItem.id}`}>
                Шумостоп-Техно 600
              </label>
            </div>
            <div className="radio-option">
              <input
                className="radio"
                type="radio"
                onChange={(e) => setCurrentConstr(e.target.value)}
                id={`tehno_1200_${selectedItem.id}`}
                name={`tehno_type_${selectedItem.id}`}
                value="AG.F612_1200"
                checked={currentConstr === "AG.F612_1200"}
              />
              <label
                className="label"
                htmlFor={`tehno_1200_${selectedItem.id}`}
              >
                Шумостоп-Техно 1200
              </label>
            </div>
          </>
        )}

        {floorSealantRadios}
      </div>
    );
  }

  const showFacingTapeChoice = hasFacingTapeChoice(selectedItem?.ag_id);
  const showGklaChoice = hasGklaChoice(selectedItem?.ag_id);
  const showCeilingMatChoice = hasCeilingMatChoice(selectedItem?.ag_id);

  return (
    <div className="selected-item-forms__stack">
      {showGklaChoice && (
        <>
          <h4 className="selected-item-forms__group-heading">
            выбрать тип гипсокартона
          </h4>
          <div className="radio-option">
            <input
              className="radio"
              type="radio"
              onChange={(e) => setCurrentGkla(e.target.value)}
              id={`gkla_default_${selectedItem.id}`}
              name={`gkla_${selectedItem.id}`}
              value="default"
              checked={currentGkla == "default"}
            />
            <label className="label" htmlFor={`gkla_default_${selectedItem.id}`}>
              Ветонит АКУ-лайн 2500х1200х12,5 мм
            </label>
          </div>
          <div className="radio-option">
            <input
              className="radio"
              type="radio"
              onChange={(e) => setCurrentGkla(e.target.value)}
              id={`gkla_2500P_${selectedItem.id}`}
              name={`gkla_${selectedItem.id}`}
              value="2500P"
              checked={currentGkla == "2500P"}
            />
            <label className="label" htmlFor={`gkla_2500P_${selectedItem.id}`}>
              Ветонит АКУ-лайн Про 2500x1200x12,5 мм
            </label>
          </div>
          <div className="radio-option">
            <input
              className="radio"
              type="radio"
              onChange={(e) => setCurrentGkla(e.target.value)}
              id={`gkla_2000_${selectedItem.id}`}
              name={`gkla_${selectedItem.id}`}
              value="2000"
              checked={currentGkla == "2000"}
            />
            <label className="label" htmlFor={`gkla_2000_${selectedItem.id}`}>
              Ветонит АКУ-лайн 2000х1200х12,5 мм
            </label>
          </div>
        </>
      )}

      {!isZIPSFacing && (
        <WoolChoiceRadios
          idPrefix="facing"
          itemId={selectedItem.id}
          value={currentWool}
          onChange={setCurrentWool}
          showEcoS={hasEcoSWoolChoice(selectedItem?.ag_id)}
        />
      )}

      {!isZIPSFacing && (
        <>
          <h4 className="selected-item-forms__group-heading">шаг профиля</h4>
          <div className="selected-item-forms__hint">
            ✔ шаг профиля при облицовке керамической плиткой не более 400 мм
          </div>
          <div className="radio-option">
            <input
              className="radio"
              type="radio"
              onChange={(e) => setProfileStep(Number(e.target.value))}
              id={`step600_${selectedItem.id}`}
              name={`steps_${selectedItem.id}`}
              value="600"
              checked={facingProfileStep === 600}
            />
            <label className="label" htmlFor={`step600_${selectedItem.id}`}>
              шаг профиля 600 мм{" "}
              {(() => {
                const maxHeight = getMaxLenZInMeters(
                  selectedItem.id,
                  600,
                  currentSubCategory
                );
                return maxHeight
                  ? `(макс.высота конструкции ${maxHeight} м)`
                  : "";
              })()}
            </label>
          </div>
          <div className="radio-option">
            <input
              className="radio"
              type="radio"
              onChange={(e) => setProfileStep(Number(e.target.value))}
              id={`step400_${selectedItem.id}`}
              name={`steps_${selectedItem.id}`}
              value="400"
              checked={facingProfileStep === 400}
            />
            <label className="label" htmlFor={`step400_${selectedItem.id}`}>
              шаг профиля 400 мм{" "}
              {(() => {
                const maxHeight = getMaxLenZInMeters(
                  selectedItem.id,
                  400,
                  currentSubCategory
                );
                return maxHeight
                  ? `(макс.высота конструкции ${maxHeight} м)`
                  : "";
              })()}
            </label>
          </div>
          <div className="radio-option">
            <input
              className="radio"
              type="radio"
              onChange={(e) => setProfileStep(Number(e.target.value))}
              id={`step300_${selectedItem.id}`}
              name={`steps_${selectedItem.id}`}
              value="300"
              checked={facingProfileStep === 300}
            />
            <label className="label" htmlFor={`step300_${selectedItem.id}`}>
              шаг профиля 300 мм{" "}
              {(() => {
                const maxHeight = getMaxLenZInMeters(
                  selectedItem.id,
                  300,
                  currentSubCategory
                );
                return maxHeight
                  ? `(макс.высота конструкции ${maxHeight} м)`
                  : "";
              })()}
            </label>
          </div>
        </>
      )}

      {!isZIPSFacing && (
        <div className="radio-option">
          <input
            className="checkbox"
            type="checkbox"
            onChange={(e) => setDFrame(e.target.checked)}
            id={`dframe_${selectedItem.id}`}
            checked={dFrame}
          />
          <label className="label" htmlFor={`dframe_${selectedItem.id}`}>
            добавить сдвоенный каркас
          </label>
        </div>
      )}

      {showFacingTapeChoice && (
        <TapeChoiceRadios
          idPrefix="facing"
          itemId={selectedItem.id}
          agId={selectedItem.ag_id}
          value={currentConstr}
          onChange={setCurrentConstr}
        />
      )}

      {showCeilingMatChoice && (
        <CeilingMatChoiceCheckboxes
          idPrefix="facing"
          itemId={selectedItem.id}
          value={currentCeilingMats}
          onChange={setCurrentCeilingMats}
        />
      )}

      <SealantChoiceRadios
        idPrefix="facing"
        itemId={selectedItem.id}
        value={currentFloorSealant}
        onChange={setCurrentFloorSealant}
      />

      <h4 className="selected-item-forms__group-heading">размер проема</h4>
      <input
        type="number"
        placeholder="ширина проема,мм"
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
        placeholder="высота проема,мм"
        value={opening.lenZ || ""}
        onChange={(e) =>
          setOpening({
            ...opening,
            lenZ: e.target.value,
          })
        }
      />
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
          id={`doors_${selectedItem.id}`}
          name={`opening_${selectedItem.id}`}
          value="OST_Doors"
          checked={opening.Type == "OST_Doors"}
        />
        <label className="label" htmlFor={`doors_${selectedItem.id}`}>
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
          id={`wind_${selectedItem.id}`}
          name={`opening_${selectedItem.id}`}
          value="OST_Windows"
          checked={opening.Type == "OST_Windows"}
        />
        <label className="label" htmlFor={`wind_${selectedItem.id}`}>
          окно
        </label>
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
        <div
          className="tbl-in"
          style={{
            marginTop: "10px",
            width: "100%",
          }}
        >
          <table className="data" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th
                  colSpan="3"
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                >
                  список проемов
                </th>
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
                  <td style={{ textAlign: "center" }}>
                    {op.Type == "OST_Doors" ? "дверь" : "окно"}
                  </td>
                  <td style={{ textAlign: "center" }}>
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
                      style={{
                        height: "30px",
                        opacity: 0.7,
                        cursor: "pointer",
                      }}
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

export default ConstructionParameters;
