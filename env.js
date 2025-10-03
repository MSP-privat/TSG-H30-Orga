// env.js
// ==== TRAGE HIER DEINE WERTE EIN ====
window.SUPABASE_URL = "https://bmbehnvactkhruzvgieg.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtYmVobnZhY3RraHJ1enZnaWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzOTEwNjMsImV4cCI6MjA3NDk2NzA2M30.JkGGX0RrvrXcKe_eWkNE6xsy5UuxtdISVjcaCA9qMu0";
// =====================================

// Optional: kleines Log – verschwindet, sobald Werte gesetzt sind
if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
  console.warn("[env] No environment configured. Using placeholders. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY in env.js");
}
