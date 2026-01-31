from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from src.scorer import score_resume_against_job


def _cors_origins_from_env() -> str | list[str]:
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if not raw:
        return "*"
    return [o.strip() for o in raw.split(",") if o.strip()]


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["MAX_CONTENT_LENGTH"] = int(
        os.environ.get("MAX_CONTENT_LENGTH_BYTES", str(1024 * 1024))
    )

    cors_origins = _cors_origins_from_env()
    CORS(app, resources={r"/*": {"origins": cors_origins}})

    @app.errorhandler(413)
    def request_entity_too_large(_: object) -> tuple[object, int]:
        return jsonify({"error": "Request body too large"}), 413

    @app.get("/health")
    def health() -> tuple[dict[str, str], int]:
        return {"status": "ok"}, 200

    @app.post("/score")
    def score() -> tuple[object, int]:
        if not request.is_json:
            return jsonify({"error": "Content-Type application/json is required"}), 415

        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "Invalid JSON body"}), 400

        if not isinstance(data, dict):
            return jsonify({"error": "JSON body must be an object"}), 400

        resume_text = data.get("resume")
        job_text = data.get("job_description")

        if not isinstance(resume_text, str) or not resume_text.strip():
            return jsonify({"error": "Field 'resume' is required"}), 400

        if not isinstance(job_text, str) or not job_text.strip():
            return jsonify({"error": "Field 'job_description' is required"}), 400

        breakdown = score_resume_against_job(resume_text, job_text)

        return (
            jsonify(
                {
                    "score_0_to_100": breakdown.score_0_to_100,
                    "cosine_similarity": breakdown.cosine_similarity,
                    "matched_keywords": breakdown.matched_keywords,
                    "missing_keywords": breakdown.missing_keywords,
                }
            ),
            200,
        )

    return app


if __name__ == "__main__":
    app = create_app()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
