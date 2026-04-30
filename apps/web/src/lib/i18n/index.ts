import { copyEn } from "./copy.en";
import { copyZhCN } from "./copy.zh-CN";
import { copyZhHK } from "./copy.zh-HK";
import type { AppLocale } from "../locale";

export const siteCopy = {
  en: copyEn,
  "zh-HK": copyZhHK,
  "zh-CN": copyZhCN,
} satisfies Record<AppLocale, Record<keyof typeof copyEn, string>>;
