
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    setPersistence,
    browserSessionPersistence,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";


/* =========================================
   FIREBASE CONFIGURATION
========================================= */

const firebaseConfig = {
    apiKey: "AIzaSyCfrRrd5dnJVv5z9HLWPhQfRZogGlyo_Ug",
    authDomain: "readmit-care.firebaseapp.com",
    projectId: "readmit-care",
    storageBucket: "readmit-care.firebasestorage.app",
    messagingSenderId: "961421141481",
    appId: "1:961421141481:web:1cba0a6758cca4e2531778"
};


/* =========================================
   INITIALIZE FIREBASE
========================================= */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider();

provider.setCustomParameters({
    prompt: "select_account"
});

const $ = id => document.getElementById(id);

await setPersistence(
    auth,
    browserSessionPersistence
);

await auth.authStateReady();


/* =========================================
   STATUS MESSAGE
========================================= */

function showStatus(message, error = false) {

    const status = $("otpStatus");

    if (!status) return;

    status.textContent = message;

    status.className = error
        ? "error-text"
        : "success-text";
}


/* =========================================
   GOOGLE ACCOUNT VERIFICATION
========================================= */

function isGoogleUser(user) {

    return Boolean(
        user &&
        user.emailVerified &&
        user.providerData.some(
            item => item.providerId === "google.com"
        )
    );
}


/* =========================================
   UPDATE AUTHENTICATION INTERFACE
========================================= */

function updateInterface(user) {

    const verified = isGoogleUser(user);

    if ($("predictButton")) {
        $("predictButton").disabled = !verified;
    }

    if ($("sendOtp")) {
        $("sendOtp").hidden = verified;
        $("sendOtp").disabled = false;
    }

    if ($("logoutButton")) {
        $("logoutButton").hidden = !verified;
    }

    if (verified) {

        showStatus(
            "✓ Google account verified: " + user.email
        );

    } else {

        showStatus(
            "Sign in with Google to continue."
        );
    }
}


/* =========================================
   INITIALIZE GOOGLE SIGN-IN
   Legacy function name retained for script.js
========================================= */

export function initializeOTP() {

    const loginButton = $("sendOtp");
    const logoutButton = $("logoutButton");

    updateInterface(auth.currentUser);

    if (loginButton) {

        loginButton.addEventListener(
            "click",
            async () => {

                loginButton.disabled = true;

                try {

                    showStatus(
                        "Signing in with Google..."
                    );

                    sessionStorage.removeItem(
                        "assessmentResult"
                    );

                    const result = await signInWithPopup(
                        auth,
                        provider
                    );

                    if (!isGoogleUser(result.user)) {

                        await signOut(auth);

                        throw new Error(
                            "A verified Google account is required."
                        );
                    }

                    updateInterface(result.user);

                } catch (error) {

                    updateInterface(auth.currentUser);

                    showStatus(
                        "Google Sign-In failed: " +
                        error.message,
                        true
                    );

                } finally {

                    loginButton.disabled = false;
                }
            }
        );
    }

    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            async () => {

                try {

                    await resetVerification();

                } catch (error) {

                    showStatus(
                        "Sign out failed: " +
                        error.message,
                        true
                    );
                }
            }
        );
    }

    onAuthStateChanged(auth, user => {

        updateInterface(user);
    });
}


/* =========================================
   CHECK AUTHENTICATION
   Legacy function name retained for script.js
========================================= */

export function isPhoneVerified() {

    return isGoogleUser(auth.currentUser);
}


/* =========================================
   GET FIREBASE AUTHENTICATION TOKEN
========================================= */

export async function getVerifiedToken() {

    await auth.authStateReady();

    if (!isGoogleUser(auth.currentUser)) {

        throw new Error(
            "Please sign in with Google first."
        );
    }

    return await auth.currentUser.getIdToken();
}


/* =========================================
   SIGN OUT
========================================= */

export async function resetVerification() {

    sessionStorage.removeItem(
        "assessmentResult"
    );

    await signOut(auth);

    updateInterface(null);
}


/* =========================================
   PERSONAL DASHBOARD FUNCTIONS
========================================= */

// Get currently authenticated user

export async function getCurrentUser() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!isGoogleUser(user)) {
        return null;
    }

    return user;
}


// Protect dashboard pages

export async function requireDashboardLogin() {

    const user = await getCurrentUser();

    if (!user) {

        sessionStorage.removeItem(
            "assessmentResult"
        );

        window.location.replace(
            "assessment.html"
        );

        return null;
    }

    return user;
}


// Sign out from dashboard

export async function dashboardLogout() {

    await resetVerification();

    window.location.replace(
        "assessment.html"
    );
}


// Monitor account changes

let previousUid = auth.currentUser?.uid || null;

onAuthStateChanged(auth, user => {

    const currentUid = user?.uid || null;

    if (previousUid !== currentUid) {

        sessionStorage.removeItem(
            "assessmentResult"
        );
    }

    previousUid = currentUid;
});


// Export Firebase instances

export { app, auth };
