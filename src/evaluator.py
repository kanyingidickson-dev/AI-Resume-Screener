from __future__ import annotations

from dataclasses import dataclass

from src.scorer import ScoreBreakdown, score_resume_against_job


@dataclass(frozen=True)
class EvaluationResult:
    resume_name: str
    score: ScoreBreakdown


def evaluate(resumes: dict[str, str], job_description: str) -> list[EvaluationResult]:
    results: list[EvaluationResult] = []
    for name, text in resumes.items():
        results.append(
            EvaluationResult(
                resume_name=name,
                score=score_resume_against_job(text, job_description),
            )
        )

    results.sort(key=lambda r: r.score.score_0_to_100, reverse=True)
    return results
