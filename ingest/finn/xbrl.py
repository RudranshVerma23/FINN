"""Read headline numbers from SEBI "Integrated Filing - Financials" XBRL (FR-07, NFR-06, ADR-09).

No LLM: the filing is already structured. We pick the context that covers exactly the quarter
(a ~3-month duration ending on the quarter date, with no dimensions), then read the tags.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date

from .sources.http import WEEK, client

_XBRLI = "{http://www.xbrl.org/2003/instance}"


@dataclass
class Facts:
    quarter_end: str
    context: str
    values: dict[str, float]   # tag local name -> value in rupees
    text: dict[str, str]       # non-numeric facts, e.g. NatureOfReportStandaloneConsolidated


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _quarter_context(root: ET.Element, quarter_end: str) -> str | None:
    best = None
    for ctx in root.iter(f"{_XBRLI}context"):
        if ctx.find(f".//{_XBRLI}scenario") is not None or ctx.find(f".//{_XBRLI}segment") is not None:
            continue
        start, end = ctx.find(f".//{_XBRLI}startDate"), ctx.find(f".//{_XBRLI}endDate")
        if start is None or end is None or end.text.strip() != quarter_end:
            continue
        days = (date.fromisoformat(end.text.strip()) - date.fromisoformat(start.text.strip())).days
        if 80 <= days <= 95:
            best = ctx.get("id")
            break
    return best


def read(url: str, quarter_end: str) -> Facts | None:
    """Facts for the quarter ending `quarter_end` (YYYY-MM-DD), or None if the file lacks it."""
    root = ET.fromstring(client.get_bytes(url, ttl=WEEK))
    cid = _quarter_context(root, quarter_end)
    if not cid:
        return None
    values: dict[str, float] = {}
    text: dict[str, str] = {}
    for el in root:
        ref = el.get("contextRef")
        if ref is None or el.text is None:
            continue
        name = _local(el.tag)
        if ref == cid:
            try:
                values.setdefault(name, float(el.text.strip()))
            except ValueError:
                text.setdefault(name, el.text.strip())
        elif name == "NatureOfReportStandaloneConsolidated":
            text.setdefault(name, el.text.strip())
    return Facts(quarter_end, cid, values, text)
