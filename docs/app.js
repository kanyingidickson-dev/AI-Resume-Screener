const DEFAULT_API_BASE_URL = "http://localhost:5000";
const STORAGE_KEY = "resume_screener_api_base_url";
const LEGACY_STORAGE_KEY = "ai_resume_screener_api_base_url";
const THEME_KEY = "resume_screener_theme";

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

function setChecklist(listEl, progressEl, items) {
  listEl.innerHTML = "";
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const done = list.filter((x) => x && x.done).length;
  if (progressEl) {
    progressEl.textContent = total > 0 ? `${done}/${total} completed` : "";
  }
  if (total === 0) {
    const li = document.createElement("li");
    li.className = "checklist-item";
    li.textContent = "—";
    listEl.appendChild(li);
    return;
  }
  for (const item of list) {
    const li = document.createElement("li");
    li.className = "checklist-item";

    const indicator = document.createElement("span");
    indicator.className = `check-indicator${item.done ? " checked" : ""}`;
    indicator.setAttribute("aria-hidden", "true");
    indicator.textContent = item.done ? "Done" : "Todo";

    const text = document.createElement("span");
    text.className = "check-text";
    text.textContent = String(item.text || "");

    li.appendChild(indicator);
    li.appendChild(text);
    listEl.appendChild(li);
  }
}

function renderChips(
  container,
  items,
  variant,
  { titlePrefix = "", source = "", onChipClick = null } = {}
) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.textContent = "—";
    return;
  }
  for (const t of items) {
    const span = document.createElement("span");
    span.className = `chip ${variant}`;
    span.textContent = t;
    span.dataset.keyword = String(t);
    if (source) span.dataset.source = String(source);
    if (titlePrefix) {
      span.title = `${titlePrefix}${t}`;
    }
    if (typeof onChipClick === "function") {
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.addEventListener("click", () => onChipClick(String(t), source));
      span.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChipClick(String(t), source);
        }
      });
    }
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

async function readDocxAsText(file) {
  if (!file) {
    throw new Error("No file provided");
  }
  const ext = String(file.name || "").toLowerCase().split(".").pop();
  if (ext !== "docx") {
    throw new Error("Not a .docx file");
  }
  if (!window.mammoth || typeof window.mammoth.extractRawText !== "function") {
    throw new Error("DOCX support is not available (mammoth failed to load).");
  }
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return String(result && result.value ? result.value : "");
}

async function readFileToText(file) {
  const name = String(file && file.name ? file.name : "").toLowerCase();
  if (name.endsWith(".docx")) {
    return readDocxAsText(file);
  }
  return readFileAsText(file);
}

