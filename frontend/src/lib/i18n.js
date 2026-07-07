import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en";
import de from "@/locales/de";
import nl from "@/locales/nl";

/**
 * Convoy i18n setup.
 *
 * Language selection priority (handled by `LanguageDetector`):
 *   1. Explicit choice saved in `localStorage.i18nextLng`
 *   2. `<html lang>` attribute
 *   3. `navigator.language`
 *
 * Users can override at any time via the Language picker in Settings —
 * that call persists to localStorage automatically.
 */
i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: { en: { translation: en }, de: { translation: de }, nl: { translation: nl } },
        fallbackLng: "en",
        supportedLngs: ["en", "de", "nl"],
        interpolation: { escapeValue: false },
        detection: {
            order: ["localStorage", "htmlTag", "navigator"],
            caches: ["localStorage"],
            lookupLocalStorage: "i18nextLng",
        },
        returnEmptyString: false,
    });

export const SUPPORTED_LANGS = [
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "de", label: "Deutsch", flag: "🇩🇪" },
    { code: "nl", label: "Nederlands", flag: "🇳🇱" },
];

export default i18n;
