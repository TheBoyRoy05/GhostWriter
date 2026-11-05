import { mergeConfig } from "vite";
import base from "../vite.config.ts";
import { API_PORT, WEB_PORT } from "./ports.ts";

export default mergeConfig(base, {
  server: { port: WEB_PORT, proxy: { "/api": `http://127.0.0.1:${API_PORT}` } },
});
