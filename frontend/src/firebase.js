import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyDPHYgREqFPPPDT5axKiOjbVR1Y6E8c3oFJM",
  authDomain: "sih-26001-landslide-alert.firebaseapp.com",
  projectId: "sih-26001-landslide-alert",
  storageBucket: "sih-26001-landslide-alert.firebasestorage.app",
  messagingSenderId: "202845384703",
  appId: "1:202845384703:web:561b86d9e3ece2129201ca",
  measurementId: "G-4T3ZY9FZ72",
};

const app = initializeApp(firebaseConfig);

export { app };