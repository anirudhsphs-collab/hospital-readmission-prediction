
import {
    getFirestore,
    doc,
    collection,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import "./auth.js";

const auth = getAuth();
const db = getFirestore();

// Check authenticated Google user
function requireUser() {
    const user = auth.currentUser;

    if (
        !user ||
        !user.emailVerified ||
        !user.providerData.some(
            provider => provider.providerId === "google.com"
        )
    ) {
        throw new Error("Please sign in with Google.");
    }

    return user;
}

// Save personal account profile
export async function saveUserProfile() {
    const user = requireUser();

    const userRef = doc(db, "users", user.uid);

    await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp()
    }, { merge: true });
}

// Get personal profile
export async function getUserProfile() {
    const user = requireUser();

    const snapshot = await getDoc(
        doc(db, "users", user.uid)
    );

    return snapshot.exists()
        ? snapshot.data()
        : null;
}

// Save assessment under the current user's account
export async function saveAssessment(assessment) {
    const user = requireUser();

    await saveUserProfile();

    if (requireUser().uid !== user.uid) {
        throw new Error("Account changed. Please try again.");
    }

    const assessmentRef = collection(
        db,
        "users",
        user.uid,
        "assessments"
    );

    const saved = await addDoc(assessmentRef, {
        features: assessment.features,
        prediction: assessment.prediction,
        explanation: assessment.explanation || null,
        createdAt: serverTimestamp()
    });

    return saved.id;
}

// Get current user's assessment history
export async function getAssessmentHistory() {
    const user = requireUser();

    const historyRef = collection(
        db,
        "users",
        user.uid,
        "assessments"
    );

    const historyQuery = query(
        historyRef,
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(historyQuery);

    if (requireUser().uid !== user.uid) {
        throw new Error("Account changed. Please try again.");
    }

    return snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
    }));
}

// Get a particular saved assessment
export async function getAssessment(id) {
    const user = requireUser();

    const snapshot = await getDoc(
        doc(db, "users", user.uid, "assessments", id)
    );

    if (requireUser().uid !== user.uid) {
        throw new Error("Account changed. Please try again.");
    }

    return snapshot.exists()
        ? { id: snapshot.id, ...snapshot.data() }
        : null;
}

// Delete a personal assessment
export async function deleteAssessment(id) {
    const user = requireUser();

    await deleteDoc(
        doc(db, "users", user.uid, "assessments", id)
    );
}

export { db };
