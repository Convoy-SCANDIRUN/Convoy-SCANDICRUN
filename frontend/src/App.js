import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AdminDashboard from "@/pages/AdminDashboard";
import ParticipantDashboard from "@/pages/ParticipantDashboard";
import JoinRedirect from "@/pages/JoinRedirect";
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
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
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
        </AuthProvider>
    );
}
