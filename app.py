import os
import logging

from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse

from pydantic import BaseModel
from pathlib import Path
from io import BytesIO
from datetime import datetime, timezone
from xml.sax.saxutils import escape

import pandas as pd
import joblib
import numpy as np
import shap

import firebase_admin
from firebase_admin import auth
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle
)

from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet


# ==========================================
# APPLICATION CONFIGURATION
# ==========================================

app = FastAPI(
    title="ReAdmit Care API",
    description="Hospital Readmission Prediction System",
    version="2.0"
)

logger = logging.getLogger(__name__)


# ==========================================
# CORS CONFIGURATION
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ==========================================
# FIREBASE CONFIGURATION
# ==========================================

FIREBASE_PROJECT_ID = os.getenv(
    "FIREBASE_PROJECT_ID",
    "readmit-care"
)

firebase_app = firebase_admin.initialize_app(
    options={
        "projectId": FIREBASE_PROJECT_ID
    }
)

security = HTTPBearer(auto_error=False)


# ==========================================
# GOOGLE AUTHENTICATION VERIFICATION
# ==========================================

def verify_google_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Google authentication required."
        )

    try:
        decoded_token = id_token.verify_firebase_token(
            credentials.credentials,
            google_requests.Request(),
            audience=FIREBASE_PROJECT_ID
        )

        expected_issuer = (
            f"https://securetoken.google.com/"
            f"{FIREBASE_PROJECT_ID}"
        )

        if decoded_token.get("iss") != expected_issuer:
            raise ValueError("Invalid token issuer")

        uid = decoded_token.get("sub")

        if not isinstance(uid, str) or not uid or len(uid) > 128:
            raise ValueError("Invalid user identity")

    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token."
        )

    except Exception:
        logger.exception("Token verification failed")

        raise HTTPException(
            status_code=503,
            detail="Authentication verification unavailable."
        )

    provider = decoded_token.get(
        "firebase", {}
    ).get("sign_in_provider")

    if provider != "google.com":
        raise HTTPException(
            status_code=403,
            detail="Google Sign-In required."
        )

    if decoded_token.get("email_verified") is not True:
        raise HTTPException(
            status_code=403,
            detail="Verified email required."
        )

    return decoded_token


# ==========================================
# LOAD TRAINED MACHINE LEARNING MODEL
# ==========================================

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


# ==========================================
# REQUEST SCHEMA
# ==========================================

class PredictionRequest(BaseModel):

    features: dict


# ==========================================
# VALIDATE MODEL INPUTS
# ==========================================

def validate_features(input_data):

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
                "error": "Invalid model features",
                "missing_features": missing_features,
                "extra_features": extra_features
            }
        )

    return pd.DataFrame(
        [[input_data[feature] for feature in FEATURES]],
        columns=FEATURES
    )


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health_check():

    return {
        "status": "healthy",
        "model_loaded": True,
        "total_features": len(FEATURES),
        "authentication_required": True
    }


# ==========================================
# MODEL FEATURE INFORMATION
# ==========================================

@app.get("/features")
def get_features():

    return {
        "total_features": len(FEATURES),
        "features": FEATURES
    }


# ==========================================
# VERIFY AUTHENTICATION ENDPOINT
# ==========================================

@app.get("/verify-auth")
def verify_authentication(
    user: dict = Depends(verify_google_user)
):

    return {
        "authenticated": True,
        "provider": "Google",
        "email_verified": True
    }


# ==========================================
# READMISSION PREDICTION
# ==========================================

@app.post(
    "/predict",
    dependencies=[Depends(verify_google_user)]
)
def predict_readmission(request: PredictionRequest):

    input_df = validate_features(request.features)

    try:

        prediction = int(
            model.predict(input_df)[0]
        )

        probabilities = model.predict_proba(
            input_df
        )[0]

        positive_index = list(
            model.classes_
        ).index(1)

        probability = float(
            probabilities[positive_index]
        )

        return {

            "prediction": prediction,

            "result": (
                "Early readmission predicted"
                if prediction == 1
                else "Early readmission not predicted"
            ),

            "early_readmission_probability": round(
                probability * 100,
                2
            ),

            "model": "Tuned Random Forest"
        }

    except Exception:

        logger.exception("Prediction failed")

        raise HTTPException(
            status_code=400,
            detail="Prediction failed. Check the model input values."
        )


# ==========================================
# SHAP EXPLAINABILITY
# ==========================================

@app.post(
    "/explain",
    dependencies=[Depends(verify_google_user)]
)
def explain_prediction(request: PredictionRequest):

    input_df = validate_features(request.features)

    try:

        preprocessor = model.named_steps[
            "preprocessor"
        ]

        classifier = model.named_steps[
            "classifier"
        ]

        # Apply training preprocessing

        transformed_data = preprocessor.transform(
            input_df
        )

        if hasattr(transformed_data, "toarray"):

            transformed_data = transformed_data.toarray()

        # Retrieve encoded feature names

        transformed_names = (
            preprocessor.get_feature_names_out()
        )

        # Calculate SHAP values

        explainer = shap.TreeExplainer(
            classifier
        )

        shap_values = explainer.shap_values(
            transformed_data
        )

        # Select positive readmission class

        positive_index = list(
            classifier.classes_
        ).index(1)

        if isinstance(shap_values, list):

            contributions = shap_values[
                positive_index
            ][0]

        else:

            values = np.asarray(shap_values)

            if values.ndim == 3:

                contributions = values[
                    0, :, positive_index
                ]

            else:

                contributions = values[0]

        # Group encoded features

        grouped_contributions = {
            feature: 0.0
            for feature in FEATURES
        }

        for name, contribution in zip(
            transformed_names,
            contributions
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
                        feature
                        for feature in categorical_features
                        if encoded_name == feature
                        or encoded_name.startswith(
                            feature + "_"
                        )
                    ),
                    None
                )

            else:

                original_feature = None

            if original_feature in grouped_contributions:

                grouped_contributions[
                    original_feature
                ] += float(contribution)

        # Prepare explanation response

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

    except Exception:

        logger.exception("SHAP explanation failed")

        raise HTTPException(
            status_code=400,
            detail="Unable to generate SHAP explanation."
        )


