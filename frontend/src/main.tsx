import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { useAuthStore } from "./stores/authStore";

useAuthStore.getState().init();

createRoot(document.getElementById("root")!).render(<App />);
