importScripts(
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyDPHYgREqFPPPDT5axKiOjbVR6E8c3oFJM",
  authDomain: "sih-26001-landslide-alert.firebaseapp.com",
  projectId: "sih-26001-landslide-alert",
  storageBucket: "sih-26001-landslide-alert.firebasestorage.app",
  messagingSenderId: "202845384703",
  appId: "1:202845384703:web:561b86d9e3ece2129201ca",
  measurementId: "G-4T3ZY9FZ72",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[SIH 26001] Background FCM message:",
    payload
  );

  const notificationTitle =
    payload.notification?.title ||
    "SIH 26001 Alert";

  const notificationOptions = {
    body:
      payload.notification?.body ||
      "A new landslide risk alert has been received.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: payload.data || {},
  };

  self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});