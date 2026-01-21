// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyA-5EQ_WBIhKh8T_REUL9K5vad1exeeRIY",
    authDomain: "presupuesto-c971e.firebaseapp.com",
    projectId: "presupuesto-c971e",
    storageBucket: "presupuesto-c971e.firebasestorage.app",
    messagingSenderId: "463386453923",
    appId: "1:463386453923:web:8d9d83aa47d5cec42adc16"
};

// IMPORTANTE: Usamos la versión 8.x (más compatible)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Referencias globales
const db = firebase.firestore();
const auth = firebase.auth();

// Colecciones
const GASTOS_COLLECTION = "gastos";
const AHORROS_COLLECTION = "ahorros";
const LIMITES_COLLECTION = "limites";
const CONFIG_COLLECTION = "config";
const SHARED_DOC_ID = "nuestra_pareja";

// Iniciar autenticación anónima (automática)
auth.signInAnonymously().catch(error => {
    console.error("Error de autenticación:", error);
});

// Exportar para usar en otros archivos
window.firebaseDb = db;
window.firebaseAuth = auth;
window.firebaseConfig = {
    GASTOS_COLLECTION,
    AHORROS_COLLECTION,
    LIMITES_COLLECTION,
    CONFIG_COLLECTION,
    SHARED_DOC_ID
};