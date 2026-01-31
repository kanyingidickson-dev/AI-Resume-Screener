from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from src.scorer import score_resume_against_job


def _cors_origins_from_env() -> str | list[str]:
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if not raw:
        return "*"
    return [o.strip() for o in raw.split(",") if o.strip()]


def _int_from_env(
    name: str,
    default: int,
    *,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if min_value is not None and value < min_value:
        return default
    if max_value is not None and value > max_value:
        return default
    return value


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["MAX_CONTENT_LENGTH"] = _int_from_env(
        "MAX_CONTENT_LENGTH_BYTES",
        1024 * 1024,
        min_value=1,
        max_value=50 * 1024 * 1024,
    )

    cors_origins = _cors_origins_from_env()
    CORS(app, resources={r"/*": {"origins": cors_origins}})

    @app.errorhandler(HTTPException)
    def http_exception(e: HTTPException) -> tuple[object, int]:
        return jsonify({"error": e.description}), int(e.code or 500)

    @app.errorhandler(Exception)
    def unhandled_exception(_: Exception) -> tuple[object, int]:
        return jsonify({"error": "Internal server error"}), 500

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

        method = data.get("method", "tfidf")
        if not isinstance(method, str) or method not in {"tfidf", "lsa"}:
            return jsonify({"error": "Field 'method' must be 'tfidf' or 'lsa'"}), 400

        section_aware = data.get("section_aware", False)
        if not isinstance(section_aware, bool):
            return jsonify({"error": "Field 'section_aware' must be a boolean"}), 400

        section_weights = data.get("section_weights")
        section_weights_clean: dict[str, float] | None = None
        if section_weights is not None:
            if not isinstance(section_weights, dict):
                return jsonify({"error": "Field 'section_weights' must be an object"}), 400
            section_weights_clean = {}
            for k, v in section_weights.items():
                if not isinstance(k, str):
                    return jsonify({"error": "Field 'section_weights' keys must be strings"}), 400
                if not isinstance(v, (int, float)):
                    return jsonify(
                        {"error": "Field 'section_weights' values must be numbers"}
                    ), 400
                section_weights_clean[k] = float(v)

        def _parse_keywords(value: object) -> list[str] | None:
            if value is None:
                return None
            if isinstance(value, str):
                parts = [p.strip() for p in value.split(",")]
                return [p for p in parts if p]
            if isinstance(value, list) and all(isinstance(x, str) for x in value):
                return [x for x in value if x.strip()]
            raise TypeError

        try:
            must_have_keywords = _parse_keywords(data.get("must_have_keywords"))
        except TypeError:
            return jsonify({"error": "Field 'must_have_keywords' must be a string or list"}), 400

        try:
            nice_to_have_keywords = _parse_keywords(data.get("nice_to_have_keywords"))
        except TypeError:
            return jsonify(
                {"error": "Field 'nice_to_have_keywords' must be a string or list"}
            ), 400

        must_have_penalty = data.get("must_have_penalty", 5)
        if not isinstance(must_have_penalty, int):
            return jsonify({"error": "Field 'must_have_penalty' must be an integer"}), 400
        if must_have_penalty < 0 or must_have_penalty > 100:
            return jsonify(
                {"error": "Field 'must_have_penalty' must be between 0 and 100"}
            ), 400

        nice_to_have_bonus = data.get("nice_to_have_bonus", 1)
        if not isinstance(nice_to_have_bonus, int):
            return jsonify({"error": "Field 'nice_to_have_bonus' must be an integer"}), 400
        if nice_to_have_bonus < 0 or nice_to_have_bonus > 100:
            return jsonify(
                {"error": "Field 'nice_to_have_bonus' must be between 0 and 100"}
            ), 400

        breakdown = score_resume_against_job(
            resume_text,
            job_text,
            method=method,
            section_aware=section_aware,
            section_weights=section_weights_clean,
            must_have_keywords=must_have_keywords,
            nice_to_have_keywords=nice_to_have_keywords,
            must_have_penalty=must_have_penalty,
            nice_to_have_bonus=nice_to_have_bonus,
        )

        return (
            jsonify(
                {
                    "score_0_to_100": breakdown.score_0_to_100,
                    "cosine_similarity": breakdown.cosine_similarity,
                    "matched_keywords": breakdown.matched_keywords,
                    "missing_keywords": breakdown.missing_keywords,
                    "method": breakdown.method,
                    "section_scores_0_to_100": breakdown.section_scores_0_to_100,
                    "must_have_missing": breakdown.must_have_missing,
                }
            ),
            200,
        )

    return app


if __name__ == "__main__":
    app = create_app()
    host = os.environ.get("HOST", "0.0.0.0")
    port = _int_from_env("PORT", 5000, min_value=1, max_value=65535)
    debug = os.environ.get("DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
