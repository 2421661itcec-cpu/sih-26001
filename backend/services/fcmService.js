const {
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");

const {
  getMessaging,
} = require("firebase-admin/messaging");

const serviceAccountPath =
  "/etc/secrets/firebase-service-account.json";

const serviceAccount = require(
  serviceAccountPath
);

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
      });

const messaging =
  getMessaging(firebaseApp);

async function sendPushToFid({
  fid,
  title,
  body,
  data = {},
}) {
  if (!fid) {
    throw new Error(
      "FCM registration token is required."
    );
  }

  const stringData =
    Object.fromEntries(
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

    token: fid,
  };

  try {
    const response =
      await messaging.send(message);

    console.log(
      "FCM single send successful:",
      response
    );

    return response;
  } catch (error) {
    console.error(
      "FCM single send failed:",
      {
        code: error?.code,
        message: error?.message,
        errorInfo: error?.errorInfo,
      }
    );

    throw error;
  }
}

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
      "At least one FCM registration token is required."
    );
  }

  const validTokens = fids.filter(
    (token) =>
      typeof token === "string" &&
      token.trim().length > 0
  );

  if (validTokens.length === 0) {
    throw new Error(
      "No valid FCM registration tokens were provided."
    );
  }

  const stringData =
    Object.fromEntries(
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
  };

  try {
    const response =
      await messaging.sendEachForMulticast({
        tokens: validTokens,
        ...message,
      });

    console.log(
      "FCM multicast result:",
      {
        successCount:
          response.successCount,
        failureCount:
          response.failureCount,
      }
    );

    response.responses.forEach(
      (result, index) => {
        if (!result.success) {
          console.error(
            `FCM device ${index + 1} failed:`,
            {
              code: result.error?.code,
              message:
                result.error?.message,
              errorInfo:
                result.error?.errorInfo,
            }
          );
        }
      }
    );

    return response;
  } catch (error) {
    console.error(
      "FCM multicast send failed:",
      {
        code: error?.code,
        message: error?.message,
        errorInfo: error?.errorInfo,
      }
    );

    throw error;
  }
}

module.exports = {
  sendPushToFid,
  sendPushToFids,
};