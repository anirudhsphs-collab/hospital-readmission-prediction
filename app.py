from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import joblib

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
                probability * 100, 2
            ),
            "model": "Tuned Random Forest"
        }

    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )
