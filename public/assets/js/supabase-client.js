// ============================================================
// public/assets/js/supabase-client.js
// ============================================================
// Loads Supabase creds from /config.json (served by the backend from env vars)
// so keys never live in git history. See README for the required env vars.
// ============================================================

const CONFIG_ENDPOINT = "/config.json";

async function loadSupabaseConfig() {
  if (window.__CHEMSUS_CONFIG) return window.__CHEMSUS_CONFIG;
  try {
    const res = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();
    window.__CHEMSUS_CONFIG = cfg;
    return cfg;
  } catch (err) {
    console.error("[ChemSus] Unable to load Supabase config", err);
    return null;
  }
}

const supabaseReady = (async () => {
  const cfg = await loadSupabaseConfig();
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.error("[ChemSus] Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY env vars on the server.");
    return null;
  }
  if (typeof supabase === "undefined") {
    console.warn("[ChemSus] Supabase JS library not loaded. Check CDN link.");
    return null;
  }

  window.supabaseClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  window.ADMIN_EMAIL = cfg.adminEmail || "";
  return window.supabaseClient;
})();

// Auto-update the navbar auth button on every page
document.addEventListener("DOMContentLoaded", async () => {
  const client = await supabaseReady;
  const authLink = document.getElementById("nav-auth-link");
  const authText = document.getElementById("nav-auth-text");
  if (!client || !authLink || !authText) return;

  const { data: { session } } = await client.auth.getSession();

  if (session) {
    const email = session.user.email;
    const display = email.length > 18
      ? email.split("@")[0].substring(0, 12) + "..."
      : email;

    authText.textContent = `Logout (${display})`;
    authLink.href = "#";
    authLink.onclick = async (e) => {
      e.preventDefault();
      await client.auth.signOut();
      window.location.reload();
    };
  }
  // Show "My Orders" nav link when logged in
  const myOrdersLink = document.getElementById("nav-my-orders");
  if (myOrdersLink) {
    myOrdersLink.style.display = session ? "block" : "none";
  }
  // else: already shows "Log In / Sign Up" + links to /login.html (default HTML)
});
