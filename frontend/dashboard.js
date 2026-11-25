
import {
    requireDashboardLogin,
    dashboardLogout,
    getCurrentUser,
    auth
} from "./auth.js";

import {
    saveUserProfile,
    getAssessmentHistory,
    deleteAssessment
} from "./database.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";


const $ = id => document.getElementById(id);

let assessments = [];
let selectedAssessment = null;
let riskChart = null;
let dashboardUid = null;


/* =========================================
   RISK CLASSIFICATION
========================================= */

function getProbability(record) {

    const value = Number(
        record.prediction?.early_readmission_probability
    );

    return Number.isFinite(value)
        ? Math.max(0, Math.min(100, value))
        : 0;
}


function getRiskLevel(probability) {

    if (probability < 30) {
        return "Low Risk";
    }

    if (probability < 60) {
        return "Moderate Risk";
    }

    return "High Risk";
}


function getRiskColor(probability) {

    if (probability < 30) {
        return "#168653";
    }

    if (probability < 60) {
        return "#d97706";
    }

    return "#dc3545";
}


/* =========================================
   DATE FORMATTING
========================================= */

function formatDate(timestamp) {

    if (!timestamp) return "Pending";

    const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


/* =========================================
   ACCOUNT PRIVACY
========================================= */

async function checkAccount() {

    const user = await getCurrentUser();

    if (!user || user.uid !== dashboardUid) {

        $("dashboardContent").hidden = true;

        assessments = [];
        selectedAssessment = null;

        sessionStorage.removeItem(
            "assessmentResult"
        );

        window.location.replace("assessment.html");

        return false;
    }

    return true;
}


/* =========================================
   PROFILE INFORMATION
========================================= */

function renderProfile(user) {

    $("welcomeName").textContent =
        "Welcome back, " +
        (user.displayName || "User") + "!";

    $("profileName").textContent =
        user.displayName || "Not provided";

    $("profileEmail").textContent =
        user.email || "Not provided";

    $("memberSince").textContent =
        formatDate(user.metadata.creationTime);

    if (user.photoURL) {

        [
            "profileAvatar",
            "largeProfileAvatar"
        ].forEach(id => {

            const container = $(id);

            const image = document.createElement("img");

            image.src = user.photoURL;
            image.alt = "Google profile photo";
            image.referrerPolicy = "no-referrer";

            image.addEventListener("error", () => {

                container.textContent = "👤";
            });

            container.replaceChildren(image);
        });
    }
}


/* =========================================
   SUMMARY CARDS
========================================= */

function renderSummary() {

    $("totalAssessments").textContent =
        assessments.length;

    $("savedReports").textContent =
        assessments.length;

    if (assessments.length === 0) {

        $("latestRisk").textContent = "--";

        $("latestRiskLevel").textContent =
            "No Data";

        $("predictionRiskLevel").textContent =
            "No Assessment Yet";

        $("latestPredictionText").textContent =
            "Complete your first assessment to view your prediction.";

        $("latestRiskLevel").style.color = "";

        $("predictionRiskLevel").style.color = "";

        return;
    }

    const latest = assessments[0];

    const probability = getProbability(latest);

    const riskLevel = getRiskLevel(probability);

    const color = getRiskColor(probability);

    $("latestRisk").textContent =
        probability.toFixed(2) + "%";

    $("latestRiskLevel").textContent =
        riskLevel;

    $("latestRiskLevel").style.color = color;

    $("predictionRiskLevel").textContent =
        riskLevel;

    $("predictionRiskLevel").style.color = color;

    $("latestPredictionText").textContent =
        latest.prediction?.result ||
        "Assessment completed.";
}


/* =========================================
   RISK HISTORY CHART
========================================= */

function renderChart() {

    if (riskChart) {

        riskChart.destroy();

        riskChart = null;
    }

    const canvas = $("riskHistoryChart");

    const empty = $("emptyChart");

    if (assessments.length === 0) {

        canvas.hidden = true;

        empty.hidden = false;

        empty.textContent =
            "Your risk history will appear after your first assessment.";

        return;
    }

    if (typeof window.Chart === "undefined") {

        canvas.hidden = true;

        empty.hidden = false;

        empty.textContent =
            "Chart unavailable. Please check your internet connection.";

        return;
    }

    canvas.hidden = false;

    empty.hidden = true;

    const chronological = [...assessments].reverse();

    riskChart = new window.Chart(canvas, {

        type: "line",

        data: {

            labels: chronological.map(record =>
                formatDate(record.createdAt)
            ),

            datasets: [{

                label: "Estimated Readmission Risk",

                data: chronological.map(record =>
                    getProbability(record)
                ),

                borderColor: "#087f83",

                backgroundColor:
                    "rgba(8, 127, 131, 0.10)",

                pointBackgroundColor: "#087f83",

                pointBorderColor: "#ffffff",

                pointBorderWidth: 2,

                pointRadius: 5,

                borderWidth: 3,

                tension: 0.35,

                fill: true
            }]
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

                legend: {
                    display: false
                },

                tooltip: {

                    callbacks: {

                        label: context =>
                            context.parsed.y.toFixed(2) + "%"
                    }
                }
            },

            scales: {

                y: {

                    min: 0,

                    max: 100,

                    ticks: {

                        callback: value =>
                            value + "%"
                    },

                    grid: {
                        color: "#e8eef2"
                    }
                },

                x: {

                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}


/* =========================================
   ASSESSMENT HISTORY TABLE
========================================= */

function renderHistory() {

    const tableBody = $("historyTableBody");

    const filter = $("historyFilter").value;

    tableBody.replaceChildren();

    const filtered = assessments.filter(record => {

        return filter === "All" ||
            getRiskLevel(getProbability(record)) === filter;
    });

    $("emptyHistory").hidden =
        filtered.length !== 0;

    filtered.forEach(record => {

        const probability = getProbability(record);

        const riskLevel = getRiskLevel(probability);

        const features = record.features || {};

        const row = document.createElement("tr");

        const values = [

            formatDate(record.createdAt),

            features.age ?? "--",

            features.gender ?? "--",

            features.time_in_hospital != null
                ? features.time_in_hospital + " days"
                : "--",

            features.num_medications ?? "--",

            probability.toFixed(2) + "%"
        ];

        values.forEach(value => {

            const cell = document.createElement("td");

            cell.textContent = value;

            row.appendChild(cell);
        });


        const riskCell = document.createElement("td");

        const badge = document.createElement("span");

        badge.className = "history-risk-badge";

        badge.textContent = riskLevel;

        badge.style.color = getRiskColor(probability);

        badge.style.backgroundColor =
            probability < 30
                ? "#e5f6ed"
                : probability < 60
                    ? "#fff3dc"
                    : "#fde8e8";

        riskCell.appendChild(badge);

        row.appendChild(riskCell);


        const actionCell = document.createElement("td");

        const button = document.createElement("button");

        button.className = "view-history-button";

        button.textContent = "View Details";

        button.addEventListener("click", () => {

            showAssessmentDetails(record);
        });

        actionCell.appendChild(button);

        row.appendChild(actionCell);

        tableBody.appendChild(row);
    });
}


/* =========================================
   SAVED ASSESSMENT DETAILS
========================================= */

async function showAssessmentDetails(record) {

    if (!await checkAccount()) return;

    selectedAssessment = record;

    const probability = getProbability(record);

    const features = record.features || {};

    const container = $("savedAssessmentDetails");

    container.replaceChildren();

    const details = {

        "Assessment Date":
            formatDate(record.createdAt),

        "Age Group":
            features.age ?? "--",

        "Gender":
            features.gender ?? "--",

        "Hospital Stay":
            features.time_in_hospital ?? "--",

        "Number of Medications":
            features.num_medications ?? "--",

        "Inpatient Visits":
            features.number_inpatient ?? "--",

        "Emergency Visits":
            features.number_emergency ?? "--",

        "Outpatient Visits":
            features.number_outpatient ?? "--",

        "Estimated Risk":
            probability.toFixed(2) + "%",

        "Risk Level":
            getRiskLevel(probability),

        "Prediction":
            record.prediction?.result || "--",

        "Model":
            "Tuned Random Forest"
    };

    Object.entries(details).forEach(([label, value]) => {

        const row = document.createElement("div");

        row.className = "saved-detail-row";

        const name = document.createElement("strong");

        name.textContent = label;

        const content = document.createElement("span");

        content.textContent = value;

        row.append(name, content);

        container.appendChild(row);
    });

    $("assessmentModal").showModal();
}


/* =========================================
   OPEN PREVIOUS RESULT
========================================= */

$("openSavedResult").addEventListener(
    "click",
    async () => {

        if (!selectedAssessment) return;

        if (!await checkAccount()) return;

        sessionStorage.setItem(

            "assessmentResult",

            JSON.stringify({

                ownerUid: dashboardUid,

                prediction:
                    selectedAssessment.prediction,

                explanation:
                    selectedAssessment.explanation,

                features:
                    selectedAssessment.features
            })
        );

        window.location.href = "result.html";
    }
);


/* =========================================
   DELETE PERSONAL ASSESSMENT
========================================= */

$("deleteSavedAssessment").addEventListener(
    "click",
    async () => {

        if (!selectedAssessment) return;

        if (!await checkAccount()) return;

        const confirmed = window.confirm(

            "Delete this assessment permanently? " +
            "This action cannot be undone."
        );

        if (!confirmed) return;

        const button = $("deleteSavedAssessment");

        button.disabled = true;

        try {

            await deleteAssessment(
                selectedAssessment.id
            );

            if (!await checkAccount()) return;

            $("assessmentModal").close();

            selectedAssessment = null;

            await loadHistory();

        } catch (error) {

            console.error(error);

            alert("Unable to delete assessment.");

        } finally {

            button.disabled = false;
        }
    }
);


/* =========================================
   CLOSE DETAILS POPUP
========================================= */

$("closeModal").addEventListener("click", () => {

    $("assessmentModal").close();

    selectedAssessment = null;
});


/* =========================================
   FILTER HISTORY
========================================= */

$("historyFilter").addEventListener(
    "change",
    renderHistory
);


/* =========================================
   LOAD SAVED HISTORY
========================================= */

async function loadHistory() {

    const records = await getAssessmentHistory();

    if (!await checkAccount()) return;

    assessments = records;

    renderSummary();

    renderChart();

    renderHistory();
}


/* =========================================
   SIGN OUT
========================================= */

$("dashboardLogout").addEventListener(
    "click",
    async () => {

        $("dashboardContent").hidden = true;

        try {

            await dashboardLogout();

        } catch (error) {

            console.error(error);

            $("dashboardContent").hidden = false;

            alert("Sign out failed. Please try again.");
        }
    }
);


/* =========================================
   INITIALIZE PERSONAL DASHBOARD
========================================= */

async function initializeDashboard() {

    try {

        const user = await requireDashboardLogin();

        if (!user) return;

        dashboardUid = user.uid;

        onAuthStateChanged(auth, currentUser => {

            if (currentUser?.uid !== dashboardUid) {

                $("dashboardContent").hidden = true;

                $("assessmentModal").close();

                assessments = [];

                selectedAssessment = null;

                if (riskChart) {
                    riskChart.destroy();
                }

                sessionStorage.removeItem(
                    "assessmentResult"
                );

                window.location.replace(
                    "assessment.html"
                );
            }
        });

        renderProfile(user);

        await saveUserProfile();

        await loadHistory();

        if (!await checkAccount()) return;

        $("dashboardLoading").hidden = true;

        $("dashboardContent").hidden = false;

    } catch (error) {

        console.error("Dashboard error:", error);

        $("dashboardLoading").hidden = true;

        $("dashboardContent").hidden = true;

        $("dashboardError").hidden = false;

        $("dashboardError").textContent =
            "Unable to load your personal dashboard. " +
            "Please check your login and database connection.";
    }
}

initializeDashboard();
