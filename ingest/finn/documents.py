"""Fetch a filing's PDF and return clean text (shared by enrichment, bios and Pull)."""

from __future__ import annotations

import io
import logging
import re

from pypdf import PdfReader

from .sources.http import WEEK, FetchError, client

logging.getLogger("pypdf").setLevel(logging.ERROR)

_BOILERPLATE = re.compile(
    r"(dear sir(/| or )?madam|to,?\s+the (listing|general) (department|manager)|bse limited|national stock exchange of india limited|"
    r"phiroze jeejeebhoy towers|exchange plaza|bandra[- ]kurla complex|dalal street|scrip code[:\s]*\w+|symbol[:\s]*\w+)",
    re.I,
)


def pdf_text(url: str, max_pages: int = 6) -> str:
    """Text of the first `max_pages` pages ('' if the PDF is scanned or can't be fetched)."""
    if not url or not url.lower().split("?")[0].endswith(".pdf"):
        return ""
    try:
        data = client.get_bytes(url, ttl=WEEK)
        reader = PdfReader(io.BytesIO(data))
        pages = [(p.extract_text() or "") for p in reader.pages[:max_pages]]
    except (FetchError, Exception):  # malformed PDFs are common in filings; never crash the pipeline
        return ""
    return re.sub(r"\s+", " ", " ".join(pages)).strip()


def excerpt(url: str, chars: int = 2500) -> str:
    """The informative part of a filing: drop the address block and salutations."""
    text = pdf_text(url)
    if not text:
        return ""
    m = re.search(r"(sub(ject)?\s*[:\-]|dear sir|dear madam|we wish to inform|pursuant to regulation)", text, re.I)
    body = text[m.start():] if m and m.start() < 1500 else text
    body = _BOILERPLATE.sub(" ", body)
    return re.sub(r"\s+", " ", body).strip()[:chars]
