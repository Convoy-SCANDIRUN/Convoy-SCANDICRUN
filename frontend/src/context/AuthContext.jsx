import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null = unknown, false = not logged in, object = user
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/auth/me");
                setUser(data);
            } catch {
                setUser(false);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        if (data.token) localStorage.setItem("rt_token", data.token);
        setUser(data.user);
        return data.user;
    };

    const register = async (payload) => {
        const { data } = await api.post("/auth/register", payload);
        if (data.token) localStorage.setItem("rt_token", data.token);
        setUser(data.user);
        return data.user;
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch (_) {}
        localStorage.removeItem("rt_token");
        setUser(false);
    };

    const deleteAccount = async () => {
        await api.delete("/auth/me");
        localStorage.removeItem("rt_token");
        setUser(false);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, deleteAccount, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
