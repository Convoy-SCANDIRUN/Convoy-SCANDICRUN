import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import i18n, { SUPPORTED_LANGS } from "@/lib/i18n";

/** Compact language picker. Renders as a segmented control of flag+label
 *  buttons. Changes take effect immediately and are persisted by i18next's
 *  LanguageDetector into localStorage. */
export default function LanguagePicker({ compact = false }) {
    const { i18n: i18nHook, t } = useTranslation();
    const current = i18nHook.language?.split("-")[0] || "en";
    const change = async (code) => {
        await i18n.changeLanguage(code);
    };
    return (
        <div className="space-y-2" data-testid="language-picker">
            {!compact && (
                <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 font-bold flex items-center gap-2">
                    <Languages className="w-3 h-3" /> {t("profile.languageHeader")}
                </p>
            )}
            <div className="grid grid-cols-3 gap-1">
                {SUPPORTED_LANGS.map((lang) => (
                    <button key={lang.code}
                            type="button"
                            onClick={() => change(lang.code)}
                            data-testid={`language-option-${lang.code}`}
                            className={`px-2 py-2 border transition text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 ${
                                current === lang.code
                                    ? "border-[#007AFF] bg-[#007AFF]/15 text-white"
                                    : "border-white/15 hover:bg-white/5 text-zinc-300"
                            }`}>
                        <span aria-hidden="true">{lang.flag}</span>
                        <span>{lang.label}</span>
                    </button>
                ))}
            </div>
            {!compact && (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {t("profile.languageHint")}
                </p>
            )}
        </div>
    );
}
