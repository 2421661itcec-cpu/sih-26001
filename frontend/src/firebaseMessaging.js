import {
  getMessaging,
  onRegistered,
  register,
} from "firebase/messaging";

import { app } from "./firebase";

const VAPID_KEY =
  "BDi9NvPqLAbpEgqoEMUiltL3Xu6km_YnvwqaCMol9IM52il7pz35IdA90s-BZE7JPp2aBgqZEUgajx1sgo7g-lc";

const BACKEND_URL =
  "https://sih-26001-1.onrender.com";

export async function registerForPushNotifications(
  deviceName = "SIH Prototype Device"
) {
  try {
    if (!("Notification" in window)) {
      throw new Error(
        "This browser does not support notifications."
      );
    }

    if (!("serviceWorker" in navigator)) {
      throw new Error(
        "This browser does not support service workers."
      );
    }

    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        `Notification permission was not granted. Current status: ${permission}`
      );
    }

    const messaging = getMessaging(app);

    const serviceWorkerRegistration =
      await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );

    console.log(
      "Firebase messaging service worker registered:",
      serviceWorkerRegistration
    );

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

    await register(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration,
    });

    console.log(
      "SIH 26001 device registered with Firebase Cloud Messaging."
    );

    const installationId =
      await installationIdPromise;

    window.localStorage.setItem(
      "sih26001_firebase_installation_id",
      installationId
    );

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

    const result = await response.json();

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