from src.scorer import score_resume_against_job


def test_score_higher_when_more_overlap():
    jd = "python fastapi postgres docker"
    r1 = "python fastapi postgres"
    r2 = "marketing sales communication"

    s1 = score_resume_against_job(r1, jd)
    s2 = score_resume_against_job(r2, jd)

    assert s1.score_0_to_100 > s2.score_0_to_100
