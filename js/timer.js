window.TestMaster = window.TestMaster || {};

window.TestMaster.timer = (function createTimerModule(storage) {
  const STATUS = {
    IDLE: "idle",
    RUNNING: "running",
    PAUSED: "paused",
    COMPLETED: "completed"
  };

  function initTimerShell(appState) {
    appState.timer = {
      STATUS,
      createTimer,
      formatTime,
      getWarningLevel,
      applyTimerClasses,
      hasPersistedTimer: (id) => Boolean(storage.loadTimer(id))
    };
  }

  function createTimer(config) {
    const settings = {
      id: config.id,
      durationSeconds: Number(config.durationSeconds) || 0,
      warningAtSeconds: Number(config.warningAtSeconds) || 300,
      dangerAtSeconds: Number(config.dangerAtSeconds) || 60,
      onTick: typeof config.onTick === "function" ? config.onTick : noop,
      onComplete: typeof config.onComplete === "function" ? config.onComplete : noop
    };

    let intervalId = null;
    let state = {
      id: settings.id,
      durationSeconds: settings.durationSeconds,
      remainingSeconds: settings.durationSeconds,
      status: STATUS.IDLE,
      startedAt: null,
      updatedAt: null,
      completedAt: null
    };

    function start(options = {}) {
      clearIntervalId();

      const restored = options.restore ? restore() : null;

      if (!restored) {
        state = {
          ...state,
          durationSeconds: settings.durationSeconds,
          remainingSeconds: settings.durationSeconds,
          status: STATUS.RUNNING,
          startedAt: Date.now(),
          updatedAt: Date.now(),
          completedAt: null
        };
        persist();
      }

      emitTick();

      if (state.status === STATUS.RUNNING) {
        schedule();
      }

      if (state.remainingSeconds <= 0 && state.status === STATUS.COMPLETED) {
        settings.onComplete(getState());
      }

      return getState();
    }

    function pause() {
      if (state.status !== STATUS.RUNNING) {
        return getState();
      }

      syncElapsedTime();
      clearIntervalId();
      state.status = STATUS.PAUSED;
      state.updatedAt = Date.now();
      persist();
      emitTick();
      return getState();
    }

    function resume() {
      if (state.status !== STATUS.PAUSED || state.remainingSeconds <= 0) {
        return getState();
      }

      state.status = STATUS.RUNNING;
      state.updatedAt = Date.now();
      persist();
      emitTick();
      schedule();
      return getState();
    }

    function reset() {
      clearIntervalId();
      state = {
        id: settings.id,
        durationSeconds: settings.durationSeconds,
        remainingSeconds: settings.durationSeconds,
        status: STATUS.IDLE,
        startedAt: null,
        updatedAt: null,
        completedAt: null
      };
      storage.clearTimer(settings.id);
      emitTick();
      return getState();
    }

    function complete(options = {}) {
      clearIntervalId();
      state.status = STATUS.COMPLETED;
      state.remainingSeconds = Math.max(0, state.remainingSeconds);
      state.completedAt = Date.now();
      state.updatedAt = Date.now();

      if (options.clearStorage !== false) {
        storage.clearTimer(settings.id);
      } else {
        persist();
      }

      emitTick();

      if (options.triggerCallback) {
        settings.onComplete(getState());
      }

      return getState();
    }

    function restore() {
      const persisted = storage.loadTimer(settings.id);

      if (!persisted) {
        return null;
      }

      state = {
        ...state,
        ...persisted,
        durationSeconds: settings.durationSeconds
      };

      if (state.status === STATUS.RUNNING) {
        syncElapsedTime();
      }

      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        state.status = STATUS.COMPLETED;
        state.completedAt = Date.now();
        persist();
      }

      emitTick();
      return getState();
    }

    function getState() {
      return {
        ...state,
        warningLevel: getWarningLevel(
          state.remainingSeconds,
          settings.warningAtSeconds,
          settings.dangerAtSeconds
        )
      };
    }

    function schedule() {
      clearIntervalId();
      intervalId = window.setInterval(tick, 1000);
    }

    function tick() {
      if (state.status !== STATUS.RUNNING) {
        return;
      }

      syncElapsedTime();
      emitTick();

      if (state.remainingSeconds <= 0) {
        complete({
          clearStorage: true,
          triggerCallback: true
        });
      }
    }

    function syncElapsedTime() {
      const now = Date.now();
      const updatedAt = Number(state.updatedAt) || now;
      const elapsedSeconds = Math.floor((now - updatedAt) / 1000);

      if (elapsedSeconds <= 0) {
        return;
      }

      state.remainingSeconds = Math.max(0, state.remainingSeconds - elapsedSeconds);
      state.updatedAt = now;
      persist();
    }

    function emitTick() {
      settings.onTick(getState());
    }

    function clearIntervalId() {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    function persist() {
      storage.saveTimer(settings.id, state);
    }

    return {
      start,
      pause,
      resume,
      reset,
      complete,
      restore,
      getState
    };
  }

  function getWarningLevel(remainingSeconds, warningAtSeconds = 300, dangerAtSeconds = 60) {
    if (remainingSeconds <= 0) {
      return "expired";
    }

    if (remainingSeconds <= dangerAtSeconds) {
      return "danger";
    }

    if (remainingSeconds <= warningAtSeconds) {
      return "warning";
    }

    return "normal";
  }

  function applyTimerClasses(element, timerState) {
    if (!element || !timerState) {
      return;
    }

    element.classList.remove("timer-normal", "timer-warning", "timer-danger", "timer-paused", "timer-expired");
    element.classList.add(`timer-${timerState.warningLevel}`);

    if (timerState.status === STATUS.PAUSED) {
      element.classList.add("timer-paused");
    }
  }

  function formatTime(totalSeconds, options = {}) {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (options.showHours || hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function noop() {}

  return {
    STATUS,
    initTimerShell,
    createTimer,
    formatTime,
    getWarningLevel,
    applyTimerClasses
  };
})(window.TestMaster.storage);
