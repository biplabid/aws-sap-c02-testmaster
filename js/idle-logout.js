window.TestMaster = window.TestMaster || {};

window.TestMaster.idleLogout = (function createIdleLogoutModule(auth) {
  const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
  const CHECK_INTERVAL_MS = 15 * 1000;
  const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

  let lastActivityAt = Date.now();
  let signingOut = false;

  function markActivity() {
    lastActivityAt = Date.now();
  }

  async function checkIdle() {
    if (signingOut || !auth.isSignedIn()) {
      return;
    }

    if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS) {
      return;
    }

    signingOut = true;
    try {
      await auth.signOut();
      const statusEl = document.querySelector("#gateStatus");
      if (statusEl) {
        statusEl.textContent = "Signed out after 10 minutes of inactivity. Sign in again to continue.";
      }
    } finally {
      signingOut = false;
    }
  }

  function init() {
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    window.addEventListener("testmaster:auth-change", (event) => {
      if (event.detail.user) {
        markActivity();
      }
    });

    window.setInterval(checkIdle, CHECK_INTERVAL_MS);
  }

  return {
    init
  };
})(window.TestMaster.auth);
