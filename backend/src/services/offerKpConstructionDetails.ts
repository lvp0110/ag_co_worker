import type { ConstructionCatalogEntry } from "./catalogData.js";
import { loadCompositionMaterialNames } from "./constructionComposition.js";
import {
  constructionDisplayCipher,
  constructionKpCardHeading,
  constructionTypeFromCalcParams,
  normalizeCatalogCipher,
  resolveDisplayCipher,
  shouldOmitConstructionInfoInPdf,
} from "../utils/constructionKpDisplay.js";
import { resolveConstrImageFetchUrl } from "../utils/constrImageUrl.js";
import { fetchImageAsDataUri } from "../utils/fetchImageDataUri.js";
import {
  zipsCeilingCadFilename,
  zipsCeilingPreviewFilename,
} from "../utils/zipsCeilingCad.js";
import type { OfferForRender } from "../templates/offerKp.js";

const esc = (s: unknown): string => {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const specRow = (label: string, value: string): string => {
  if (!value.trim()) return "";
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
};

const isZipsCeilingSection = (
  calcParams: Record<string, unknown> | null
): boolean => constructionTypeFromCalcParams(calcParams) === "ПОТОЛОК";

const resolvePreviewImageRef = (
  cipher: string,
  entry: ConstructionCatalogEntry | undefined,
  calcParams: Record<string, unknown> | null
): string | null => {
  if (isZipsCeilingSection(calcParams)) {
    const zips = zipsCeilingPreviewFilename(cipher);
    if (zips) return zips;
  }
  return entry?.img ?? null;
};

const resolveCadImageRef = (
  cipher: string,
  entry: ConstructionCatalogEntry | undefined,
  calcParams: Record<string, unknown> | null
): string | null => {
  if (isZipsCeilingSection(calcParams)) {
    const zips = zipsCeilingCadFilename(cipher);
    if (zips) return zips;
  }
  return entry?.cadImg ?? null;
};

type ConstructionBlockInput = {
  heading: string;
  cipher: string;
  entry: ConstructionCatalogEntry | undefined;
  calcParams: Record<string, unknown> | null;
  composition: string[];
};

const buildOneConstructionBlock = async (input: ConstructionBlockInput): Promise<string> => {
  const { heading, cipher, entry, calcParams, composition } = input;
  const specification = entry?.specification?.trim() ?? "";
  const calcCode =
    typeof calcParams?.Code === "string" ? calcParams.Code.trim() : "";
  const displayCipher = constructionDisplayCipher({
    agId: cipher,
    calcCode,
  });

  const metricsHtml = [
    specRow("Шифр конструкции", displayCipher),
    specRow("Толщина, мм", entry?.thickness ?? ""),
    specRow("Индекс звукоизоляции воздушного шума, Rw", entry?.soundIndex ?? ""),
    entry?.impactNoiseIndex != null
      ? specRow("Индекс звукоизоляции ударного шума, Lnw", String(entry.impactNoiseIndex))
      : "",
  ]
    .filter(Boolean)
    .join("");

  const specificationHtml =
    specification !== ""
      ? `<div class="construction-info__specification"><h4 class="construction-info__subtitle">Характеристики и применение</h4><p class="construction-info__specification-text">${esc(specification)}</p></div>`
      : "";

  const compositionHtml =
    composition.length > 0
      ? `<div class="construction-info__composition-block"><h4 class="construction-info__subtitle">Состав конструкции</h4><ul class="construction-info__composition">${composition
          .map((name) => `<li>${esc(name)}</li>`)
          .join("")}</ul></div>`
      : "";

  const imgRef = resolvePreviewImageRef(cipher, entry, calcParams);
  const cadRef = resolveCadImageRef(cipher, entry, calcParams);

  const previewUrl = imgRef ? resolveConstrImageFetchUrl(imgRef) : null;
  const cadUrl = cadRef ? resolveConstrImageFetchUrl(cadRef) : null;
  const [previewUri, cadUri] = await Promise.all([
    previewUrl ? fetchImageAsDataUri(previewUrl) : null,
    cadUrl ? fetchImageAsDataUri(cadUrl) : null,
  ]);

  const figure = (uri: string | null): string => {
    if (!uri) return "";
    return `<figure class="construction-info__figure"><img src="${uri}" alt="" /></figure>`;
  };

  const previewFigure = figure(previewUri);
  const cadFigure = figure(cadUri);

  const hasMetrics = metricsHtml.length > 0;
  const hasImagesRow = previewFigure || cadFigure;
  const hasMiddleRow = hasMetrics || compositionHtml;
  const hasBody = hasImagesRow || hasMiddleRow || specificationHtml;
  if (!hasBody) return "";

  const gridHtml =
    hasImagesRow || hasMiddleRow
      ? `<div class="construction-info__grid">${previewFigure || '<div class="construction-info__slot"></div>'}${cadFigure || '<div class="construction-info__slot"></div>'}${hasMetrics ? `<div class="construction-info__metrics"><h4 class="construction-info__subtitle construction-info__subtitle--spacer" aria-hidden="true">Состав конструкции</h4><table class="construction-info__specs"><tbody>${metricsHtml}</tbody></table></div>` : '<div class="construction-info__slot"></div>'}${compositionHtml || '<div class="construction-info__slot"></div>'}</div>`
      : "";

  return `
  <section class="construction-info">
    <h3 class="construction-info__heading">${esc(heading)}</h3>
    ${gridHtml}
    ${specificationHtml}
  </section>`;
};

/**
 * HTML-блок «Информация о конструкциях» для PDF (характеристики, состав, фото, чертёж).
 */
export const buildConstructionDetailsHtml = async (
  offer: OfferForRender,
  catalog: Map<string, ConstructionCatalogEntry>
): Promise<string> => {
  const constructions = [...(offer.constructions || [])].sort((a, b) => a.position - b.position);
  if (constructions.length === 0) return "";

  const cipherById = new Map<string, string>();
  const uniqueCiphers = new Set<string>();
  for (const c of constructions) {
    if (shouldOmitConstructionInfoInPdf(c.calc_params, catalog)) continue;
    const calcCode =
      typeof c.calc_params?.Code === "string" ? c.calc_params.Code.trim() : "";
    const cipher = normalizeCatalogCipher(
      calcCode,
      resolveDisplayCipher(calcCode, catalog)
    );
    if (cipher) {
      cipherById.set(c.id, cipher);
      uniqueCiphers.add(cipher);
    }
  }

  const compositionByCipher = new Map<string, string[]>();
  await Promise.all(
    [...uniqueCiphers].map(async (cipher) => {
      const list = await loadCompositionMaterialNames(cipher);
      compositionByCipher.set(cipher, list);
    })
  );

  const blocks = await Promise.all(
    constructions.map(async (c) => {
      if (shouldOmitConstructionInfoInPdf(c.calc_params, catalog)) return "";
      const cipher = cipherById.get(c.id) ?? "";
      const entry = cipher ? catalog.get(cipher) : undefined;
      const heading = constructionKpCardHeading(c.calc_params, catalog);
      return buildOneConstructionBlock({
        heading,
        cipher,
        entry,
        calcParams: c.calc_params,
        composition: cipher ? compositionByCipher.get(cipher) ?? [] : [],
      });
    })
  );

  const inner = blocks.filter(Boolean).join("");
  if (!inner) return "";

  return `<div class="construction-info-wrap"><div class="construction-info-wrap__rules" aria-hidden="true"><hr /><hr /></div><h2 class="construction-info-wrap__title">Информация о конструкциях</h2>${inner}</div>`;
};