# ==========================================
# RISK CLASSIFICATION
# ==========================================

def classify_risk(probability):

    if probability < 30:

        return "Low", "green"

    elif probability < 60:

        return "Moderate", "orange"

    else:

        return "High", "red"


# ==========================================
# RISK DASHBOARD
# ==========================================

@app.post(
    "/risk-dashboard",
    dependencies=[Depends(verify_google_user)]
)
def risk_dashboard(request: PredictionRequest):

    prediction_data = predict_readmission(
        request
    )

    probability = prediction_data[
        "early_readmission_probability"
    ]

    risk_level, risk_color = classify_risk(
        probability
    )

    return {

        "model": "Tuned Random Forest",

        "prediction": prediction_data["prediction"],

        "result": prediction_data["result"],

        "risk_percentage": probability,

        "risk_level": risk_level,

        "risk_color": risk_color,

        "gauge_value": probability,

        "disclaimer": (
            "Risk categories are illustrative and "
            "are not clinically validated."
        )
    }


# ==========================================
# DOWNLOAD PDF REPORT
# ==========================================

@app.post(
    "/download-report",
    dependencies=[Depends(verify_google_user)]
)
def download_report(request: PredictionRequest):

    prediction_data = predict_readmission(
        request
    )

    probability = prediction_data[
        "early_readmission_probability"
    ]

    risk_level, risk_color = classify_risk(
        probability
    )

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

    # Report heading

    elements.append(
        Paragraph(
            "ReAdmit Care",
            styles["Title"]
        )
    )

    elements.append(
        Paragraph(
            "Hospital Readmission Prediction Report",
            styles["Heading2"]
        )
    )

    elements.append(Spacer(1, 15))

    # Report generation time

    generated_at = datetime.now(
        timezone.utc
    ).strftime(
        "%d %B %Y, %H:%M UTC"
    )

    elements.append(
        Paragraph(
            f"Generated: {generated_at}",
            styles["Normal"]
        )
    )

    elements.append(
        Paragraph(
            "Authentication: Google Account Verified",
            styles["Normal"]
        )
    )

    elements.append(Spacer(1, 20))

    # Prediction summary

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

            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                colors.HexColor("#087f83")
            ),

            (
                "TEXTCOLOR",
                (0, 0),
                (-1, 0),
                colors.white
            ),

            (
                "FONTNAME",
                (0, 0),
                (-1, 0),
                "Helvetica-Bold"
            ),

            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.5,
                colors.lightgrey
            ),

            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP"
            ),

            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                10
            ),

            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                10
            )
        ])
    )

    elements.append(summary_table)

    elements.append(Spacer(1, 22))

    # Patient input features

    elements.append(
        Paragraph(
            "Patient Input Features",
            styles["Heading2"]
        )
    )

    elements.append(Spacer(1, 10))

    feature_rows = [
        ["Feature", "Value"]
    ]

    for feature in FEATURES:

        value = request.features[feature]

        feature_rows.append([

            Paragraph(
                escape(str(feature)),
                styles["BodyText"]
            ),

            Paragraph(
                escape(str(value)),
                styles["BodyText"]
            )
        ])

    feature_table = Table(
        feature_rows,
        colWidths=[245, 260],
        repeatRows=1,
        hAlign="LEFT"
    )

    feature_table.setStyle(
        TableStyle([

            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                colors.HexColor("#087f83")
            ),

            (
                "TEXTCOLOR",
                (0, 0),
                (-1, 0),
                colors.white
            ),

            (
                "FONTNAME",
                (0, 0),
                (-1, 0),
                "Helvetica-Bold"
            ),

            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.5,
                colors.lightgrey
            ),

            (
                "ROWBACKGROUNDS",
                (0, 1),
                (-1, -1),
                [
                    colors.white,
                    colors.HexColor("#f3f7fa")
                ]
            ),

            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP"
            ),

            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                7
            ),

            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                7
            )
        ])
    )

    elements.append(feature_table)

    elements.append(Spacer(1, 20))

    # Academic disclaimer

    elements.append(
        Paragraph(
            "Important Disclaimer",
            styles["Heading2"]
        )
    )

    elements.append(
        Paragraph(

            "This report is generated by an academic "
            "machine learning project. Predictions and "
            "risk thresholds are not clinically validated. "
            "The results must not replace professional "
            "medical judgment or determine treatment decisions. "
            "Google authentication does not verify patient "
            "identity or physician credentials.",

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
                'attachment; filename="ReAdmit_Care_Report.pdf"',

            "Cache-Control": "no-store"
        }
    )


# ==========================================
# FRONTEND HOSTING
# ==========================================

FRONTEND_DIR = (
    Path(__file__).resolve().parent / "frontend"
)

app.mount(
    "/",
    StaticFiles(
        directory=str(FRONTEND_DIR),
        html=True
    ),
    name="frontend"
)