"""Source adapters. One module per public source; each returns plain, normalised dicts.

    nse       — corporate announcements + financial-results index (XBRL links)
    prices    — end-of-day price/volume via Yahoo Finance
    screener  — financial tables + annual report / concall document links

All network access goes through `http.PoliteClient` (rate limit, retries, disk cache).
"""
