
const API = window.location.port === "5500"
    ? "http://127.0.0.1:8000"
    : window.location.origin;
const $ = id => document.getElementById(id);

const page = location.pathname.split("/").pop() || "index.html";


// ==========================================
// SIDEBAR NAVIGATION
// ==========================================

const links = [
    ["index.html", "⌂", "Overview"],
    ["dashboard.html", "▦", "My Dashboard"],
    ["assessment.html", "✚", "New Assessment"],
    ["dashboard.html#myHistory", "◷", "My History"],
    ["dashboard.html#myProfile", "♙", "My Profile"],
    ["stakeholder.html", "◎", "Stakeholder"],
    ["model.html", "▤", "Model Information"]
];

function renderSidebar() {

    if (!$("sidebar")) return;

    const currentPage = page + location.hash;

    $("sidebar").innerHTML = `
        <aside class="sidebar">

            <div class="brand">
                <span class="brand-icon">✚</span>

                <div>
                    <h2>ReAdmit Care</h2>
                    <small>Healthcare Analytics</small>
                </div>
            </div>

            <div class="nav-label">WORKSPACE</div>

            <nav>
                ${links.map(([url, icon, label]) => `
                    <a href="${url}"
                       class="${currentPage === url ? "active" : ""}">
                        ${icon} &nbsp; ${label}
                    </a>
                `).join("")}
            </nav>

            <div class="sidebar-note">
                General Physician Portal<br>
                Academic ML Project
            </div>

        </aside>
    `;
}

renderSidebar();

window.addEventListener("hashchange", renderSidebar);


// ==========================================
// ADVANCED MODEL FEATURES
// ==========================================

const advanced = {

    race: [
        "Caucasian",
        "AfricanAmerican",
        "Asian",
        "Hispanic",
        "Other"
    ],

    weight: "",

    payer_code: "MC",

    medical_specialty: "InternalMedicine",

    num_lab_procedures: 45,

    num_procedures: 1,

    diag_1: "250.00",

    diag_2: "401.9",

    diag_3: "414.01",

    number_diagnoses: 7,

    max_glu_serum: [
        "None",
        "Norm",
        ">200",
        ">300"
    ],

    A1Cresult: [
        "None",
        "Norm",
        ">7",
        ">8"
    ],

    change: ["No", "Ch"],

    diabetesMed: ["Yes", "No"]
};


// ==========================================
// MEDICATION FEATURES
// ==========================================

const medications = [

    "metformin",
    "repaglinide",
    "nateglinide",
    "chlorpropamide",
    "glimepiride",
    "acetohexamide",
    "glipizide",
    "glyburide",
    "tolbutamide",
    "pioglitazone",
    "rosiglitazone",
    "acarbose",
    "miglitol",
    "troglitazone",
    "tolazamide",
    "insulin",
    "glyburide-metformin",
    "glipizide-metformin"

];

medications.forEach(name => {

    advanced[name] = [
        "No",
        "Steady",
        "Up",
        "Down"
    ];
});

advanced.examide = ["No"];

advanced.citoglipton = ["No"];

[
    "glimepiride-pioglitazone",
    "metformin-rosiglitazone",
    "metformin-pioglitazone"

].forEach(name => {

    advanced[name] = ["No", "Steady"];
});


// ==========================================
// READABLE FEATURE NAMES
// ==========================================

function readableName(name) {

    const names = {

        number_inpatient: "Inpatient Visits",

        number_emergency: "Emergency Visits",

        number_outpatient: "Outpatient Visits",

        time_in_hospital: "Hospital Stay",

        num_medications: "Number of Medications",

        num_lab_procedures: "Laboratory Procedures",

        num_procedures: "Number of Procedures",

        diag_1: "Primary Diagnosis",

        diag_2: "Secondary Diagnosis",

        diag_3: "Additional Diagnosis",

        A1Cresult: "HbA1c Result",

        diabetesMed: "Diabetes Medication",

        max_glu_serum: "Maximum Glucose Serum",

        admission_type_id: "Admission Type",

        admission_source_id: "Admission Source",

        discharge_disposition_id: "Discharge Disposition",

        medical_specialty: "Medical Specialty"
    };

    return names[name] || name
        .replace(/_/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());
}


