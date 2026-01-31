const DEFAULT_API_BASE_URL = "http://localhost:5000";
const STORAGE_KEY = "ai_resume_screener_api_base_url";

let lastResult = null;

function normalizeBaseUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function setStatus(el, text, { isError = false } = {}) {
  el.textContent = text || "";
  if (isError) {
    el.classList.add("error");
  } else {
    el.classList.remove("error");
  }
}

function renderChips(container, items, variant) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.textContent = "—";
    return;
  }
  for (const t of items) {
    const span = document.createElement("span");
    span.className = `chip ${variant}`;
    span.textContent = t;
    container.appendChild(span);
  }
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function init() {
  const apiBaseUrlInput = document.getElementById("apiBaseUrl");
  const healthBtn = document.getElementById("healthBtn");
  const healthStatus = document.getElementById("healthStatus");

  const loadingEl = document.getElementById("loading");

  const resumeText = document.getElementById("resumeText");
  const jobText = document.getElementById("jobText");
  const resumeFile = document.getElementById("resumeFile");
  const jobFile = document.getElementById("jobFile");

  const analyzeBtn = document.getElementById("analyzeBtn");
  const clearBtn = document.getElementById("clearBtn");
  const formError = document.getElementById("formError");

  const resumeCount = document.getElementById("resumeCount");
  const jobCount = document.getElementById("jobCount");

  const copyBtn = document.getElementById("copyBtn");
  const copyStatus = document.getElementById("copyStatus");
  const scorebarFill = document.getElementById("scorebarFill");
  const matchHint = document.getElementById("matchHint");

  const scoreEl = document.getElementById("score");
  const cosineEl = document.getElementById("cosine");
  const matchedEl = document.getElementById("matched");
  const missingEl = document.getElementById("missing");

  const stored = window.localStorage.getItem(STORAGE_KEY);
  apiBaseUrlInput.value = stored || DEFAULT_API_BASE_URL;

  function setLoading(isLoading) {
    loadingEl.hidden = !isLoading;
    loadingEl.setAttribute("aria-hidden", String(!isLoading));
    document.body.style.overflow = isLoading ? "hidden" : "";
  }

  function updateCounts() {
    resumeCount.textContent = `${(resumeText.value || "").length} chars`;
    jobCount.textContent = `${(jobText.value || "").length} chars`;
  }

  function setResults(payload) {
    lastResult = payload;

    const score = Number(payload && payload.score_0_to_100);
    const scoreSafe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
    scoreEl.textContent = Number.isFinite(score) ? `${scoreSafe}/100` : "—";
    scorebarFill.style.width = `${scoreSafe}%`;

    const cos = Number(payload && payload.cosine_similarity);
    cosineEl.textContent = Number.isFinite(cos) ? cos.toFixed(4) : "—";

    renderChips(matchedEl, payload && payload.matched_keywords, "good");
    renderChips(missingEl, payload && payload.missing_keywords, "bad");

    copyBtn.disabled = !payload;

    setStatus(matchHint, "");
    if (payload && Number.isFinite(score) && scoreSafe < 25) {
      setStatus(
        matchHint,
        "Low match: consider tailoring your resume keywords and experience bullets to the job description."
      );
    }
  }

  updateCounts();
  setResults(null);

  apiBaseUrlInput.addEventListener("change", () => {
    const baseUrl = normalizeBaseUrl(apiBaseUrlInput.value);
    apiBaseUrlInput.value = baseUrl;
    window.localStorage.setItem(STORAGE_KEY, baseUrl);
  });

  resumeText.addEventListener("input", updateCounts);
  jobText.addEventListener("input", updateCounts);

  resumeFile.addEventListener("change", async () => {
    const file = resumeFile.files && resumeFile.files[0];
    if (!file) return;
    try {
      resumeText.value = await readFileAsText(file);
      updateCounts();
    } catch (e) {
      setStatus(formError, String(e && e.message ? e.message : e), { isError: true });
    } finally {
      resumeFile.value = "";
    }
  });

  jobFile.addEventListener("change", async () => {
    const file = jobFile.files && jobFile.files[0];
    if (!file) return;
    try {
      jobText.value = await readFileAsText(file);
      updateCounts();
    } catch (e) {
      setStatus(formError, String(e && e.message ? e.message : e), { isError: true });
    } finally {
      jobFile.value = "";
    }
  });

  copyBtn.addEventListener("click", async () => {
    setStatus(copyStatus, "");
    if (!lastResult) return;

    const text = JSON.stringify(lastResult, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus(copyStatus, "Copied.");
        return;
      }

      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setStatus(copyStatus, ok ? "Copied." : "Copy failed.", { isError: !ok });
    } catch (e) {
      setStatus(copyStatus, String(e && e.message ? e.message : e), { isError: true });
    }
  });

  healthBtn.addEventListener("click", async () => {
    setStatus(healthStatus, "Checking /health...");
    healthBtn.disabled = true;
    const baseUrl = normalizeBaseUrl(apiBaseUrlInput.value);
    if (!baseUrl) {
      setStatus(healthStatus, "Set an API Base URL first.", { isError: true });
      healthBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch(`${baseUrl}/health`, { method: "GET" });
      if (!res.ok) {
        setStatus(healthStatus, `Health check failed (${res.status}).`, { isError: true });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setStatus(healthStatus, `OK: ${data.status || "ok"}`);
    } catch (e) {
      setStatus(
        healthStatus,
        "Could not reach the API. Double-check the API Base URL and that the server is running.",
        { isError: true }
      );
    } finally {
      healthBtn.disabled = false;
    }
  });

  clearBtn.addEventListener("click", () => {
    resumeText.value = "";
    jobText.value = "";
    setStatus(formError, "");
    setStatus(healthStatus, "");
    setStatus(copyStatus, "");
    updateCounts();

    setResults(null);
  });

  analyzeBtn.addEventListener("click", async () => {
    setStatus(formError, "");
    setStatus(copyStatus, "");
    setResults(null);

    const baseUrl = normalizeBaseUrl(apiBaseUrlInput.value);
    if (!baseUrl) {
      setStatus(formError, "Set an API Base URL first.", { isError: true });
      return;
    }

    const resume = String(resumeText.value || "").trim();
    const job_description = String(jobText.value || "").trim();

    if (!resume || !job_description) {
      setStatus(formError, "Resume and Job Description are required.", { isError: true });
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";
    clearBtn.disabled = true;
    setLoading(true);

    try {
      const res = await fetch(`${baseUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job_description }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = payload && payload.error ? payload.error : `Request failed (${res.status}).`;
        setStatus(formError, msg, { isError: true });
        formError.focus();
        return;
      }

      const isValid =
        payload &&
        typeof payload.score_0_to_100 === "number" &&
        typeof payload.cosine_similarity === "number" &&
        Array.isArray(payload.matched_keywords) &&
        Array.isArray(payload.missing_keywords);

      if (!isValid) {
        setStatus(
          formError,
          "The API response was missing expected fields. Please try again or update the API.",
          { isError: true }
        );
        formError.focus();
        return;
      }

      setResults(payload);
    } catch (e) {
      setStatus(
        formError,
        "Could not reach the API. If you are using GitHub Pages, make sure your API enables CORS for your Pages domain.",
        { isError: true }
      );
      formError.focus();
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analyze";
      clearBtn.disabled = false;
      setLoading(false);
    }
  });
}

init();
