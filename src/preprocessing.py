from __future__ import annotations

import re


_WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    text = text.strip().lower()
    text = _WHITESPACE_RE.sub(" ", text)
    return text
