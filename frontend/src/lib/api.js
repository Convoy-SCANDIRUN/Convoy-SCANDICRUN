import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// Attach Bearer token from localStorage as fallback (cookie may be blocked cross-site)
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("rt_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const fileUrl = (path) => (path ? `${API}/files/${path}` : null);

export function formatApiError(err) {
    const detail = err?.response?.data?.detail;
    if (detail == null) return err?.message || "Something went wrong";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
    return String(detail);
}

export default api;
