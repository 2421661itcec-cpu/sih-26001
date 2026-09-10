import {
  onRegistered,
  register,
} from "firebase/messaging";

import { messaging } from "./firebase";

const VAPID_KEY =
  "BDi9NvPqLAbpEgqoEMUiltL3Xu6km_YnvwqaCMol9IM52il7pz35IdA90s-BZE7JPp2aBgqZEUgajx1sgo7g-lc";

const BACKEND_URL =
  "http://127.0.0.1:5000";

/**
 * Register this browser/device with Firebase Cloud Messaging
 * and register its Firebase Installation ID (FID) with the
 * SIH 26001 backend.
 */
export async function registerForPushNotifications(
  deviceName = "SIH Prototype Device"
) {
  try {
    /*
     * --------------------------------------------------------
     * 1. Check browser notification support
     * --------------------------------------------------------
     */

    if (!("Notification" in window)) {
      throw new Error(
        "This browser does not support notifications."
      );
    }

    /*
     * --------------------------------------------------------
     * 2. Check service-worker support
     * --------------------------------------------------------
     */

    if (!("serviceWorker" in navigator)) {
      throw new Error(
        "This browser does not support service workers."
      );
    }

    /*
     * --------------------------------------------------------
     * 3. Request notification permission
     * --------------------------------------------------------
     */

    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        `Notification permission was not granted. Current status: ${permission}`
      );
    }

    /*
     * --------------------------------------------------------
     * 4. Register Firebase messaging service worker
     * --------------------------------------------------------
     */

    const serviceWorkerRegistration =
      await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );

    console.log(
      "Firebase messaging service worker registered:",
      serviceWorkerRegistration
    );

    /*
     * --------------------------------------------------------
     * 5. Wait for Firebase Installation ID (FID)
     * --------------------------------------------------------
     */

    const installationIdPromise =
      new Promise((resolve) => {
        onRegistered(
          messaging,
          (installationId) => {
            console.log(
              "Firebase Installation ID:",
              installationId
            );

            resolve(installationId);
          }
        );
      });

    /*
     * --------------------------------------------------------
     * 6. Register app instance with FCM
     * --------------------------------------------------------
     */

    await register(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration,
    });

    console.log(
      "SIH 26001 device registered with Firebase Cloud Messaging."
    );

    /*
     * --------------------------------------------------------
     * 7. Get the Firebase Installation ID
     * --------------------------------------------------------
     */

    const installationId =
      await installationIdPromise;

    /*
     * --------------------------------------------------------
     * 8. Store FID locally
     * --------------------------------------------------------
     */

    window.localStorage.setItem(
      "sih26001_firebase_installation_id",
      installationId
    );

    /*
     * --------------------------------------------------------
     * 9. Send FID to SIH backend
     * --------------------------------------------------------
     */

    console.log(
      "Registering device with SIH 26001 backend..."
    );

    const response = await fetch(
      `${BACKEND_URL}/api/notifications/register`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          fid: installationId,
          deviceName,
        }),
      }
    );

    const result =
      await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ||
          "Backend device registration failed."
      );
    }

    console.log(
      "SIH 26001 notification device registered:",
      result
    );

    /*
     * --------------------------------------------------------
     * 10. Notify the existing SIH frontend alert system
     * --------------------------------------------------------
     */

    window.dispatchEvent(
      new CustomEvent(
        "sih26001-fcm-registered",
        {
          detail: {
            installationId,
            deviceName,
            deviceCount:
              result.deviceCount,
          },
        }
      )
    );

    /*
     * --------------------------------------------------------
     * 11. Return successful registration
     * --------------------------------------------------------
     */

    return {
      success: true,

      permission,

      installationId,

      deviceName,

      deviceCount:
        result.deviceCount,
    };
  } catch (error) {
    console.error(
      "FCM registration failed:",
      error
    );

    throw error;
  }
}

/**
 * Retrieve the Firebase Installation ID that was
 * previously stored on this device.
 */
export function getStoredInstallationId() {
  return window.localStorage.getItem(
    "sih26001_firebase_installation_id"
  );
}