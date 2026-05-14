import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await login(email, password);
            toast.success(`Welcome back, ${u.name}`);
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
                        <p className="font-display text-3xl font-black tracking-tight uppercase leading-none">
                            Convoy
                        </p>
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">
                            Tactical Tracker
                        </p>
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-5" data-testid="login-form">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">
                            Email
                        </Label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            data-testid="login-email-input"
                            className="bg-transparent border-white/20 focus-visible:ring-[#007AFF] rounded-none h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">
                            Password
                        </Label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            data-testid="login-password-input"
                            className="bg-transparent border-white/20 focus-visible:ring-[#007AFF] rounded-none h-12"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={submitting}
                        data-testid="login-submit-button"
                        className="w-full h-12 bg-[#007AFF] hover:bg-[#005bb5] rounded-none font-bold uppercase tracking-[0.2em]"
                    >
                        {submitting ? "Signing in…" : "Sign In"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-400">
                    No account?{" "}
                    <Link to="/register" className="text-[#007AFF] hover:underline" data-testid="register-link">
                        Create one
                    </Link>
                </p>
                <p className="mt-2 text-center text-xs">
                    <Link to="/forgot-password" className="text-zinc-500 hover:text-zinc-300 uppercase tracking-[0.25em]" data-testid="forgot-password-link">
                        Forgot password?
                    </Link>
                </p>
            </div>
        </div>
    );
}
