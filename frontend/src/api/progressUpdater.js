class ProgressUpdateManager {
  constructor() {
    if (ProgressUpdateManager._instance) {
      return ProgressUpdateManager._instance;
    }

    this.progressUpdateSetters = new Map();
    return ProgressUpdateManager._instance = this;
  }

  updateProgress(update, messageId, mode) {
    const updateSetter = this.progressUpdateSetters.get(messageId);
    if (updateSetter?.[mode]) {
      updateSetter[mode](update);
    }
  }

  setUpdaterByMode(messageId, updater, mode) {
    const updateSetter = this.progressUpdateSetters.get(messageId);
    if (updateSetter) {
      this.progressUpdateSetters.set(messageId, { ...updateSetter, [mode]: updater });
    } else {
      this.progressUpdateSetters.set(messageId, { [mode]: updater })
    }

  }

  removeUpdaterByMode(messageId, mode) {
    const updateSetter = this.progressUpdateSetters.get(messageId);
    if (updateSetter?.[mode]) {
      const newSetter = { ...updateSetter, [mode]: null }
      updateSetter[mode] = null;
      this.progressUpdateSetters.set(messageId, newSetter);
    }
  }



}

export const progressUpdater = new ProgressUpdateManager()
