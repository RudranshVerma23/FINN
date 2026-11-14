"""FINN Network engine (FR-18..FR-23). Pure code, no LLM (ADR-04, NFR-05).

    orgs     canonical organisations: alias matching, groups, NSE symbols
    model    people, stints, education; loading the investor's network inputs
    ties     how strong a tie is, and why (investor->contact, person->person)
    resolve  match a name from a filing to people FINN already knows
    paths    1st/2nd-degree paths from the investor to anyone with a career history
    who      who to call about a company (worked there, competitor, supplier, customer)
"""
