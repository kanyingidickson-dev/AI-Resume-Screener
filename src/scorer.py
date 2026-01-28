from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from src.preprocessing import normalize_text


@dataclass(frozen=True)
class ScoreBreakdown:
    score_0_to_100: int
    cosine_similarity: float
    matched_keywords: list[str]
    missing_keywords: list[str]


def _top_terms_from_vector(feature_names: np.ndarray, vec: np.ndarray, k: int) -> list[str]:
    if vec.size == 0:
        return []
    idx = np.argsort(vec)[::-1]
    idx = idx[vec[idx] > 0][:k]
    return [str(feature_names[i]) for i in idx]


def score_resume_against_job(
    resume_text: str,
    job_text: str,
    *,
    max_features: int = 4000,
    missing_top_k: int = 12,
    matched_top_k: int = 12,
) -> ScoreBreakdown:
    resume = normalize_text(resume_text)
    job = normalize_text(job_text)

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=max_features,
        stop_words="english",
    )

    tfidf = vectorizer.fit_transform([job, resume])
    job_vec = tfidf[0]
    resume_vec = tfidf[1]

    cos = float(cosine_similarity(job_vec, resume_vec)[0][0])

    feature_names = vectorizer.get_feature_names_out()
    term_to_idx = {t: i for i, t in enumerate(feature_names)}
    job_arr = job_vec.toarray()[0]
    resume_arr = resume_vec.toarray()[0]

    job_top = _top_terms_from_vector(feature_names, job_arr, k=missing_top_k)

    matched = [t for t in job_top if resume_arr[term_to_idx[t]] > 0]
    missing = [t for t in job_top if t not in matched]

    resume_top = _top_terms_from_vector(feature_names, resume_arr, k=matched_top_k)

    matched_keywords = sorted(set(matched + resume_top), key=lambda x: x)

    score = int(round(max(0.0, min(1.0, cos)) * 100))

    return ScoreBreakdown(
        score_0_to_100=score,
        cosine_similarity=cos,
        matched_keywords=matched_keywords[:matched_top_k],
        missing_keywords=missing[:missing_top_k],
    )
