# AI Resume Screener

A small, explainable resume screener that scores a resume against a job description.

The emphasis is clarity over hype:
- text preprocessing
- similarity scoring (TF‑IDF + cosine similarity)
- an explainable breakdown (keywords matched, missing terms)

## Tech stack

- Python
- scikit-learn (TF‑IDF + cosine similarity)
- pytest

## How to run locally

```bash
pip install -r requirements.txt
python -m src.cli --resume data/resumes/sample_resume.txt --job data/job_descriptions/sample_jd.txt
```

## Output

The tool prints:
- an overall score (0–100)
- cosine similarity score
- top matching keywords
- missing high-signal keywords from the JD

## Folder structure

- `src/` implementation
- `data/` sample resumes and job descriptions
- `tests/` unit tests

## Design decisions

- TF‑IDF is used to keep the model simple, transparent, and offline.
- Similarity is computed on normalized text with light preprocessing.
- Breakdown focuses on terms that appear frequently in the JD and are missing from the resume.

## Future improvements

- Section-aware scoring (skills vs experience vs projects)
- Custom weighting (must-have vs nice-to-have)
- Embeddings-based similarity (optional) with caching
- Bias and fairness documentation + mitigation strategies
