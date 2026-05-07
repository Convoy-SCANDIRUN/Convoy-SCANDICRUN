import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminDashboard from "@/pages/AdminDashboard";
import ParticipantDashboard from "@/pages/ParticipantDashboard";
import JoinRedirect from "@/pages/JoinRedirect";
import InstallPrompt from "@/components/InstallPrompt";
import { Toaster } from "@/components/ui/sonner";

function Protected({ children, role }) {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-zinc-500 text-xs uppercase tracking-[0.3em]">
                Loading…
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (role && user.role !== role) {
        return <Navigate to={user.role === "admin" ? "/admin" : "/participant"} replace />;
    }
    return children;
}

function RootRedirect() {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.role === "admin" ? "/admin" : "/participant"} replace />;
}

export default function App() {
    // Reposition the platform "Made with Emergent" badge to the bottom-center
    // so it never overlaps our SOS button on small screens. The badge sets its
    // own inline !important styles, so we have to force it via JS.
    useEffect(() => {
        const reposition = () => {
            const b = document.getElementById("emergent-badge");
            if (!b) return;
            b.style.setProperty("left", "50%", "important");
            b.style.setProperty("right", "auto", "important");
            b.style.setProperty("transform", "translateX(-50%)", "important");
            b.style.setProperty("bottom", "6px", "important");
            b.style.setProperty("z-index", "1099", "important");
        };
        reposition();
        const obs = new MutationObserver(reposition);
        obs.observe(document.body, { childList: true, subtree: true });
        const t = setInterval(reposition, 1500);
        return () => { obs.disconnect(); clearInterval(t); };
    }, []);

    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/join/:code" element={<JoinRedirect />} />
                    <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
                    <Route path="/participant" element={<Protected role="participant"><ParticipantDashboard /></Protected>} />
                </Routes>
            </BrowserRouter>
            <Toaster
                theme="dark"
                position="top-right"
                toastOptions={{
                    style: {
                        background: "#141414",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "0",
                        color: "#fff",
                    },
                }}
            />
            <InstallPrompt />
        </AuthProvider>
    );
}
