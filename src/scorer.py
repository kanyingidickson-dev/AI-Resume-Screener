from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import re
from typing import Literal

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from src.preprocessing import normalize_text


@dataclass(frozen=True)
class ScoreBreakdown:
    score_0_to_100: int
    cosine_similarity: float
    matched_keywords: list[str]
    missing_keywords: list[str]
    method: str = "tfidf"
    section_scores_0_to_100: dict[str, int] | None = None
    must_have_missing: list[str] | None = None


def _top_terms_from_vector(feature_names: np.ndarray, vec: np.ndarray, k: int) -> list[str]:
    if vec.size == 0:
        return []
    idx = np.argsort(vec)[::-1]
    idx = idx[vec[idx] > 0][:k]
    return [str(feature_names[i]) for i in idx]


def _split_resume_sections(resume_text: str) -> dict[str, str]:
    headings = {
        "skills": "skills",
        "technical skills": "skills",
        "experience": "experience",
        "work experience": "experience",
        "employment": "experience",
        "projects": "projects",
        "project": "projects",
    }

    current = "other"
    sections: dict[str, list[str]] = {"other": []}

    for raw_line in resume_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        key = line.lower().rstrip(":")
        if key in headings:
            current = headings[key]
            sections.setdefault(current, [])
            continue

        sections.setdefault(current, []).append(line)

    return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}


def _similarity_pair(
    job: str,
    resume: str,
    *,
    method: Literal["tfidf", "lsa"],
    max_features: int,
) -> float:
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=max_features,
        stop_words="english",
    )

    tfidf = vectorizer.fit_transform([job, resume])
    job_vec = tfidf[0]
    resume_vec = tfidf[1]

    if method == "tfidf":
        return float(cosine_similarity(job_vec, resume_vec)[0][0])

    n_features = int(tfidf.shape[1])
    if n_features <= 1:
        return 0.0

    n_components = min(128, n_features - 1)
    svd = TruncatedSVD(n_components=n_components, random_state=0)
    dense = svd.fit_transform(tfidf)
    job_dense = dense[0:1]
    resume_dense = dense[1:2]
    return float(cosine_similarity(job_dense, resume_dense)[0][0])


def _normalize_keywords(keywords: list[str] | None) -> tuple[str, ...]:
    if not keywords:
        return ()
    out: list[str] = []
    for k in keywords:
        if not isinstance(k, str):
            continue
        kk = normalize_text(k)
        if kk:
            out.append(kk)
    return tuple(sorted(set(out)))


def _contains_keyword(normalized_text: str, normalized_keyword: str) -> bool:
    if not normalized_keyword:
        return False
    pattern = re.compile(r"(?<!\\w)" + re.escape(normalized_keyword) + r"(?!\\w)")
    return pattern.search(normalized_text) is not None


@lru_cache(maxsize=256)
def _score_cached(
    resume_text: str,
    job_text: str,
    *,
    max_features: int,
    missing_top_k: int,
    matched_top_k: int,
    method: str,
    section_aware: bool,
    section_weights_items: tuple[tuple[str, float], ...],
    must_have: tuple[str, ...],
    nice_to_have: tuple[str, ...],
    must_have_penalty: int,
    nice_to_have_bonus: int,
) -> ScoreBreakdown:
    resume = normalize_text(resume_text)
    job = normalize_text(job_text)

    base_method: Literal["tfidf", "lsa"] = "lsa" if method == "lsa" else "tfidf"
    cos = _similarity_pair(job, resume, method=base_method, max_features=max_features)
    section_scores: dict[str, int] | None = None

    if section_aware:
        sections = _split_resume_sections(resume_text)

        weights = dict(section_weights_items)
        if not weights:
            weights = {"skills": 0.4, "experience": 0.4, "projects": 0.2}

        total = float(sum(max(0.0, float(w)) for w in weights.values()))
        if total <= 0:
            total = 1.0

        cos_weighted = 0.0
        section_scores = {}
        for name, w in weights.items():
            section_text = normalize_text(sections.get(name, ""))
            c = _similarity_pair(job, section_text, method=base_method, max_features=max_features)
            cos_weighted += (max(0.0, float(w)) / total) * c
            section_scores[name] = int(round(max(0.0, min(1.0, c)) * 100))

        cos = cos_weighted

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=max_features,
        stop_words="english",
    )

    tfidf = vectorizer.fit_transform([job, resume])
    job_vec = tfidf[0]
    resume_vec = tfidf[1]

    feature_names = vectorizer.get_feature_names_out()
    term_to_idx = {t: i for i, t in enumerate(feature_names)}
    job_arr = job_vec.toarray()[0]
    resume_arr = resume_vec.toarray()[0]

    job_top = _top_terms_from_vector(feature_names, job_arr, k=missing_top_k)

    matched = [t for t in job_top if resume_arr[term_to_idx[t]] > 0]
    missing = [t for t in job_top if t not in matched]

    resume_top = _top_terms_from_vector(feature_names, resume_arr, k=matched_top_k)
    matched_keywords = sorted(set(matched + resume_top), key=lambda x: x)

    missing_must = [k for k in must_have if not _contains_keyword(resume, k)]
    matched_nice = [k for k in nice_to_have if _contains_keyword(resume, k)]

    score = int(round(max(0.0, min(1.0, cos)) * 100))
    score = score - int(must_have_penalty) * len(missing_must) + int(nice_to_have_bonus) * len(matched_nice)
    score = int(max(0, min(100, score)))

    return ScoreBreakdown(
        score_0_to_100=score,
        cosine_similarity=float(cos),
        matched_keywords=matched_keywords[:matched_top_k],
        missing_keywords=missing[:missing_top_k],
        method=base_method,
        section_scores_0_to_100=section_scores,
        must_have_missing=missing_must or None,
    )


def score_resume_against_job(
    resume_text: str,
    job_text: str,
    *,
    max_features: int = 4000,
    missing_top_k: int = 12,
    matched_top_k: int = 12,
    method: Literal["tfidf", "lsa"] = "tfidf",
    section_aware: bool = False,
    section_weights: dict[str, float] | None = None,
    must_have_keywords: list[str] | None = None,
    nice_to_have_keywords: list[str] | None = None,
    must_have_penalty: int = 5,
    nice_to_have_bonus: int = 1,
) -> ScoreBreakdown:
    section_weights_items = tuple(sorted((section_weights or {}).items(), key=lambda x: x[0]))
    must_have = _normalize_keywords(must_have_keywords)
    nice_to_have = _normalize_keywords(nice_to_have_keywords)

    return _score_cached(
        resume_text,
        job_text,
        max_features=max_features,
        missing_top_k=missing_top_k,
        matched_top_k=matched_top_k,
        method=method,
        section_aware=section_aware,
        section_weights_items=section_weights_items,
        must_have=must_have,
        nice_to_have=nice_to_have,
        must_have_penalty=must_have_penalty,
        nice_to_have_bonus=nice_to_have_bonus,
    )
