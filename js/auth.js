window.TestMaster = window.TestMaster || {};

window.TestMaster.auth = (function createAuthModule(storage) {
  const SCOPES = "openid email profile";
  const CACHED_PROFILE_KEY = "auth:last-profile";
  const GIS_POLL_INTERVAL_MS = 100;
  const GIS_POLL_TIMEOUT_MS = 10000;

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let currentUser = null;

  function getClientId() {
    return window.TestMaster.config && window.TestMaster.config.GOOGLE_CLIENT_ID;
  }

  function isConfigured() {
    const clientId = getClientId();
    return Boolean(clientId) && !clientId.startsWith("REPLACE_WITH_");
  }

  function waitForGis() {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const check = () => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > GIS_POLL_TIMEOUT_MS) {
          reject(new Error("Google Identity Services failed to load."));
          return;
        }
        window.setTimeout(check, GIS_POLL_INTERVAL_MS);
      };

      check();
    });
  }

  function emitAuthChange() {
    window.dispatchEvent(new CustomEvent("testmaster:auth-change", {
      detail: { user: currentUser }
    }));
  }

  function handleTokenResponse(tokenResponse) {
    if (!tokenResponse || tokenResponse.error) {
      return Promise.reject(new Error((tokenResponse && tokenResponse.error) || "Sign-in failed."));
    }

    accessToken = tokenResponse.access_token;
    tokenExpiresAt = Date.now() + (Number(tokenResponse.expires_in) || 0) * 1000;

    return fetchUserInfo(accessToken).then((profile) => {
      currentUser = profile;
      storage.set(CACHED_PROFILE_KEY, profile);
      emitAuthChange();
      return profile;
    });
  }

  async function fetchUserInfo(token) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google profile (${response.status}).`);
    }

    const data = await response.json();
    return {
      sub: data.sub,
      email: data.email,
      name: data.name || data.email,
      picture: data.picture || ""
    };
  }

  async function init() {
    if (!isConfigured()) {
      console.warn("Google Sign-In is not configured: set GOOGLE_CLIENT_ID in js/config.js.");
      return;
    }

    try {
      await waitForGis();
    } catch (error) {
      console.error(error);
      return;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: getClientId(),
      scope: SCOPES,
      callback: () => {} // overridden per-call in signIn()
    });

    // Trust the cached profile as-is — no silent requestAccessToken() check
    // on load. That call is meant to be invisible, but Google can still
    // surface its own account-chooser popup for it (multiple signed-in
    // Google accounts, third-party-cookie restrictions, etc.), which is
    // exactly the "asks me to log in again on refresh" behavior this
    // avoids. Nothing in this app calls a Google API with the access token
    // anymore (Drive sync is gone), so there's nothing that actually needs
    // a fresh one just from loading the page. The session ends only via an
    // explicit sign-out — manual, or idle-logout.js's timeout.
    const cachedProfile = storage.get(CACHED_PROFILE_KEY, null);
    if (cachedProfile) {
      currentUser = cachedProfile;
      emitAuthChange();
    }
  }

  function signIn() {
    if (!tokenClient) {
      return Promise.reject(new Error("Google Sign-In is not ready yet."));
    }

    return new Promise((resolve, reject) => {
      tokenClient.callback = (tokenResponse) => {
        handleTokenResponse(tokenResponse).then(resolve, reject);
      };

      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  function signOut() {
    return new Promise((resolve) => {
      const token = accessToken;

      const finish = () => {
        accessToken = null;
        tokenExpiresAt = 0;
        currentUser = null;
        storage.remove(CACHED_PROFILE_KEY);
        // This only ever runs for an explicit sign-out (the user's own
        // click, or idle-logout.js's timeout) — init() no longer attempts
        // any background reauth that could reach here on a routine load.
        storage.clearActiveSessions();
        emitAuthChange();
        resolve();
      };

      if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
        window.google.accounts.oauth2.revoke(token, finish);
      } else {
        finish();
      }
    });
  }

  function getUser() {
    return currentUser;
  }

  // Synchronous read of the last-known profile, for use before init()'s
  // async GIS-loading wait has resolved — lets the login gate show the app
  // immediately on a page refresh instead of flashing "sign in" while
  // that's still in flight.
  function getCachedUser() {
    return storage.get(CACHED_PROFILE_KEY, null);
  }

  function getAccessToken() {
    if (!accessToken || Date.now() >= tokenExpiresAt) {
      return null;
    }
    return accessToken;
  }

  function isSignedIn() {
    return Boolean(currentUser);
  }

  return {
    init,
    signIn,
    signOut,
    getUser,
    getCachedUser,
    getAccessToken,
    isSignedIn,
    isConfigured
  };
})(window.TestMaster.storage);
