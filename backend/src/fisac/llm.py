"""LLM-assisted schedule generation via OpenRouter.

The model's only job is expanding a natural-language recurring rule into a
schedule of occurrences (period-aware name + invoice_date + payment_date).
Deterministic data - category, amounts, VAT, payment method - is entered once
by the user in the frontend and applied to every occurrence there, so none of
it appears in the prompt.

The default model is free-tier; free endpoints don't reliably support enforced
structured outputs, so the contract is JSON-by-instruction with defensive
parsing here - the response is never trusted beyond what Pydantic validates.
"""

import json
from datetime import date

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, ValidationError

from fisac.config import settings
from fisac.schemas import ScheduleOccurrence

_TIMEOUT_SECONDS = 60.0

_SYSTEM_PROMPT = """\
You expand a natural-language rule describing a recurring revenue or expense
into a schedule of individual occurrences.

Today's date: {today}.

Output exactly one JSON object, no prose, no Markdown fences:
{{"occurrences": [{{"name": string, "invoice_date": "YYYY-MM-DD", "payment_date": "YYYY-MM-DD" or null}}, ...]}}

Rules:
- invoice_date is the fiscal/invoice date of each occurrence, derived from the
  described schedule.
- payment_date: derive it from what the rule says about payment timing (an
  offset like "payé 30 jours après", a day of month like "domiciliation le 5",
  a card billing day, ...). If the rule says nothing about payment timing, set
  payment_date equal to invoice_date.
- name: every occurrence's name must identify its period, in the same language
  as the rule - e.g. "Cotisations sociales Q1", "Cotisations sociales Q2",
  "Loyer janvier 2026". Never repeat a bare name without a period qualifier.
- Horizon: generate occurrences from the rule's start (default: today) until
  the end of the current year, unless the rule itself specifies an end or a
  count - then honor the rule.
- Dates must be real calendar dates. If a day doesn't exist in a month (e.g.
  the 31st), use the last day of that month.
"""


class _GeneratedSchedule(BaseModel):
    occurrences: list[ScheduleOccurrence] = Field(min_length=1, max_length=100)


def _strip_fences(content: str) -> str:
    """Tolerate models wrapping the JSON in ```json ... ``` fences."""
    text = content.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1 :]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


async def generate_schedule(description: str) -> tuple[list[ScheduleOccurrence], str | None]:
    """Returns the occurrences plus the provider slug that served the request
    (surfaced to the user - formatting quality varies by provider)."""
    if not settings.openrouter_api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not configured")

    payload = {
        "model": settings.openrouter_model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT.format(today=date.today().isoformat())},
            {"role": "user", "content": description},
        ],
    }
    providers = [p.strip() for p in settings.openrouter_providers.split(",") if p.strip()]
    if providers:
        # provider.only restricts routing to these slugs - no fallback to
        # other providers (see config.openrouter_providers).
        payload["provider"] = {"only": providers}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {exc}") from exc

    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="The model is rate-limited (free tier) - retry in a moment",
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter returned {response.status_code}: {response.text[:500]}",
        )

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(_strip_fences(content))
        schedule = _GeneratedSchedule.model_validate(parsed)
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
        raise HTTPException(
            status_code=502, detail=f"The model returned invalid data: {exc}"
        ) from exc

    served_by = data.get("provider")
    return schedule.occurrences, served_by if isinstance(served_by, str) else None
