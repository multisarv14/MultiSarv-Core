/** Panel chya 4 bhasha — server (`noai/functions/src/i18n.ts`) sobat same codes. */
export const LANG_CODES = ["en", "hi", "mr", "gu"] as const;
export type Lang = (typeof LANG_CODES)[number];

/** Ek string, charhi bhashet. Ekhadi bhasha rahili tar compile error. */
export type Tr = Record<Lang, string>;

export const defineMessages = <T extends Record<string, Tr>>(m: T) => m;
