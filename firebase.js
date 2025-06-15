/**
 * ====================================================================
 * The Ascent Circle - Firebase Service Module
 * ====================================================================
 * This file contains all the core logic for interacting with Firebase.
 * It initializes Firebase and provides helper functions for authentication,
 * database operations, file storage, and real-time features.
 */

// --- 1. FIREBASE INITIALIZATION ---
// IMPORTANT: Replace this with your project's Firebase configuration object!
const firebaseConfig = {
  apiKey: "AIzaSyAJFXRelDMx_iI5TU7Ik054qfcJC5mLPk4",
  authDomain: "ascentcircle.firebaseapp.com",
  projectId: "ascentcircle",
  storageBucket: "ascentcircle.firebasestorage.app",
  messagingSenderId: "245447766367",
  appId: "1:245447766367:web:230ff25e32df85e35006ea",
  measurementId: "G-7PP9BYWZT3"
};

// Initialize Firebase App
firebase.initializeApp(firebaseConfig);

// Get references to Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();


// --- 2. AUTHENTICATION HELPER FUNCTIONS ---

/**
 * Creates a new user in Firebase Auth and saves their details to Firestore.
 * @param {string} name - The user's full name.
 * @param {string} email - The user's email address.
 * @param {string} phone - The user's phone number.
 * @param {string} year - The user's academic year.
 * @param {string} password - The user's chosen password.
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function signUpUser(name, email, phone, year, password) {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    // Set the user's display name in Firebase Auth
    await user.updateProfile({ displayName: name });
    // Create the user document in Firestore
    await db.collection('users').doc(user.uid).set({
        name: name,
        email: email,
        phone: phone,
        year: year,
        role: 'user', // Default role for all new signups
        points: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return userCredential;
}

/**
 * Logs a user in with their email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function loginUser(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}

/**
 * Logs the current user out.
 * @returns {Promise<void>}
 */
async function logoutUser() {
    return auth.signOut();
}


// --- 3. FIRESTORE DATABASE HELPER FUNCTIONS ---

/**
 * Fetches a user's data document from Firestore.
 * @param {string} uid - The user's unique ID.
 * @returns {Promise<object|null>} The user's data object, or null if not found.
 */
async function getUserData(uid) {
    const userDoc = await db.collection('users').doc(uid).get();
    return userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
}

/**
 * Updates a user's role in Firestore (Admin Only).
 * @param {string} uid - The UID of the user to update.
 * @param {string} newRole - The new role ('user', 'team-member', 'admin').
 * @returns {Promise<void>}
 */
async function updateUserRole(uid, newRole) {
    return db.collection('users').doc(uid).update({ role: newRole });
}

/**
 * Updates a user's profile information (email, phone).
 * @param {string} uid - The UID of the user to update.
 * @param {object} data - An object containing the fields to update (e.g., { phone: 'newNumber' }).
 * @returns {Promise<void>}
 */
async function updateUserProfile(uid, data) {
    return db.collection('users').doc(uid).update(data);
}

/**
 * Adds points to a user's score for community contributions.
 * @param {string} uid - The UID of the user to reward.
 * @param {number} pointsToAdd - The number of points to add.
 * @returns {Promise<void>}
 */
async function addUserPoints(uid, pointsToAdd) {
    const userRef = db.collection('users').doc(uid);
    return userRef.update({
        points: firebase.firestore.FieldValue.increment(pointsToAdd)
    });
}

/**
 * Fetches the top contributors for the leaderboard.
 * @param {function} callback - A function to call with the leaderboard data.
 * @returns {function} The unsubscribe function for the listener.
 */
function listenForLeaderboard(callback) {
    return db.collection('users').orderBy('points', 'desc').limit(5).onSnapshot(snapshot => {
        const leaderboard = [];
        snapshot.forEach(doc => leaderboard.push(doc.data()));
        callback(leaderboard);
    });
}


// --- 4. FIREBASE STORAGE HELPER FUNCTIONS ---

/**
 * Uploads a study material file to Storage and creates a pending record in Firestore.
 * @param {File} file - The file to upload.
 * @param {string} title - The title of the material.
 * @param {string} uploaderUid - The UID of the user uploading the material.
 * @param {string} uploaderName - The name of the user uploading the material.
 * @returns {Promise<void>}
 */
async function uploadStudyMaterial(file, title, uploaderUid, uploaderName) {
    const filePath = `study-materials/${uploaderUid}/${Date.now()}-${file.name}`;
    const storageRef = storage.ref(filePath);
    
    // Upload the file
    await storageRef.put(file);
    
    // Get the download URL
    const fileURL = await storageRef.getDownloadURL();
    
    // Create a document in Firestore for admin approval
    await db.collection('studyMaterials').add({
        title: title,
        fileURL: fileURL,
        uploaderUid: uploaderUid,
        uploaderName: uploaderName,
        status: 'pending', // Initial status
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}


// --- 5. REAL-TIME MESSAGING HELPER FUNCTIONS ---

/**
 * Sends a message to the main group chat.
 * @param {firebase.User} user - The authenticated user object.
 * @param {string} messageText - The text of the message.
 * @returns {Promise<firebase.firestore.DocumentReference>}
 */
function sendMessage(user, messageText) {
    if (!user || !user.uid || !user.displayName) {
        return Promise.reject(new Error("Invalid user object for sending message."));
    }
    return db.collection('groupChat').add({
        text: messageText,
        uid: user.uid,
        displayName: user.displayName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Listens for new messages in the group chat in real-time.
 * @param {function} callback - A function to be called with the array of messages whenever it updates.
 * @returns {function} The unsubscribe function for the listener.
 */
function listenForMessages(callback) {
    return db.collection('groupChat').orderBy('createdAt', 'asc').limit(100).onSnapshot(snapshot => {
        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        callback(messages);
    });
}

console.log("Firebase services initialized.");

