window.TestMaster = window.TestMaster || {};

window.TestMaster.accountUi = (function createAccountUiModule(auth) {
  function initAccountUi() {
    const elements = getElements();

    if (!elements.control) {
      return;
    }

    if (!auth.isConfigured()) {
      elements.signInButton.disabled = true;
      elements.signInButton.title = "Google Sign-In is not configured for this deployment.";
    }

    elements.signInButton.addEventListener("click", async () => {
      try {
        await auth.signIn();
      } catch (error) {
        console.error(error);
        window.TestMaster.ui.showToast("Google sign-in failed. Please try again.");
      }
    });

    elements.avatarButton.addEventListener("click", () => {
      togglePopover(elements);
    });

    document.body.addEventListener("click", (event) => {
      if (!elements.control.contains(event.target) && !elements.popover.classList.contains("hidden")) {
        closePopover(elements);
      }
    });

    elements.signOutButton.addEventListener("click", async () => {
      closePopover(elements);
      elements.signOutButton.disabled = true;
      elements.signOutButton.textContent = "Signing out…";
      await waitForSyncToSettle();
      await auth.signOut();
      elements.signOutButton.disabled = false;
      elements.signOutButton.textContent = "Sign Out";
      window.TestMaster.ui.showToast("Signed out.");
    });

    elements.chooseFolderButton.addEventListener("click", async () => {
      const driveSync = window.TestMaster.driveSync;
      if (!driveSync) {
        return;
      }
      try {
        await driveSync.chooseFolder();
      } catch (error) {
        console.error(error);
        window.TestMaster.ui.showToast("Couldn't open the Google Drive folder picker.");
      }
    });

    window.addEventListener("testmaster:auth-change", (event) => {
      renderUser(elements, event.detail.user);
    });

    window.addEventListener("testmaster:sync-status", (event) => {
      elements.syncStatus.textContent = event.detail.message;
      elements.syncStatus.classList.toggle("sync-error", Boolean(event.detail.isError));
      elements.chooseFolderButton.textContent = event.detail.folderName
        ? "Change Drive Folder"
        : "Choose Drive Folder";
    });

    renderUser(elements, auth.getUser());
  }

  function getElements() {
    return {
      control: document.querySelector("#accountControl"),
      signInButton: document.querySelector("#signInButton"),
      avatarButton: document.querySelector("#accountAvatarButton"),
      avatarImg: document.querySelector("#accountAvatarImg"),
      nameLabel: document.querySelector("#accountNameLabel"),
      popover: document.querySelector("#accountPopover"),
      popoverAvatar: document.querySelector("#accountPopoverAvatar"),
      popoverName: document.querySelector("#accountPopoverName"),
      popoverEmail: document.querySelector("#accountPopoverEmail"),
      syncStatus: document.querySelector("#accountSyncStatus"),
      chooseFolderButton: document.querySelector("#accountChooseFolderButton"),
      signOutButton: document.querySelector("#accountSignOutButton")
    };
  }

  function renderUser(elements, user) {
    if (!user) {
      elements.signInButton.classList.remove("hidden");
      elements.avatarButton.classList.add("hidden");
      elements.syncStatus.textContent = "Not connected to Google Drive.";
      elements.syncStatus.classList.remove("sync-error");
      elements.chooseFolderButton.textContent = "Choose Drive Folder";
      closePopover(elements);
      return;
    }

    elements.signInButton.classList.add("hidden");
    elements.avatarButton.classList.remove("hidden");

    elements.avatarImg.src = user.picture;
    elements.avatarImg.alt = user.name;
    elements.nameLabel.textContent = firstName(user.name);

    elements.popoverAvatar.src = user.picture;
    elements.popoverAvatar.alt = user.name;
    elements.popoverName.textContent = user.name;
    elements.popoverEmail.textContent = user.email;
  }

  function firstName(fullName) {
    return (fullName || "").split(" ")[0];
  }

  function waitForSyncToSettle(timeoutMs = 5000) {
    const driveSync = window.TestMaster.driveSync;
    if (!driveSync || !driveSync.isSyncing()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (!driveSync.isSyncing() || Date.now() - startedAt > timeoutMs) {
          resolve();
          return;
        }
        window.setTimeout(check, 200);
      };
      check();
    });
  }

  function togglePopover(elements) {
    const isOpen = elements.popover.classList.toggle("hidden") === false;
    elements.avatarButton.setAttribute("aria-expanded", String(isOpen));
  }

  function closePopover(elements) {
    elements.popover.classList.add("hidden");
    elements.avatarButton.setAttribute("aria-expanded", "false");
  }

  return {
    initAccountUi
  };
})(window.TestMaster.auth);
