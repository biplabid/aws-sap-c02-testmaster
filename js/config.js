window.TestMaster = window.TestMaster || {};

// OAuth Client IDs are safe to commit (unlike a client secret) — they are
// meant to be public and are visible in any browser's network traffic.
// See Phase 0 of the Google Sign-In setup: create this in Google Cloud
// Console under APIs & Services > Credentials > OAuth client ID (Web
// application), then paste it here.
window.TestMaster.config = {
  GOOGLE_CLIENT_ID: "266127504874-1g1j2vt580aoq3907rgsgnprrne76pkc.apps.googleusercontent.com"
};
