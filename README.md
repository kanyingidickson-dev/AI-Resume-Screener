# Resume Screener

![CI](https://github.com/kanyingidickson-dev/AI-Resume-Screener/actions/workflows/ci.yml/badge.svg)

An explainable resume screening tool that scores a resume against a job description.

The emphasis is clarity over hype:
- lightweight text preprocessing
- similarity scoring (TF‑IDF + cosine similarity)
- an explainable breakdown (matched and missing keywords)

The repo includes:
- a CLI for local usage
- a small HTTP API (Flask)
- a static frontend (GitHub Pages-ready) that calls the API

## Tech stack

- Python
- scikit-learn (TF‑IDF + cosine similarity)
- pytest
- Flask (optional API)

## Quickstart (CLI)

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m src.cli --resume data/resumes/sample_resume.txt --job data/job_descriptions/sample_jd.txt
```

## Run the API (Flask)

The API is useful when you want to connect a frontend (including GitHub Pages).

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m src.api
```

Configuration (environment variables):

- `HOST` (default: `0.0.0.0`)
- `PORT` (default: `5000`)
- `DEBUG` (`1` enables Flask debug mode)
- `CORS_ORIGINS` (comma-separated list; default allows all origins)
- `MAX_CONTENT_LENGTH_BYTES` (default: `1048576`)

Endpoints:

- `GET /health`
- `POST /score`

Example request:

```bash
curl -X POST http://localhost:5000/score \
  -H "Content-Type: application/json" \
  -d '{"resume":"python fastapi postgres","job_description":"python fastapi postgres docker"}'
```

## Output

The tool prints:
- an overall score (0–100)
- cosine similarity score
- top matching keywords
- missing high-signal keywords from the JD

The API returns the same information as JSON.

## Frontend (GitHub Pages)

The static frontend lives in `docs/` and can be hosted on GitHub Pages.

Notes:

- The frontend lets you set and persist the API Base URL in your browser.
- You can copy the latest analysis as JSON via the UI.

Local usage:

1. Start the API: `.venv/bin/python -m src.api`
2. Serve the frontend:

   ```bash
   python3 -m http.server 8000 --directory docs
   ```

3. Open `http://localhost:8000` and set the API Base URL to `http://localhost:5000`.

GitHub Pages setup:

1. In GitHub, go to `Settings` -> `Pages`.
2. Set the source to `Deploy from a branch`.
3. Select:
   - Branch: `main`
   - Folder: `/docs`
4. Open the Pages URL and set the API Base URL to wherever you deploy the Python API.

## Folder structure

- `src/` implementation
- `data/` sample resumes and job descriptions
- `tests/` unit tests
- `docs/` static frontend (GitHub Pages)

## Design decisions

- TF‑IDF is used to keep the model simple, transparent, and offline.
- Similarity is computed on normalized text with light preprocessing.
- Breakdown focuses on terms that appear frequently in the JD and are missing from the resume.

## Advanced scoring options (implemented)

- `method`: `tfidf` (default) or `lsa` (a lightweight semantic/embedding-like latent space using SVD)
- `section_aware`: scores job similarity against resume sections (skills/experience/projects) and combines them
- `must_have_keywords` / `nice_to_have_keywords`: optional keyword weighting

## Bias and fairness

This project is intentionally keyword-focused and should not be used as an automated hiring decision system.

Practical guidance:

- Use this as a decision-support tool, not a filter that automatically rejects people.
- Avoid using protected characteristics (directly or indirectly) as criteria.
- Validate the tool against a diverse set of resumes and job descriptions.
- Prefer structured job requirements and keep the scoring rules explicit and reviewable.
