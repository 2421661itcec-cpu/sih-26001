import {
  getMessaging,
  getToken,
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

    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration,
    });

    if (!fcmToken) {
      throw new Error(
        "Firebase did not return an FCM registration token."
      );
    }

    console.log(
      "SIH 26001 FCM registration token obtained."
    );

    window.localStorage.setItem(
      "sih26001_fcm_token",
      fcmToken
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
          fid: fcmToken,
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
            tokenRegistered: true,
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
      tokenRegistered: true,
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