export type Gender = "m" | "f" | "n";

const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_N = ["", "одно", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

// Группы разрядов: единицы, тысячи (ж.р.), миллионы (м.р.), миллиарды (м.р.), триллионы.
const GROUP_FORMS: Array<readonly [string, string, string]> = [
  ["", "", ""],
  ["тысяча", "тысячи", "тысяч"],
  ["миллион", "миллиона", "миллионов"],
  ["миллиард", "миллиарда", "миллиардов"],
  ["триллион", "триллиона", "триллионов"],
];
const GROUP_GENDER: Gender[] = ["m", "f", "m", "m", "m"];

const onesByGender = (gender: Gender): readonly string[] =>
  gender === "f" ? ONES_F : gender === "n" ? ONES_N : ONES_M;

function tripletToWords(n: number, gender: Gender): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const t = Math.floor(rem / 10);
  const u = rem % 10;
  if (h) parts.push(HUNDREDS[h]);
  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]);
  } else {
    if (t) parts.push(TENS[t]);
    if (u) parts.push(onesByGender(gender)[u]);
  }
  return parts.join(" ");
}

export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(Math.floor(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function numberToWordsRu(n: number, gender: Gender = "m"): string {
  if (!Number.isFinite(n)) return "";
  const value = Math.floor(Math.abs(n));
  if (value === 0) return "ноль";

  // Бьём на тройки разрядов справа налево.
  const groups: number[] = [];
  let x = value;
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }

  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const groupGender: Gender = i === 0 ? gender : GROUP_GENDER[i];
    out.push(tripletToWords(g, groupGender));
    if (i > 0) out.push(pluralRu(g, GROUP_FORMS[i]));
  }

  const result = (n < 0 ? "минус " : "") + out.join(" ");
  return result.replace(/\s+/g, " ").trim();
}

/**
 * 787657.00 → "Семьсот восемьдесят семь тысяч шестьсот пятьдесят семь рублей 00 копеек"
 */
export function rublesToWordsRu(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const total = Math.round(safe * 100);
  const rubles = Math.floor(total / 100);
  const kopecks = total - rubles * 100;
  const rubWords = numberToWordsRu(rubles, "m");
  const rubForm = pluralRu(rubles, ["рубль", "рубля", "рублей"]);
  const kopForm = pluralRu(kopecks, ["копейка", "копейки", "копеек"]);
  const capitalized = rubWords.charAt(0).toUpperCase() + rubWords.slice(1);
  const kopStr = String(kopecks).padStart(2, "0");
  return `${capitalized} ${rubForm} ${kopStr} ${kopForm}`;
}
