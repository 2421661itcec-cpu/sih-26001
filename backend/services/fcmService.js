const path = require("path");

const {
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");

const {
  getMessaging,
} = require("firebase-admin/messaging");

const serviceAccountPath = "/etc/secrets/firebase-service-account.json";

const serviceAccount = require(
  serviceAccountPath
);

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
      });

const messaging = getMessaging(firebaseApp);

/**
 * Send a push notification to one Firebase
 * Installation ID (FID).
 */
async function sendPushToFid({
  fid,
  title,
  body,
  data = {},
}) {
  if (!fid) {
    throw new Error(
      "Firebase Installation ID (FID) is required."
    );
  }

  const stringData = Object.fromEntries(
    Object.entries(data).map(
      ([key, value]) => [
        key,
        String(value),
      ]
    )
  );

  const message = {
    notification: {
      title,
      body,
    },

    data: stringData,

    fid,
  };

  const response =
    await messaging.send(message);

  return response;
}

/**
 * Send the same push notification to multiple
 * Firebase Installation IDs.
 *
 * Prototype target:
 * 1–3 teammate devices.
 */
async function sendPushToFids({
  fids,
  title,
  body,
  data = {},
}) {
  if (
    !Array.isArray(fids) ||
    fids.length === 0
  ) {
    throw new Error(
      "At least one Firebase Installation ID (FID) is required."
    );
  }

  const stringData = Object.fromEntries(
    Object.entries(data).map(
      ([key, value]) => [
        key,
        String(value),
      ]
    )
  );

  const message = {
    notification: {
      title,
      body,
    },

    data: stringData,

    fids,
  };

  const response =
    await messaging.sendEachForMulticast(
      message
    );

  return response;
}

module.exports = {
  sendPushToFid,
  sendPushToFids,
};