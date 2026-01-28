from __future__ import annotations

import argparse
from pathlib import Path

from src.scorer import score_resume_against_job


def main() -> int:
    parser = argparse.ArgumentParser(description="AI Resume Screener")
    parser.add_argument("--resume", required=True, help="Path to resume text file")
    parser.add_argument("--job", required=True, help="Path to job description text file")
    args = parser.parse_args()

    resume_path = Path(args.resume)
    job_path = Path(args.job)

    resume_text = resume_path.read_text(encoding="utf-8")
    job_text = job_path.read_text(encoding="utf-8")

    breakdown = score_resume_against_job(resume_text, job_text)

    print(f"score: {breakdown.score_0_to_100}/100")
    print(f"cosine_similarity: {breakdown.cosine_similarity:.4f}")
    print("matched_keywords:")
    for t in breakdown.matched_keywords:
        print(f"- {t}")
    print("missing_keywords:")
    for t in breakdown.missing_keywords:
        print(f"- {t}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
