
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from fastapi.responses import StreamingResponse
from io import BytesIO
from datetime import datetime, timezone
from xml.sax.saxutils import escape

import pandas as pd
import joblib
import numpy as np
import shap

from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle
)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet


app = FastAPI(
    title="Hospital Readmission Prediction API",
    description="Machine Learning Based Early Hospital Readmission Prediction",
    version="1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

MODEL_PATH = (
    Path(__file__).resolve().parent
    / "results"
    / "tuned_readmission_model.pkl"
)

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Trained model not found at: {MODEL_PATH}"
    )

model = joblib.load(MODEL_PATH)
FEATURES = list(model.feature_names_in_)


class PredictionRequest(BaseModel):
    features: dict


@app.get("/")
def home():
    return {
        "project": "Hospital Readmission Prediction",
        "status": "API Running Successfully",
        "model": "Tuned Random Forest"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "model_loaded": True,
        "total_features": len(FEATURES)
    }


@app.get("/features")
def get_features():
    return {
        "total_features": len(FEATURES),
        "features": FEATURES
    }


@app.post("/predict")
def predict_readmission(request: PredictionRequest):
    input_data = request.features

    missing_features = [
        feature for feature in FEATURES
        if feature not in input_data
    ]

    extra_features = [
        feature for feature in input_data
        if feature not in FEATURES
    ]

    if missing_features:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Missing required features",
                "features": missing_features
            }
        )

    if extra_features:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Unexpected features",
                "features": extra_features
            }
        )

    try:
        input_df = pd.DataFrame(
            [[input_data[feature] for feature in FEATURES]],
            columns=FEATURES
        )

        prediction = int(model.predict(input_df)[0])
        probabilities = model.predict_proba(input_df)[0]
        positive_index = list(model.classes_).index(1)
        probability = float(probabilities[positive_index])

        return {
            "prediction": prediction,
            "result": (
                "Early readmission predicted"
                if prediction == 1
                else "Early readmission not predicted"
            ),
            "early_readmission_probability": round(
                probability * 100, 2
            ),
            "model": "Tuned Random Forest"
        }

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


@app.post("/explain")
def explain_prediction(request: PredictionRequest):
    input_data = request.features

    missing_features = [
        feature for feature in FEATURES
        if feature not in input_data
    ]

    extra_features = [
        feature for feature in input_data
        if feature not in FEATURES
    ]

    if missing_features or extra_features:
        raise HTTPException(
            status_code=400,
            detail={
                "missing_features": missing_features,
                "extra_features": extra_features
            }
        )

    try:
        input_df = pd.DataFrame(
            [[input_data[feature] for feature in FEATURES]],
            columns=FEATURES
        )

        preprocessor = model.named_steps["preprocessor"]
        classifier = model.named_steps["classifier"]

        transformed_data = preprocessor.transform(input_df)

        if hasattr(transformed_data, "toarray"):
            transformed_data = transformed_data.toarray()

        transformed_names = preprocessor.get_feature_names_out()

        explainer = shap.TreeExplainer(classifier)
        shap_values = explainer.shap_values(transformed_data)

        positive_index = list(classifier.classes_).index(1)

        if isinstance(shap_values, list):
            contributions = shap_values[positive_index][0]
        else:
            values = np.asarray(shap_values)

            if values.ndim == 3:
                contributions = values[0, :, positive_index]
            else:
                contributions = values[0]

        grouped_contributions = {
            feature: 0.0 for feature in FEATURES
        }

        for name, contribution in zip(
            transformed_names, contributions
        ):
            if name.startswith("num__"):
                original_feature = name[len("num__"):]

            elif name.startswith("cat__"):
                encoded_name = name[len("cat__"):]

                categorical_features = sorted(
                    preprocessor.transformers_[1][2],
                    key=len,
                    reverse=True
                )

                original_feature = next(
                    (
                        feature for feature in categorical_features
                        if encoded_name == feature
                        or encoded_name.startswith(feature + "_")
                    ),
                    None
                )
            else:
                original_feature = None

            if original_feature in grouped_contributions:
                grouped_contributions[original_feature] += float(
                    contribution
                )

        explanations = [
            {
                "feature": feature,
                "shap_value": round(value, 6),
                "direction": (
                    "increases predicted readmission probability"
                    if value > 0
                    else "decreases predicted readmission probability"
                    if value < 0
                    else "no contribution"
                )
            }
            for feature, value in grouped_contributions.items()
        ]

        explanations.sort(
            key=lambda item: abs(item["shap_value"]),
            reverse=True
        )

        return {
            "model": "Tuned Random Forest",
            "explanation_method": "SHAP TreeExplainer",
            "top_features": explanations[:10]
        }

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )


