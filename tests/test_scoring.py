from src.scorer import score_resume_against_job


def test_score_higher_when_more_overlap():
    jd = "python fastapi postgres docker"
    r1 = "python fastapi postgres"
    r2 = "marketing sales communication"

    s1 = score_resume_against_job(r1, jd)
    s2 = score_resume_against_job(r2, jd)

    assert s1.score_0_to_100 > s2.score_0_to_100


def test_lsa_method_runs():
    jd = "python fastapi postgres docker"
    r = "python fastapi postgres"

    s = score_resume_against_job(r, jd, method="lsa")
    assert 0 <= s.score_0_to_100 <= 100
    assert s.method in {"lsa", "tfidf"}


def test_section_aware_scoring_returns_section_scores():
    jd = "python fastapi postgres docker"
    r = "Skills:\npython fastapi postgres\n\nExperience:\nworked with docker"

    s = score_resume_against_job(r, jd, section_aware=True)
    assert isinstance(s.section_scores_0_to_100, dict)
    assert all(isinstance(v, int) for v in s.section_scores_0_to_100.values())


def test_must_have_keywords_are_reported_when_missing():
    jd = "python fastapi postgres docker"
    r = "python fastapi postgres"

    s = score_resume_against_job(r, jd, must_have_keywords=["docker"])
    assert s.must_have_missing == ["docker"]
