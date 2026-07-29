window.TestMaster = window.TestMaster || {};

window.TestMaster.authGate = (function createAuthGateModule(auth) {
  function initAuthGate() {
    const gate = document.querySelector("#authGate");
    const shell = document.querySelector(".app-shell");
    const signInButton = document.querySelector("#gateSignInButton");
    const statusText = document.querySelector("#gateStatus");

    if (!gate || !shell || !signInButton) {
      return;
    }

    if (!auth.isConfigured()) {
      signInButton.disabled = true;
      statusText.textContent = "Google Sign-In is not configured for this deployment.";
    }

    signInButton.addEventListener("click", async () => {
      signInButton.disabled = true;
      statusText.textContent = "";

      try {
        await auth.signIn();
      } catch (error) {
        console.error(error);
        statusText.textContent = "Sign-in failed. Please try again.";
      } finally {
        signInButton.disabled = !auth.isConfigured();
      }
    });

    window.addEventListener("testmaster:auth-change", (event) => {
      render(event.detail.user);
    });

    // Use the cached profile (synchronous) rather than auth.getUser() here —
    // getUser() is still null at this point since auth.init()'s GIS/silent-
    // reauth chain hasn't resolved yet. Optimistically unlocking on a cached
    // profile avoids flashing the login screen on every page refresh; if the
    // background silent reauth then fails, auth.js clears the cache and
    // re-emits testmaster:auth-change with no user, which re-locks the gate.
    render(auth.getUser() || auth.getCachedUser());

    function render(user) {
      const isAuthenticated = Boolean(user);
      gate.classList.toggle("auth-gate-hidden", isAuthenticated);
      shell.classList.toggle("hidden", !isAuthenticated);
    }
  }

  return {
    initAuthGate
  };
})(window.TestMaster.auth);
