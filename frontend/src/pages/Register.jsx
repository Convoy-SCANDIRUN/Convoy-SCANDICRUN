import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";
import LanguagePicker from "@/components/LanguagePicker";
import usePush from "@/lib/usePush";

export default function Register() {
    const { t } = useTranslation();
    const { register } = useAuth();
    const nav = useNavigate();
    const { isSupported: pushSupported, subscribe: pushSubscribe } = usePush();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("participant");
    const [adminCode, setAdminCode] = useState("");
    const [pushOptIn, setPushOptIn] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const payload = { name, email, password, role };
            if (role === "admin") payload.admin_code = adminCode;
            const u = await register(payload);
            toast.success(t("auth.registerSuccess", { name: u.name }));
            // Auto-subscribe to push if the user opted in. Permission must be
            // requested AFTER the auth context updates so the /push/subscribe
            // call carries the new token, and INSIDE this click handler so it
            // still counts as a user gesture in Safari / Chrome.
            if (pushOptIn && pushSupported) {
                const res = await pushSubscribe();
                if (res.ok) toast.success(t("auth.notificationsEnabled"));
                else if (res.reason === "denied") toast.info(t("auth.notificationsBlocked"));
            }
            nav(u.role === "admin" ? "/admin" : "/participant");
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative tactical-grid">
            <div
                className="absolute inset-0 bg-cover bg-center opacity-30"
                style={{
                    backgroundImage:
                        'url(https://images.unsplash.com/photo-1766198971304-32d71f18745c?crop=entropy&cs=srgb&fm=jpg&w=1920&q=70)',
                }}
            />
            <div className="absolute inset-0 bg-black/70" />

            <div className="relative z-10 w-full max-w-md p-8 glass">
                <div className="flex items-center gap-3 mb-8">
                    <BrandLogo className="w-12 h-12" />
                    <div>
                        <p className="font-display text-3xl font-black uppercase leading-none">{t("auth.register")}</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">
                            {t("brand.subtitle")}
                        </p>
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-5" data-testid="register-form">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">{t("auth.name")}</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} required
                               data-testid="register-name-input"
                               className="bg-transparent border-white/20 rounded-none h-12 focus-visible:ring-[#007AFF]" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">{t("auth.email")}</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                               data-testid="register-email-input"
                               className="bg-transparent border-white/20 rounded-none h-12 focus-visible:ring-[#007AFF]" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">{t("auth.password")}</Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                               data-testid="register-password-input"
                               className="bg-transparent border-white/20 rounded-none h-12 focus-visible:ring-[#007AFF]" />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">{t("auth.role")}</Label>
                        <RadioGroup value={role} onValueChange={setRole} className="grid grid-cols-2 gap-3" data-testid="register-role-group">
                            <div role="button" onClick={() => setRole("participant")}
                                 className={`flex items-center gap-2 p-3 border cursor-pointer ${role === "participant" ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/15"}`}>
                                <RadioGroupItem value="participant" data-testid="role-participant" />
                                <span className="text-sm uppercase tracking-wider">{t("auth.roleParticipant")}</span>
                            </div>
                            <div role="button" onClick={() => setRole("admin")}
                                 className={`flex items-center gap-2 p-3 border cursor-pointer ${role === "admin" ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/15"}`}>
                                <RadioGroupItem value="admin" data-testid="role-admin" />
                                <span className="text-sm uppercase tracking-wider">{t("auth.roleAdmin")}</span>
                            </div>
                        </RadioGroup>
                    </div>
                    {role === "admin" && (
                        <div className="space-y-2" data-testid="admin-code-section">
                            <Label className="text-xs uppercase tracking-[0.2em] font-bold text-[#FFCC00]">
                                {t("auth.adminCode")}
                            </Label>
                            <Input
                                type="password"
                                value={adminCode}
                                onChange={(e) => setAdminCode(e.target.value)}
                                required
                                placeholder={t("auth.adminCodeHint")}
                                data-testid="admin-code-input"
                                className="bg-transparent border-[#FFCC00]/40 rounded-none h-12 focus-visible:ring-[#FFCC00]"
                            />
                        </div>
                    )}
                    {pushSupported && (
                        <div className="border border-white/15 p-3" data-testid="push-consent-section">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <Checkbox
                                    checked={pushOptIn}
                                    onCheckedChange={(v) => setPushOptIn(!!v)}
                                    data-testid="push-consent-checkbox"
                                    className="mt-0.5"
                                />
                                <div className="text-xs leading-relaxed">
                                    <p className="font-bold uppercase tracking-wider">{t("auth.pushConsent")}</p>
                                    <p className="text-zinc-400 mt-1">{t("auth.pushConsentBody")}</p>
                                </div>
                            </label>
                        </div>
                    )}
                    <Button type="submit" disabled={submitting} data-testid="register-submit-button"
                            className="w-full h-12 bg-[#007AFF] hover:bg-[#005bb5] rounded-none font-bold uppercase tracking-[0.2em]">
                        {submitting ? t("auth.registering") : t("auth.register")}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-400">
                    {t("auth.alreadyHaveAccount")}{" "}
                    <Link to="/login" className="text-[#007AFF] hover:underline" data-testid="login-link">{t("auth.signInLink")}</Link>
                </p>
                <div className="mt-6 pt-4 border-t border-white/10">
                    <LanguagePicker compact />
                </div>
            </div>
        </div>
    );
}
