from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import joblib
import numpy as np
import shap

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
        # Convert input into the model's expected format
        input_df = pd.DataFrame(
            [[input_data[feature] for feature in FEATURES]],
            columns=FEATURES
        )

        # Separate preprocessing and Random Forest
        preprocessor = model.named_steps["preprocessor"]
        classifier = model.named_steps["classifier"]

        # Apply the same preprocessing used during training
        transformed_data = preprocessor.transform(input_df)

        if hasattr(transformed_data, "toarray"):
            transformed_data = transformed_data.toarray()

        # Retrieve names of encoded features
        transformed_names = preprocessor.get_feature_names_out()

        # Calculate SHAP values
        explainer = shap.TreeExplainer(classifier)
        shap_values = explainer.shap_values(transformed_data)

        # Select the readmission class (class 1)
        positive_index = list(classifier.classes_).index(1)

        if isinstance(shap_values, list):
            contributions = shap_values[positive_index][0]
        else:
            values = np.asarray(shap_values)

            if values.ndim == 3:
                contributions = values[0, :, positive_index]
            else:
                contributions = values[0]

        # Combine encoded features back into original feature groups
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