// ==========================================
// CREATE ADVANCED INPUT FIELDS
// ==========================================

function createAdvancedFields() {

    const container = $("advancedFields");

    if (!container) return;

    Object.entries(advanced).forEach(([name, value]) => {

        const wrapper = document.createElement("div");

        wrapper.className = "field";

        const label = document.createElement("label");

        label.htmlFor = name;

        label.textContent = readableName(name);

        let input;

        if (Array.isArray(value)) {

            input = document.createElement("select");

            value.forEach(item => {

                const option = document.createElement("option");

                option.value = item;

                option.textContent = item;

                input.appendChild(option);
            });

        } else {

            input = document.createElement("input");

            input.type = typeof value === "number"
                ? "number"
                : "text";

            input.value = value;

            input.defaultValue = value;

            if (input.type === "number") {

                input.min = "0";

                input.required = true;
            }
        }

        input.id = name;

        wrapper.append(label, input);

        container.appendChild(wrapper);
    });
}


// ==========================================
// CONVERT AGE INTO MODEL AGE GROUP
// ==========================================

function ageGroup(age) {

    const lower = Math.floor(age / 10) * 10;

    return `[${lower}-${lower + 10})`;
}


// ==========================================
// COLLECT ALL 47 MODEL FEATURES
// ==========================================

function collectFeatures() {

    const features = {

        age: ageGroup(Number($("age").value)),

        gender: $("gender").value,

        admission_type_id:
            Number($("admission_type_id").value),

        discharge_disposition_id:
            Number($("discharge_disposition_id").value),

        admission_source_id:
            Number($("admission_source_id").value),

        time_in_hospital:
            Number($("time_in_hospital").value),

        number_inpatient:
            Number($("number_inpatient").value),

        number_emergency:
            Number($("number_emergency").value),

        number_outpatient:
            Number($("number_outpatient").value),

        num_medications:
            Number($("num_medications").value)
    };

    Object.entries(advanced).forEach(([name, value]) => {

        const entered = $(name).value;

        features[name] = typeof value === "number"
            ? Number(entered)
            : entered || null;
    });

    return features;
}


// ==========================================
// DISPLAY STATUS MESSAGES
// ==========================================

function setStatus(id, message, error = false) {

    const element = $(id);

    if (!element) return;

    element.textContent = message;

    element.className = error
        ? "error-text"
        : "success-text";
}


// ==========================================
// AUTHENTICATED API REQUESTS
// ==========================================

async function apiRequest(endpoint, features, token) {

    const response = await fetch(`${API}${endpoint}`, {

        method: "POST",

        headers: {

            "Content-Type": "application/json",

            "Authorization": `Bearer ${token}`
        },

        body: JSON.stringify({ features })
    });

    if (!response.ok) {

        const data = await response.json()
            .catch(() => ({}));

        throw new Error(

            typeof data.detail === "string"

                ? data.detail

                : JSON.stringify(
                    data.detail ||
                    `Server request failed (${response.status})`
                )
        );
    }

    return response;
}


// ==========================================
// VERIFY ACCOUNT OWNERSHIP
// ==========================================

async function verifyOwner(authModule, ownerUid) {

    const user = await authModule.getCurrentUser();

    if (!user || user.uid !== ownerUid) {

        throw new Error(
            "Authentication session changed. Please sign in again."
        );
    }

    return user;
}


// ==========================================
// PATIENT ASSESSMENT PAGE
// ==========================================

if ($("predictionForm")) {

    createAdvancedFields();

    let authModule = null;

    let processing = false;

    $("predictButton").disabled = true;

    $("sendOtp").disabled = true;


    // INITIALIZE GOOGLE AUTHENTICATION

    import("./auth.js")

        .then(module => {

            authModule = module;

            module.initializeOTP();
        })

        .catch(error => {

            setStatus(

                "otpStatus",

                "Google authentication unavailable: " +
                error.message,

                true
            );
        });


    // PREDICTION FORM SUBMISSION

    $("predictionForm").addEventListener(

        "submit",

        async event => {

            event.preventDefault();

            if (processing) return;

            processing = true;

            const button = $("predictButton");

            button.disabled = true;

            button.textContent = "Processing...";

            try {

                if (!authModule) {

                    throw new Error(
                        "Google authentication is unavailable."
                    );
                }

                if (!authModule.isPhoneVerified()) {

                    throw new Error(
                        "Please sign in with Google first."
                    );
                }

                const user =
                    await authModule.getCurrentUser();

                if (!user) {

                    throw new Error(
                        "Please sign in with Google."
                    );
                }

                const ownerUid = user.uid;

                const token =
                    await authModule.getVerifiedToken();

                await verifyOwner(authModule, ownerUid);

                const features = collectFeatures();

                if (Object.keys(features).length !== 47) {

                    throw new Error(
                        "Model input count does not match."
                    );
                }

                setStatus(

                    "formStatus",

                    "Connecting to prediction server..."
                );


                // GET PREDICTION

                const response = await apiRequest(

                    "/predict",

                    features,

                    token
                );

                const prediction = await response.json();

                let explanation = null;


                // GET SHAP EXPLANATION

                setStatus(

                    "formStatus",

                    "Calculating SHAP explanation..."
                );

                try {

                    const explainResponse =
                        await apiRequest(

                            "/explain",

                            features,

                            token
                        );

                    explanation =
                        await explainResponse.json();

                } catch (error) {

                    console.error(
                        "SHAP request failed:",
                        error
                    );
                }


                // CHECK ACCOUNT OWNERSHIP

                await verifyOwner(
                    authModule,
                    ownerUid
                );


                // SAVE PERSONAL ASSESSMENT TO FIRESTORE

                setStatus(

                    "formStatus",

                    "Saving assessment to your personal history..."
                );

                let assessmentId = null;

                let historySaved = false;

                try {

                    const database =
                        await import("./database.js");

                    await verifyOwner(
                        authModule,
                        ownerUid
                    );

                    assessmentId =
                        await database.saveAssessment({

                            prediction,

                            explanation,

                            features
                        });

                    historySaved = true;

                } catch (error) {

                    console.error(
                        "History saving failed:",
                        error
                    );
                }


                // VERIFY ACCOUNT AGAIN

                await verifyOwner(
                    authModule,
                    ownerUid
                );


                // STORE TEMPORARY ASSESSMENT

                sessionStorage.setItem(

                    "assessmentResult",

                    JSON.stringify({

                        ownerUid,

                        assessmentId,

                        historySaved,

                        prediction,

                        explanation,

                        features
                    })
                );


                // OPEN RESULT PAGE

                location.href = "result.html";

            } catch (error) {

                setStatus(

                    "formStatus",

                    error.message,

                    true
                );

            } finally {

                processing = false;

                button.textContent =
                    "Assess Readmission Risk →";

                button.disabled =
                    !authModule?.isPhoneVerified();
            }
        }
    );


    // RESET PATIENT FORM
    // KEEP GOOGLE ACCOUNT SIGNED IN

    $("predictionForm").addEventListener(

        "reset",

        event => {

            if (processing) {

                event.preventDefault();

                return;
            }

            sessionStorage.removeItem(
                "assessmentResult"
            );

            $("formStatus").textContent = "";

            $("predictButton").disabled =
                !authModule?.isPhoneVerified();
        }
    );
}


// ==========================================
// RESULT PAGE
// ==========================================

