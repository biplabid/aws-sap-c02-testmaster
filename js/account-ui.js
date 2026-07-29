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
      await auth.signOut();
      elements.signOutButton.disabled = false;
      elements.signOutButton.textContent = "Sign Out";
      window.TestMaster.ui.showToast("Signed out.");
    });

    window.addEventListener("testmaster:auth-change", (event) => {
      renderUser(elements, event.detail.user);
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
      signOutButton: document.querySelector("#accountSignOutButton")
    };
  }

  function renderUser(elements, user) {
    if (!user) {
      elements.signInButton.classList.remove("hidden");
      elements.avatarButton.classList.add("hidden");
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