# FEATURE 2: RISK DASHBOARD

@app.post("/risk-dashboard")
def risk_dashboard(request: PredictionRequest):
    prediction_data = predict_readmission(request)
    probability = prediction_data["early_readmission_probability"]

    # Illustrative thresholds, not clinically validated
    if probability < 30:
        risk_level = "Low"
        risk_color = "green"
    elif probability < 60:
        risk_level = "Moderate"
        risk_color = "orange"
    else:
        risk_level = "High"
        risk_color = "red"

    return {
        "model": "Tuned Random Forest",
        "prediction": prediction_data["prediction"],
        "result": prediction_data["result"],
        "risk_percentage": probability,
        "risk_level": risk_level,
        "risk_color": risk_color,
        "gauge_value": probability,
        "disclaimer": (
            "Risk categories are illustrative and are not "
            "clinically validated."
        )
    }


# FEATURE 3: DOWNLOADABLE PDF REPORT

@app.post("/download-report")
def download_report(request: PredictionRequest):
    prediction_data = predict_readmission(request)
    probability = prediction_data["early_readmission_probability"]

    if probability < 30:
        risk_level = "Low"
    elif probability < 60:
        risk_level = "Moderate"
    else:
        risk_level = "High"

    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=(595, 842),
        rightMargin=45,
        leftMargin=45,
        topMargin=45,
        bottomMargin=45
    )

    styles = getSampleStyleSheet()
    elements = []

    title = Paragraph(
        "Hospital Readmission Prediction Report",
        styles["Title"]
    )
    elements.append(title)
    elements.append(Spacer(1, 15))

    generated_at = datetime.now(timezone.utc).strftime(
        "%d %B %Y, %H:%M UTC"
    )

    elements.append(
        Paragraph(
            f"Generated: {generated_at}",
            styles["Normal"]
        )
    )

    elements.append(Spacer(1, 20))

    summary = [
        ["Prediction Summary", "Result"],
        ["Model", "Tuned Random Forest"],
        ["Prediction", prediction_data["result"]],
        ["Readmission Probability", f"{probability}%"],
        ["Illustrative Risk Level", risk_level]
    ]

    summary_table = Table(
        summary,
        colWidths=[190, 315],
        repeatRows=1
    )

    summary_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#174a78")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 10)
        ])
    )

    elements.append(summary_table)
    elements.append(Spacer(1, 22))

    elements.append(
        Paragraph("Patient Input Features", styles["Heading2"])
    )
    elements.append(Spacer(1, 10))

    feature_rows = [["Feature", "Value"]]

    for feature in FEATURES:
        value = request.features[feature]

        feature_rows.append([
            Paragraph(escape(str(feature)), styles["BodyText"]),
            Paragraph(escape(str(value)), styles["BodyText"])
        ])

    feature_table = Table(
        feature_rows,
        colWidths=[245, 260],
        repeatRows=1,
        hAlign="LEFT"
    )

    feature_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#174a78")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7)
        ])
    )

    elements.append(feature_table)
    elements.append(Spacer(1, 20))

    elements.append(
        Paragraph(
            "Disclaimer: This report is for academic and "
            "educational purposes only. The model and risk "
            "categories have not been clinically validated "
            "for patient care.",
            styles["BodyText"]
        )
    )

    document.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                'attachment; filename="readmission_report.pdf"'
        }
    )