async function initializeResultPage() {

    if (!$("resultContent")) return;

    $("resultContent").hidden = true;

    let auth;

    let user;

    try {

        auth = await import("./auth.js");

        user = await auth.getCurrentUser();

        if (!user) {

            throw new Error(
                "Google Sign-In required."
            );
        }

        await auth.getVerifiedToken();

    } catch {

        sessionStorage.removeItem(
            "assessmentResult"
        );

        location.replace("assessment.html");

        return;
    }


    // READ TEMPORARY RESULT

    const saved = sessionStorage.getItem(
        "assessmentResult"
    );

    let result = null;

    try {

        result = saved ? JSON.parse(saved) : null;

    } catch {

        result = null;
    }


    // BLOCK RESULTS FROM OTHER ACCOUNTS

    if (!result || result.ownerUid !== user.uid) {

        sessionStorage.removeItem(
            "assessmentResult"
        );

        $("emptyResult").hidden = false;

        return;
    }

    const ownerUid = user.uid;


    // MONITOR ACCOUNT CHANGES

    const { onAuthStateChanged } = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
    );

    onAuthStateChanged(auth.auth, currentUser => {

        if (currentUser?.uid !== ownerUid) {

            $("resultContent").hidden = true;

            sessionStorage.removeItem(
                "assessmentResult"
            );

            location.replace("assessment.html");
        }
    });


    // PROTECT AGAINST ACCOUNT CHANGES DURING LOADING

    try {

        await verifyOwner(auth, ownerUid);

    } catch {

        sessionStorage.removeItem(
            "assessmentResult"
        );

        location.replace("assessment.html");

        return;
    }


    const {

        prediction,

        explanation,

        features

    } = result;

    if (!prediction || !features) {

        $("emptyResult").hidden = false;

        return;
    }


    // READMISSION PROBABILITY

    const probability = Number(
        prediction.early_readmission_probability
    );

    if (

        !Number.isFinite(probability) ||

        probability < 0 ||

        probability > 100

    ) {

        $("emptyResult").hidden = false;

        return;
    }

    $("emptyResult").hidden = true;

    $("resultContent").hidden = false;


    // ILLUSTRATIVE RISK LEVEL

    let riskLevel;

    let riskColor;

    if (probability < 30) {

        riskLevel = "Low Risk";

        riskColor = "#168653";

    } else if (probability < 60) {

        riskLevel = "Moderate Risk";

        riskColor = "#d88a19";

    } else {

        riskLevel = "High Risk";

        riskColor = "#dc3545";
    }


    // DISPLAY PREDICTION

    $("patientHeading").textContent =
        "Personal Patient Assessment";

    $("probability").textContent =
        `${probability.toFixed(2)}%`;

    $("riskLevel").textContent = riskLevel;

    $("riskLevel").style.color = riskColor;

    $("predictionText").textContent =
        prediction.result;

    $("riskCircle").style.setProperty(

        "--risk",

        `${probability}%`
    );

    $("riskCircle").style.setProperty(

        "--risk-color",

        riskColor
    );


    // HOSPITAL VISIT COUNTS

    $("inpatientCount").textContent =
        features.number_inpatient;

    $("emergencyCount").textContent =
        features.number_emergency;

    $("outpatientCount").textContent =
        features.number_outpatient;


    // ======================================
    // SHAP FEATURE VISUALIZATION
    // ======================================

    const factors = explanation?.top_features || [];

    $("shapResults").replaceChildren();

    if (factors.length === 0) {

        $("shapResults").textContent =
            "SHAP explanation is currently unavailable.";

    } else {

        const maximum = Math.max(

            ...factors.map(
                item => Math.abs(Number(item.shap_value))
            ),

            0.000001
        );

        factors.forEach(item => {

            const value = Number(item.shap_value);

            const row = document.createElement("div");

            row.className = "shap-row";

            const label = document.createElement("div");

            label.className = "shap-label";

            const name = document.createElement("span");

            name.textContent =
                readableName(item.feature);

            const score = document.createElement("span");

            score.textContent =

                `${value > 0 ? "+" : ""}${value.toFixed(4)}`;

            score.className =

                value > 0 ? "increase" : "decrease";

            label.append(name, score);

            const track = document.createElement("div");

            track.className = "shap-track";

            const bar = document.createElement("div");

            bar.className = "shap-bar";

            bar.style.width =

                `${Math.abs(value) / maximum * 100}%`;

            bar.style.background =

                value > 0 ? "#dc3545" : "#168653";

            track.appendChild(bar);

            row.append(label, track);

            $("shapResults").appendChild(row);
        });
    }


    // ======================================
    // ASSESSMENT SUMMARY
    // ======================================

    const summary = {

        "Age Group": features.age,

        "Gender": features.gender,

        "Hospital Stay":
            `${features.time_in_hospital} days`,

        "Number of Medications":
            features.num_medications,

        "Model":
            prediction.model || "Tuned Random Forest",

        "Authentication":
            "Google Account Verified",

        "Input Mode":
            "Basic / Advanced with reviewed defaults",

        "Assessment History":
            result.historySaved === false
                ? "Not saved to cloud"
                : "Saved personal assessment"
    };

    $("assessmentSummary").replaceChildren();

    Object.entries(summary).forEach(([name, value]) => {

        const row = document.createElement("div");

        row.className = "summary-row";

        const label = document.createElement("span");

        label.textContent = name;

        const detail = document.createElement("strong");

        detail.textContent = value;

        row.append(label, detail);

        $("assessmentSummary").appendChild(row);
    });


    // ======================================
    // PERSONAL DASHBOARD BUTTON
    // ======================================

    const dashboardLink = document.createElement("a");

    dashboardLink.href = "dashboard.html";

    dashboardLink.className = "dashboard-primary-button";

    dashboardLink.textContent = "▦ View My Dashboard";

    dashboardLink.style.marginTop = "15px";

    dashboardLink.style.marginBottom = "15px";

    $("assessmentSummary").after(dashboardLink);


    // ======================================
    // HISTORY SAVING STATUS
    // ======================================

    if (result.historySaved === false) {

        setStatus(

            "reportStatus",

            "Prediction completed, but cloud history saving failed.",

            true
        );

    } else {

        setStatus(

            "reportStatus",

            "Assessment saved to your personal history."
        );
    }


    // ======================================
    // DOWNLOAD PDF REPORT
    // ======================================

    $("downloadReport").addEventListener(

        "click",

        async () => {

            $("downloadReport").disabled = true;

            try {

                await verifyOwner(auth, ownerUid);

                setStatus(

                    "reportStatus",

                    "Preparing PDF report..."
                );

                const token =
                    await auth.getVerifiedToken();

                await verifyOwner(auth, ownerUid);

                const response = await apiRequest(

                    "/download-report",

                    features,

                    token
                );

                const blob = await response.blob();

                await verifyOwner(auth, ownerUid);

                const url = URL.createObjectURL(blob);

                const link = document.createElement("a");

                link.href = url;

                link.download =
                    "ReAdmit_Care_Report.pdf";

                document.body.appendChild(link);

                link.click();

                link.remove();

                setTimeout(

                    () => URL.revokeObjectURL(url),

                    1000
                );

                setStatus(

                    "reportStatus",

                    "PDF report downloaded."
                );

            } catch (error) {

                setStatus(

                    "reportStatus",

                    error.message,

                    true
                );

            } finally {

                $("downloadReport").disabled = false;
            }
        }
    );


    // ======================================
    // COPY PREDICTION RESULT
    // ======================================

    $("copyResult").addEventListener(

        "click",

        async () => {

            try {

                await verifyOwner(auth, ownerUid);

                await navigator.clipboard.writeText(

                    `ReAdmit Care\n` +

                    `Prediction: ${prediction.result}\n` +

                    `Estimated probability: ${probability.toFixed(2)}%\n` +

                    `Illustrative risk level: ${riskLevel}\n` +

                    `Model: Tuned Random Forest\n` +

                    `Academic demonstration only.`
                );

                setStatus(

                    "reportStatus",

                    "Prediction copied successfully."
                );

            } catch (error) {

                setStatus(

                    "reportStatus",

                    error.message || "Unable to access clipboard.",

                    true
                );
            }
        }
    );


    // CLEAR PREVIOUS RESULT ON NEW ASSESSMENT

    document.querySelectorAll(

        'a[href="assessment.html"]'

    ).forEach(link => {

        link.addEventListener("click", () => {

            sessionStorage.removeItem(
                "assessmentResult"
            );
        });
    });
}


// ==========================================
// INITIALIZE RESULT PAGE
// ==========================================

initializeResultPage();