function parseKeywords(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);
}

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function containsKeyword(normalizedText, normalizedKeyword) {
  const t = String(normalizedText || "");
  const k = String(normalizedKeyword || "");
  if (!t || !k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<!\\w)${escaped}(?!\\w)`);
  return re.test(t);
}

function splitKeywordsCsv(raw) {
  return (parseKeywords(raw) || []).map((x) => normalizeText(x)).filter((x) => x);
}

function renderSectionScores(container, sectionScores) {
  container.innerHTML = "";
  if (!sectionScores || typeof sectionScores !== "object") {
    container.textContent = "—";
    return;
  }
  const entries = Object.entries(sectionScores).filter(([, v]) => Number.isFinite(Number(v)));
  if (entries.length === 0) {
    container.textContent = "—";
    return;
  }
  entries.sort(([a], [b]) => String(a).localeCompare(String(b)));
  for (const [k, v] of entries) {
    const row = document.createElement("div");
    row.className = "section-score";

    const label = document.createElement("div");
    label.className = "section-score-label";
    label.textContent = k;

    const value = document.createElement("div");
    value.className = "section-score-value";
    const scoreNum = Math.max(0, Math.min(100, Number(v)));
    value.textContent = `${scoreNum}/100`;

    const bar = document.createElement("div");
    bar.className = "section-scorebar";
    const fill = document.createElement("div");
    fill.className = "section-scorebar-fill";
    fill.style.width = `${scoreNum}%`;
    bar.appendChild(fill);

    row.appendChild(label);
    row.appendChild(value);
    row.appendChild(bar);
    container.appendChild(row);
  }
}

function scoreBand(score0to100) {
  const s = Number(score0to100);
  if (!Number.isFinite(s)) return { label: "", detail: "" };
  if (s >= 75) return { label: "Strong match", detail: "Your resume language closely aligns with the job description." };
  if (s >= 50) return { label: "Good match", detail: "You match many of the key terms. A few targeted edits can improve alignment." };
  if (s >= 25) return { label: "Partial match", detail: "Some overlap exists, but key requirements appear missing or under-emphasized." };
  return { label: "Low match", detail: "The resume and job description share relatively few of the same high-signal terms." };
}

function cosineBand(cos) {
  const c = Number(cos);
  if (!Number.isFinite(c)) return { label: "", detail: "" };
  if (c >= 0.55) return { label: "High similarity", detail: "The resume and job description are strongly aligned in wording." };
  if (c >= 0.35) return { label: "Moderate similarity", detail: "There is meaningful overlap, but some important areas may not be covered." };
  if (c >= 0.2) return { label: "Low similarity", detail: "The overlap is limited. Try mirroring the job’s terminology in your resume." };
  return { label: "Very low similarity", detail: "The resume wording is far from the job description. Start by aligning core skills and role keywords." };
}

function setRecommendations(container, items) {
  container.innerHTML = "";
  const list = Array.isArray(items) ? items.filter((x) => x && String(x).trim()) : [];
  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "—";
    container.appendChild(li);
    return;
  }
  for (const t of list) {
    const li = document.createElement("li");
    li.textContent = t;
    container.appendChild(li);
  }
}

function init() {
  const themeToggle = document.getElementById("themeToggle");
  const themeStatus = document.getElementById("themeStatus");
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
  const scoreExplainEl = document.getElementById("scoreExplain");
  const cosineExplainEl = document.getElementById("cosineExplain");
  const recommendationsEl = document.getElementById("recommendations");

  const mustHavePenaltyImpactEl = document.getElementById("mustHavePenaltyImpact");
  const niceToHaveBonusImpactEl = document.getElementById("niceToHaveBonusImpact");

  const methodSelect = document.getElementById("method");
  const sectionAwareInput = document.getElementById("sectionAware");
  const mustHaveInput = document.getElementById("mustHave");
  const niceToHaveInput = document.getElementById("niceToHave");
  const mustHavePenaltyInput = document.getElementById("mustHavePenalty");
  const mustHavePenaltyOut = document.getElementById("mustHavePenaltyOut");
  const niceToHaveBonusInput = document.getElementById("niceToHaveBonus");
  const niceToHaveBonusOut = document.getElementById("niceToHaveBonusOut");

  const scoreEl = document.getElementById("score");
  const cosineEl = document.getElementById("cosine");
  const methodOutEl = document.getElementById("methodOut");
  const matchedEl = document.getElementById("matched");
  const missingEl = document.getElementById("missing");
  const mustHaveMatchedEl = document.getElementById("mustHaveMatched");
  const mustHaveMissingEl = document.getElementById("mustHaveMissing");
  const niceToHaveMatchedEl = document.getElementById("niceToHaveMatched");
  const niceToHaveMissingEl = document.getElementById("niceToHaveMissing");
  const sectionScoresEl = document.getElementById("sectionScores");

  const checklistEl = document.getElementById("checklist");
  const checklistProgressEl = document.getElementById("checklistProgress");
  const keywordTipEl = document.getElementById("keywordTip");

  const stored =
    window.localStorage.getItem(STORAGE_KEY) ||
    window.localStorage.getItem(LEGACY_STORAGE_KEY);
  apiBaseUrlInput.value = stored || DEFAULT_API_BASE_URL;
  if (stored && !window.localStorage.getItem(STORAGE_KEY)) {
    window.localStorage.setItem(STORAGE_KEY, stored);
  }

  function setTheme(mode) {
    if (!mode) return;
    document.documentElement.setAttribute("data-theme", mode);
    window.localStorage.setItem(THEME_KEY, mode);
    if (themeToggle) {
      themeToggle.checked = mode === "dark";
    }
    if (themeStatus) {
      themeStatus.textContent = mode === "dark" ? "Dark" : "Light";
    }
  }

  const savedTheme = window.localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (prefersDark ? "dark" : "light"));

  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      setTheme(themeToggle.checked ? "dark" : "light");
    });
  }

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

    if (!payload) {
      scoreEl.textContent = "—";
      cosineEl.textContent = "—";
      methodOutEl.textContent = "—";
      scorebarFill.style.width = "0%";
      renderChips(matchedEl, null, "good");
      renderChips(missingEl, null, "bad");
      renderChips(mustHaveMatchedEl, null, "good");
      renderChips(mustHaveMissingEl, null, "bad");
      renderChips(niceToHaveMatchedEl, null, "good");
      renderChips(niceToHaveMissingEl, null, "bad");
      renderSectionScores(sectionScoresEl, null);
      setStatus(matchHint, "");
      if (scoreExplainEl) scoreExplainEl.textContent = "";
      if (cosineExplainEl) cosineExplainEl.textContent = "";
      if (recommendationsEl) setRecommendations(recommendationsEl, []);
      if (checklistEl) setChecklist(checklistEl, checklistProgressEl, []);
      if (keywordTipEl) keywordTipEl.textContent = "Click a keyword chip to see a suggestion.";
      copyBtn.disabled = true;
      return;
    }

    const score = Number(payload && payload.score_0_to_100);
    const scoreSafe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
    scoreEl.textContent = Number.isFinite(score) ? `${scoreSafe}/100` : "—";
    scorebarFill.style.width = `${scoreSafe}%`;

    const cos = Number(payload && payload.cosine_similarity);
    cosineEl.textContent = Number.isFinite(cos) ? cos.toFixed(4) : "—";

    methodOutEl.textContent = payload && payload.method ? String(payload.method) : "—";

    const setKeywordTip = (keyword, source) => {
      if (!keywordTipEl) return;
      const k = String(keyword || "");
      const s = String(source || "");
      if (!k) {
        keywordTipEl.textContent = "Click a keyword chip to see a suggestion.";
        return;
      }
      if (s === "missing" || s === "must_missing") {
        keywordTipEl.textContent = `Add '${k}' in Skills, then mention it in at least one Experience/Project bullet with a concrete example.`;
        return;
      }
      if (s === "nice_missing") {
        keywordTipEl.textContent = `If you have it, add '${k}' to Skills and include one supporting bullet (project, tooling, or workflow).`;
        return;
      }
      keywordTipEl.textContent = `If '${k}' is important for the role, reinforce it with a concrete bullet (impact + tools + scope).`;
    };

    renderChips(matchedEl, payload && payload.matched_keywords, "good", {
      source: "matched",
      onChipClick: setKeywordTip,
    });
    renderChips(missingEl, payload && payload.missing_keywords, "bad", {
      titlePrefix: "Consider adding to Skills/Experience: ",
      source: "missing",
      onChipClick: setKeywordTip,
    });
    renderSectionScores(sectionScoresEl, payload && payload.section_scores_0_to_100);

    const resumeNorm = normalizeText(resumeText.value);
    const mustList = splitKeywordsCsv(mustHaveInput.value);
    const niceList = splitKeywordsCsv(niceToHaveInput.value);
    const mustMatched = mustList.filter((k) => containsKeyword(resumeNorm, k));
    const mustMissing = mustList.filter((k) => !containsKeyword(resumeNorm, k));
    const niceMatched = niceList.filter((k) => containsKeyword(resumeNorm, k));
    const niceMissing = niceList.filter((k) => !containsKeyword(resumeNorm, k));

    renderChips(mustHaveMatchedEl, mustMatched, "good", { source: "must_matched", onChipClick: setKeywordTip });
    renderChips(mustHaveMissingEl, mustMissing, "bad", {
      titlePrefix: "Must-have missing — add to Skills/Experience: ",
      source: "must_missing",
      onChipClick: setKeywordTip,
    });
    renderChips(niceToHaveMatchedEl, niceMatched, "good", { source: "nice_matched", onChipClick: setKeywordTip });
    renderChips(niceToHaveMissingEl, niceMissing, "bad", { source: "nice_missing", onChipClick: setKeywordTip });

    copyBtn.disabled = !payload;

    setStatus(matchHint, "");
    if (payload && Number.isFinite(score)) {
      const sb = scoreBand(scoreSafe);
      if (sb.label) {
        setStatus(matchHint, `${sb.label}: ${sb.detail}`);
      }
    }

    const cosine = Number(payload && payload.cosine_similarity);
    if (payload && Number.isFinite(score) && scoreExplainEl) {
      const sb = scoreBand(scoreSafe);
      scoreExplainEl.textContent =
        `Overall score is a 0–100 summary based on similarity, with optional keyword bonuses/penalties. ` +
        (sb.label ? `${sb.label}: ${sb.detail}` : "");
    }
    if (payload && Number.isFinite(cosine) && cosineExplainEl) {
      const cb = cosineBand(cosine);
      cosineExplainEl.textContent =
        `Cosine similarity measures how closely the resume text aligns with the job description in TF‑IDF space (closer to 1.0 means more similar). ` +
        (cb.label ? `${cb.label}: ${cb.detail}` : "");
    }

    if (recommendationsEl) {
      const recs = [];
      const missing = (payload && payload.missing_keywords) || [];
      const sectionScores = payload && payload.section_scores_0_to_100;

      if (mustMissing.length > 0) {
        recs.push(
          `Add the must-have keywords to your Skills section and back them up with at least one Experience bullet: ${mustMissing
            .slice(0, 6)
            .join(", ")}.`
        );
      }

      if (Array.isArray(missing) && missing.length > 0) {
        recs.push(
          `Cover these job keywords explicitly (Skills, Tools, or project bullets): ${missing
            .slice(0, 8)
            .join(", ")}.`
        );
      }

      if (sectionScores && typeof sectionScores === "object") {
        const entries = Object.entries(sectionScores)
          .map(([k, v]) => [k, Number(v)])
          .filter(([, v]) => Number.isFinite(v));
        if (entries.length > 0) {
          entries.sort((a, b) => a[1] - b[1]);
          const [lowestName, lowestScore] = entries[0];
          if (Number.isFinite(lowestScore) && lowestScore < 60) {
            recs.push(
              `Your weakest section is '${lowestName}'. Add 2–3 bullets there that mirror the job requirements using concrete examples.`
            );
          }
        }
      }

      if (Number.isFinite(scoreSafe) && scoreSafe < 25) {
        recs.push(
          "Start with the top 5 requirements from the job description and make sure each one appears verbatim in your resume (Skills + at least one Experience/Project bullet)."
        );
      }

      setRecommendations(recommendationsEl, recs);
    }

    if (checklistEl) {
      const items = [];
      if (mustList.length > 0) {
        items.push({
          text:
            mustMissing.length === 0
              ? "Must-have keywords are present"
              : `Add missing must-have keywords (${mustMissing.slice(0, 6).join(", ")})`,
          done: mustMissing.length === 0,
        });
      }
      if (niceList.length > 0) {
        items.push({
          text:
            niceMissing.length === 0
              ? "Nice-to-have keywords are present"
              : `Add relevant nice-to-have keywords you genuinely have (${niceMissing.slice(0, 6).join(", ")})`,
          done: niceMissing.length === 0,
        });
      }
      const missing = (payload && payload.missing_keywords) || [];
      if (Array.isArray(missing) && missing.length > 0) {
        items.push({
          text: `Cover key job terms in Skills/Experience (${missing.slice(0, 6).join(", ")})`,
          done: false,
        });
      }
      const sectionScores = payload && payload.section_scores_0_to_100;
      if (sectionScores && typeof sectionScores === "object") {
        const entries = Object.entries(sectionScores)
          .map(([k, v]) => [k, Number(v)])
          .filter(([, v]) => Number.isFinite(v));
        if (entries.length > 0) {
          entries.sort((a, b) => a[1] - b[1]);
          const [lowestName, lowestScore] = entries[0];
          items.push({
            text:
              lowestScore >= 60
                ? "Section alignment looks solid"
                : `Improve your '${lowestName}' section (add 2–3 targeted bullets)`,
            done: lowestScore >= 60,
          });
        }
      }
      setChecklist(checklistEl, checklistProgressEl, items);
    }
  }

  updateCounts();
  setResults(null);

  methodSelect.value = "tfidf";
  sectionAwareInput.checked = false;
  mustHaveInput.value = "";
  niceToHaveInput.value = "";
  mustHavePenaltyInput.value = "5";
  mustHavePenaltyOut.textContent = "5";
  niceToHaveBonusInput.value = "1";
  niceToHaveBonusOut.textContent = "1";

  mustHavePenaltyInput.addEventListener("input", () => {
    mustHavePenaltyOut.textContent = String(mustHavePenaltyInput.value);
    if (mustHavePenaltyImpactEl) {
      mustHavePenaltyImpactEl.textContent = `Each missing must-have keyword reduces your score by ${mustHavePenaltyInput.value} points.`;
    }
  });
  niceToHaveBonusInput.addEventListener("input", () => {
    niceToHaveBonusOut.textContent = String(niceToHaveBonusInput.value);
    if (niceToHaveBonusImpactEl) {
      niceToHaveBonusImpactEl.textContent = `Each matched nice-to-have keyword adds ${niceToHaveBonusInput.value} points.`;
    }
  });

  if (mustHavePenaltyImpactEl) {
    mustHavePenaltyImpactEl.textContent = `Each missing must-have keyword reduces your score by ${mustHavePenaltyInput.value} points.`;
  }
  if (niceToHaveBonusImpactEl) {
    niceToHaveBonusImpactEl.textContent = `Each matched nice-to-have keyword adds ${niceToHaveBonusInput.value} points.`;
  }

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
      resumeText.value = await readFileToText(file);
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
      jobText.value = await readFileToText(file);
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
    methodSelect.value = "tfidf";
    sectionAwareInput.checked = false;
    mustHaveInput.value = "";
    niceToHaveInput.value = "";
    mustHavePenaltyInput.value = "5";
    mustHavePenaltyOut.textContent = "5";
    niceToHaveBonusInput.value = "1";
    niceToHaveBonusOut.textContent = "1";
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

    const method = String(methodSelect.value || "tfidf");
    const section_aware = Boolean(sectionAwareInput.checked);
    const must_have_keywords = parseKeywords(mustHaveInput.value);
    const nice_to_have_keywords = parseKeywords(niceToHaveInput.value);
    const must_have_penalty = Number.parseInt(String(mustHavePenaltyInput.value || "5"), 10);
    const nice_to_have_bonus = Number.parseInt(String(niceToHaveBonusInput.value || "1"), 10);

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
        body: JSON.stringify({
          resume,
          job_description,
          method,
          section_aware,
          must_have_keywords,
          nice_to_have_keywords,
          must_have_penalty,
          nice_to_have_bonus,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        let msg = payload && payload.error ? payload.error : `Request failed (${res.status}).`;
        if (res.status === 413) {
          msg = "Input too large. Try pasting shorter text or remove repeated content.";
        }
        if (res.status === 415) {
          msg = "Unsupported content type. The API expects application/json.";
        }
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
