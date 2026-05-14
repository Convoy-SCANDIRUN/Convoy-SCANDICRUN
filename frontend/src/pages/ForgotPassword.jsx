import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Copy } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [resetLink, setResetLink] = useState("");
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data } = await api.post("/auth/forgot-password", { email });
            setResetLink(data.reset_link || "");
            setDone(true);
            toast.success("If that email is registered, a reset link has been issued");
        } catch (err) {
            toast.error(formatApiError(err));
        } finally {
            setSubmitting(false);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(resetLink);
            toast.success("Link copied");
        } catch { toast.error("Could not copy"); }
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
                        <p className="font-display text-3xl font-black uppercase leading-none">
                            Reset Password
                        </p>
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">
                            Get a new access link
                        </p>
                    </div>
                </div>

                {!done ? (
                    <form onSubmit={submit} className="space-y-5" data-testid="forgot-form">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">
                                Email
                            </Label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                data-testid="forgot-email-input"
                                className="bg-transparent border-white/20 focus-visible:ring-[#007AFF] rounded-none h-12"
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={submitting}
                            data-testid="forgot-submit-button"
                            className="w-full h-12 bg-[#007AFF] hover:bg-[#005bb5] rounded-none font-bold uppercase tracking-[0.2em]"
                        >
                            {submitting ? "Sending…" : "Send Reset Link"}
                        </Button>
                    </form>
                ) : (
                    <div className="space-y-5" data-testid="forgot-success">
                        <p className="text-sm text-zinc-300 leading-relaxed">
                            If <span className="text-[#007AFF] font-bold">{email}</span> is registered,
                            a reset link has been issued. It expires in 1 hour.
                        </p>
                        {resetLink && (
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase tracking-[0.3em] text-[#FFCC00]">
                                    Dev preview · use this link to reset
                                </Label>
                                <div className="flex items-center gap-2 border border-[#FFCC00]/40 px-3 py-2">
                                    <code className="text-[11px] text-zinc-300 truncate flex-1" data-testid="reset-link">
                                        {resetLink}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={copy}
                                        data-testid="copy-reset-link"
                                        className="text-zinc-400 hover:text-white p-1"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-[10px] text-zinc-500 leading-relaxed">
                                    Email delivery isn't configured yet — once you wire up an email
                                    provider, this link will be sent automatically instead of shown here.
                                </p>
                            </div>
                        )}
                        <Link
                            to="/login"
                            data-testid="back-to-login"
                            className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-400 hover:text-white"
                        >
                            <ArrowLeft className="w-3 h-3" /> Back to sign in
                        </Link>
                    </div>
                )}

                {!done && (
                    <Link
                        to="/login"
                        data-testid="forgot-back-link"
                        className="mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-300"
                    >
                        <ArrowLeft className="w-3 h-3" /> Back to sign in
                    </Link>
                )}
            </div>
        </div>
    );
}
