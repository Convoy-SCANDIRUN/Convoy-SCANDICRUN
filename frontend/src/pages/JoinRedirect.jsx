import { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Captures /join/:code, stashes it for the join form, then routes user
// to the right place (login/register if guest, participant dashboard otherwise).
export default function JoinRedirect() {
    const { code } = useParams();
    const { user, loading } = useAuth();

    useEffect(() => {
        if (code) sessionStorage.setItem("rt_pending_event_code", code.toUpperCase());
    }, [code]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/participant" replace />;
}
