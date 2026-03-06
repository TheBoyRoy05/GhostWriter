window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "GHOST_WRITER_CONNECT") return;

  const { session, supabaseUrl, supabaseAnonKey, linkedin } = event.data;
  if (!session?.access_token || !supabaseUrl || !supabaseAnonKey || !linkedin) return;

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    window.postMessage({ type: "GHOST_WRITER_CONNECTED", success: false }, "*");
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "SESSION_CONNECTED",
      session,
      supabaseUrl,
      supabaseAnonKey,
      linkedin,
    },
    (response) => {
      if (response?.ok) {
        window.postMessage({ type: "GHOST_WRITER_CONNECTED", success: true }, "*");
      } else {
        window.postMessage({ type: "GHOST_WRITER_CONNECTED", success: false }, "*");
      }
    }
  );
});
