const form = document.getElementById("predictionForm");
const resultDiv = document.getElementById("result");
const predictButton = document.getElementById("predictButton");

// Add medication options
document.querySelectorAll(".medication").forEach(function(select) {
    ["No", "Steady", "Up", "Down"].forEach(function(value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
});

document.querySelectorAll(".combination-medication").forEach(function(select) {
    ["No", "Steady"].forEach(function(value) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
});

form.addEventListener("submit", async function(event) {
    event.preventDefault();

    resultDiv.style.display = "block";
    resultDiv.className = "";
    resultDiv.textContent = "Processing prediction...";

    predictButton.disabled = true;
    predictButton.textContent = "Please wait...";

    const getValue = function(id) {
        return document.getElementById(id).value;
    };

    const getNumber = function(id) {
        return Number(getValue(id));
    };

    const features = {
        race: getValue("race"),
        gender: getValue("gender"),
        age: getValue("age"),
        weight: getValue("weight") || null,

        admission_type_id: getNumber("admission_type_id"),
        discharge_disposition_id: getNumber("discharge_disposition_id"),
        admission_source_id: getNumber("admission_source_id"),
        time_in_hospital: getNumber("time_in_hospital"),

        payer_code: getValue("payer_code"),
        medical_specialty: getValue("medical_specialty"),

        num_lab_procedures: getNumber("num_lab_procedures"),
        num_procedures: getNumber("num_procedures"),
        num_medications: getNumber("num_medications"),

        number_outpatient: getNumber("number_outpatient"),
        number_emergency: getNumber("number_emergency"),
        number_inpatient: getNumber("number_inpatient"),

        diag_1: getValue("diag_1"),
        diag_2: getValue("diag_2"),
        diag_3: getValue("diag_3"),

        number_diagnoses: getNumber("number_diagnoses"),

        max_glu_serum: getValue("max_glu_serum"),
        A1Cresult: getValue("A1Cresult"),

        metformin: getValue("metformin"),
        repaglinide: getValue("repaglinide"),
        nateglinide: getValue("nateglinide"),
        chlorpropamide: getValue("chlorpropamide"),
        glimepiride: getValue("glimepiride"),
        acetohexamide: getValue("acetohexamide"),
        glipizide: getValue("glipizide"),
        glyburide: getValue("glyburide"),
        tolbutamide: getValue("tolbutamide"),
        pioglitazone: getValue("pioglitazone"),
        rosiglitazone: getValue("rosiglitazone"),
        acarbose: getValue("acarbose"),
        miglitol: getValue("miglitol"),
        troglitazone: getValue("troglitazone"),
        tolazamide: getValue("tolazamide"),
        examide: getValue("examide"),
        citoglipton: getValue("citoglipton"),
        insulin: getValue("insulin"),

        "glyburide-metformin": getValue("glyburide-metformin"),
        "glipizide-metformin": getValue("glipizide-metformin"),
        "glimepiride-pioglitazone": getValue("glimepiride-pioglitazone"),
        "metformin-rosiglitazone": getValue("metformin-rosiglitazone"),
        "metformin-pioglitazone": getValue("metformin-pioglitazone"),

        change: getValue("change"),
        diabetesMed: getValue("diabetesMed")
    };

    try {
        const response = await fetch("https://hospital-readmission-prediction-5ruq.onrender.com/predict", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                features: features
            })
        });
console.log("Prediction request features:", features);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                typeof data.detail === "string"
                    ? data.detail
                    : JSON.stringify(data.detail)
            );
        }

        resultDiv.className = "success";

        resultDiv.innerHTML = `
            <h2>Prediction Result</h2>
            <p><strong>${data.result}</strong></p>
            <p>Estimated probability: <strong>${data.early_readmission_probability}%</strong></p>
            <p>Model: ${data.model}</p>
        `;
        // Get SHAP explanation
        try {
            const explainResponse = await fetch(
                "http://127.0.0.1:8000/explain",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ features: features })
                }
            );

            if (!explainResponse.ok) {
                throw new Error("SHAP request failed");
            }

            const explanation = await explainResponse.json();

            const shapSection = document.createElement("div");
            shapSection.className = "shap-section";

            const heading = document.createElement("h3");
            heading.textContent = "AI Explanation - Top Influencing Features";
            shapSection.appendChild(heading);

            explanation.top_features.forEach(function(item) {
                const row = document.createElement("p");

                const direction = item.shap_value > 0
                    ? "Increases predicted risk"
                    : item.shap_value < 0
                        ? "Decreases predicted risk"
                        : "No contribution";

                row.textContent =
                    item.feature + ": " +
                    direction + " (" +
                    Number(item.shap_value).toFixed(4) + ")";

                shapSection.appendChild(row);
            });

            resultDiv.appendChild(shapSection);

        } catch (explainError) {
            console.error("SHAP error:", explainError);

            const message = document.createElement("p");
            message.textContent =
                "AI explanation is temporarily unavailable.";

            resultDiv.appendChild(message);
        }

    } catch (error) {
        resultDiv.className = "error";
        resultDiv.textContent =
            "Unable to get prediction. Please check whether the backend server is running. Details: " +
            error.message;

    } finally {
        predictButton.disabled = false;
        predictButton.textContent = "Predict Readmission";
    }
});
