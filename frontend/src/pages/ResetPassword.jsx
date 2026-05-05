import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Compass, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
    const [params] = useSearchParams();
    const token = params.get("token") || "";
    const nav = useNavigate();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        if (password !== confirm) {
            toast.error("Passwords don't match");
            return;
        }
        setSubmitting(true);
        try {
            await api.post("/auth/reset-password", { token, password });
            toast.success("Password updated — you can sign in");
            nav("/login");
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
                    <Compass className="w-8 h-8 text-[#007AFF]" />
                    <div>
                        <p className="font-display text-3xl font-black uppercase leading-none">
                            Set New Password
                        </p>
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">
                            Choose a strong password
                        </p>
                    </div>
                </div>

                {!token ? (
                    <p className="text-sm text-zinc-300" data-testid="reset-no-token">
                        Missing reset token. Open the link from your reset email or request a new one.
                    </p>
                ) : (
                    <form onSubmit={submit} className="space-y-5" data-testid="reset-form">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">
                                New password
                            </Label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                data-testid="reset-password-input"
                                className="bg-transparent border-white/20 focus-visible:ring-[#007AFF] rounded-none h-12"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">
                                Confirm password
                            </Label>
                            <Input
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                required
                                minLength={6}
                                data-testid="reset-confirm-input"
                                className="bg-transparent border-white/20 focus-visible:ring-[#007AFF] rounded-none h-12"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={submitting}
                            data-testid="reset-submit-button"
                            className="w-full h-12 bg-[#007AFF] hover:bg-[#005bb5] rounded-none font-bold uppercase tracking-[0.2em]"
                        >
                            {submitting ? "Updating…" : "Update Password"}
                        </Button>
                    </form>
                )}

                <Link
                    to="/login"
                    data-testid="reset-back-link"
                    className="mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-300"
                >
                    <ArrowLeft className="w-3 h-3" /> Back to sign in
                </Link>
            </div>
        </div>
    );
}
