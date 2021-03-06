/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(
  this, "AddonManager", "resource://gre/modules/AddonManager.jsm"
);
XPCOMUtils.defineLazyModuleGetter(
  this, "Config", "resource://pioneer-online-news-survey-fix/Config.jsm"
);
XPCOMUtils.defineLazyModuleGetter(
  this, "ActiveURIService", "resource://pioneer-online-news-survey-fix/lib/ActiveURIService.jsm",
);
XPCOMUtils.defineLazyModuleGetter(
  this, "PrefUtils", "resource://pioneer-online-news-survey-fix/lib/PrefUtils.jsm"
);
XPCOMUtils.defineLazyModuleGetter(
  this, "State", "resource://pioneer-online-news-survey-fix/lib/State.jsm"
);
XPCOMUtils.defineLazyModuleGetter(
  this, "StudyAddonManager", "resource://pioneer-online-news-survey-fix/lib/StudyAddonManager.jsm",
);
XPCOMUtils.defineLazyModuleGetter(
  this, "SurveyWatcher", "resource://pioneer-online-news-survey-fix/lib/SurveyWatcher.jsm"
);

const REASONS = {
  APP_STARTUP:      1, // The application is starting up.
  APP_SHUTDOWN:     2, // The application is shutting down.
  ADDON_ENABLE:     3, // The add-on is being enabled.
  ADDON_DISABLE:    4, // The add-on is being disabled. (Also sent during uninstallation)
  ADDON_INSTALL:    5, // The add-on is being installed.
  ADDON_UNINSTALL:  6, // The add-on is being uninstalled.
  ADDON_UPGRADE:    7, // The add-on is being upgraded.
  ADDON_DOWNGRADE:  8, // The add-on is being downgraded.
};
const UI_AVAILABLE_NOTIFICATION = "sessionstore-windows-restored";

this.Bootstrap = {
  install() {},

  async startup(data, reason) {
    // Always set EXPIRATION_DATE_PREF if it not set, even if outside of install.
    // This is a failsafe if opt-out expiration doesn't work, so should be resilient.
    let expirationDate = PrefUtils.getExpiryDate();
    if (!expirationDate) {
      const phases = Object.values(Config.phases);
      const studyLength = phases.map(p => p.duration || 0).reduce((a, b) => a + b);
      expirationDate = Date.now() + studyLength;
      PrefUtils.setExpiryDate(expirationDate);
    }

    // Check if the study has expired
    if (Date.now() > expirationDate) {
      const addon = await AddonManager.getAddonByID(Config.addonId);
      if (addon) {
        addon.uninstall();
      }
      return;
    }

    // If the app is starting up, wait until the UI is available before finishing
    // init.
    if (reason === REASONS.APP_STARTUP) {
      Services.obs.addObserver(this, UI_AVAILABLE_NOTIFICATION);
    } else {
      this.finishStartup();
    }
  },

  observe(subject, topic, data) {
    if (topic === UI_AVAILABLE_NOTIFICATION) {
      Services.obs.removeObserver(this, UI_AVAILABLE_NOTIFICATION);
      this.finishStartup();
    }
  },

  /**
   * Add-on startup tasks delayed until after session restore so as
   * not to slow down browser startup.
   */
  finishStartup() {
    StudyAddonManager.startup();
    ActiveURIService.startup();
    SurveyWatcher.startup();
  },

  shutdown(data, reason) {
    if (reason === REASONS.ADDON_UNINSTALL) {
      // Uninstall the online news study addon if we are uninstalling this addon.
      StudyAddonManager.uninstall();
    }

    ActiveURIService.shutdown();
    StudyAddonManager.shutdown();

    Cu.unload("resource://pioneer-online-news-survey-fix/Config.jsm");
    Cu.unload("resource://pioneer-online-news-survey-fix/lib/ActiveURIService.jsm");
    Cu.unload("resource://pioneer-online-news-survey-fix/lib/PrefUtils.jsm");
    Cu.unload("resource://pioneer-online-news-survey-fix/lib/State.jsm");
    Cu.unload("resource://pioneer-online-news-survey-fix/lib/StudyAddonManager.jsm");
    Cu.unload("resource://pioneer-online-news-survey-fix/lib/SurveyWatcher.jsm");
  },

  uninstall() {},
};

// Expose bootstrap methods on the global
for (const methodName of ["install", "startup", "shutdown", "uninstall"]) {
  this[methodName] = Bootstrap[methodName].bind(Bootstrap);
}
