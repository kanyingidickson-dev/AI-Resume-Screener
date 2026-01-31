from __future__ import annotations

import argparse
from pathlib import Path

from src.scorer import score_resume_against_job


def main() -> int:
    parser = argparse.ArgumentParser(description="AI Resume Screener")
    parser.add_argument("--resume", required=True, help="Path to resume text file")
    parser.add_argument("--job", required=True, help="Path to job description text file")
    parser.add_argument("--method", choices=["tfidf", "lsa"], default="tfidf")
    parser.add_argument("--section-aware", action="store_true")
    parser.add_argument(
        "--section-weight",
        action="append",
        default=[],
        help="Optional, repeatable. Format: name=weight (e.g. skills=0.4)",
    )
    parser.add_argument(
        "--must-have",
        default="",
        help="Comma-separated keywords that are required (penalizes score when missing)",
    )
    parser.add_argument(
        "--nice-to-have",
        default="",
        help="Comma-separated keywords that are optional (small bonus when present)",
    )
    parser.add_argument("--must-have-penalty", type=int, default=5)
    parser.add_argument("--nice-to-have-bonus", type=int, default=1)
    args = parser.parse_args()

    resume_path = Path(args.resume)
    job_path = Path(args.job)

    resume_text = resume_path.read_text(encoding="utf-8")
    job_text = job_path.read_text(encoding="utf-8")

    section_weights: dict[str, float] = {}
    for item in args.section_weight:
        if "=" not in item:
            raise SystemExit("--section-weight must be in the format name=weight")
        name, raw = item.split("=", 1)
        name = name.strip()
        raw = raw.strip()
        if not name:
            raise SystemExit("--section-weight name cannot be empty")
        try:
            section_weights[name] = float(raw)
        except ValueError as e:
            raise SystemExit(f"Invalid section weight for '{name}': {raw}") from e

    must_have = [s.strip() for s in str(args.must_have).split(",") if s.strip()]
    nice_to_have = [s.strip() for s in str(args.nice_to_have).split(",") if s.strip()]

    breakdown = score_resume_against_job(
        resume_text,
        job_text,
        method=args.method,
        section_aware=bool(args.section_aware),
        section_weights=section_weights or None,
        must_have_keywords=must_have or None,
        nice_to_have_keywords=nice_to_have or None,
        must_have_penalty=int(args.must_have_penalty),
        nice_to_have_bonus=int(args.nice_to_have_bonus),
    )

    print(f"score: {breakdown.score_0_to_100}/100")
    print(f"cosine_similarity: {breakdown.cosine_similarity:.4f}")
    print(f"method: {breakdown.method}")
    if breakdown.section_scores_0_to_100:
        print("section_scores:")
        for k in sorted(breakdown.section_scores_0_to_100):
            print(f"- {k}: {breakdown.section_scores_0_to_100[k]}/100")
    if breakdown.must_have_missing:
        print("must_have_missing:")
        for t in breakdown.must_have_missing:
            print(f"- {t}")
    print("matched_keywords:")
    for t in breakdown.matched_keywords:
        print(f"- {t}")
    print("missing_keywords:")
    for t in breakdown.missing_keywords:
        print(f"- {t}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
