import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Compass } from "lucide-react";

export default function Register() {
    const { register } = useAuth();
    const nav = useNavigate();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("participant");
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await register({ name, email, password, role });
            toast.success(`Account created — welcome, ${u.name}`);
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
                    <Compass className="w-8 h-8 text-[#007AFF]" />
                    <div>
                        <p className="font-display text-3xl font-black uppercase leading-none">Create Account</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">
                            Join the convoy
                        </p>
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-5" data-testid="register-form">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">Display name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} required
                               data-testid="register-name-input"
                               className="bg-transparent border-white/20 rounded-none h-12 focus-visible:ring-[#007AFF]" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">Email</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                               data-testid="register-email-input"
                               className="bg-transparent border-white/20 rounded-none h-12 focus-visible:ring-[#007AFF]" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">Password</Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                               data-testid="register-password-input"
                               className="bg-transparent border-white/20 rounded-none h-12 focus-visible:ring-[#007AFF]" />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-[0.2em] font-bold text-zinc-300">Role</Label>
                        <RadioGroup value={role} onValueChange={setRole} className="grid grid-cols-2 gap-3" data-testid="register-role-group">
                            <label className={`flex items-center gap-2 p-3 border cursor-pointer ${role === "participant" ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/15"}`}>
                                <RadioGroupItem value="participant" data-testid="role-participant" />
                                <span className="text-sm uppercase tracking-wider">Participant</span>
                            </label>
                            <label className={`flex items-center gap-2 p-3 border cursor-pointer ${role === "admin" ? "border-[#007AFF] bg-[#007AFF]/10" : "border-white/15"}`}>
                                <RadioGroupItem value="admin" data-testid="role-admin" />
                                <span className="text-sm uppercase tracking-wider">Administrator</span>
                            </label>
                        </RadioGroup>
                    </div>
                    <Button type="submit" disabled={submitting} data-testid="register-submit-button"
                            className="w-full h-12 bg-[#007AFF] hover:bg-[#005bb5] rounded-none font-bold uppercase tracking-[0.2em]">
                        {submitting ? "Creating…" : "Create Account"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-400">
                    Already have an account?{" "}
                    <Link to="/login" className="text-[#007AFF] hover:underline" data-testid="login-link">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
