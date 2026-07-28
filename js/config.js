window.TestMaster = window.TestMaster || {};

// OAuth Client IDs are safe to commit (unlike a client secret) — they are
// meant to be public and are visible in any browser's network traffic.
// See Phase 0 of the Google Sign-In setup: create this in Google Cloud
// Console under APIs & Services > Credentials > OAuth client ID (Web
// application), then paste it here.
window.TestMaster.config = {
  GOOGLE_CLIENT_ID: "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",
  // Optional: only needed if the Google Drive folder picker (Phase 0-B,
  // step 5) requires an API key in your Cloud project. Leave blank to skip.
  GOOGLE_API_KEY: ""
};
