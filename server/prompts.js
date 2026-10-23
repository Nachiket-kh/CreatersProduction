export function parsePrompt(rawEmail) {
  return `You extract collaboration deals from brand emails sent to an Instagram creator in Pune.
Return one JSON object and nothing else. No markdown.

Schema:
{
  "brand": string,
  "intent": "paid_collab" | "gifted" | "spam" | "follow_up",
  "format": "reel" | "post" | "stories",
  "budgetInr": number | null,
  "deadline": string,
  "deliverables": string[],
  "summary": string,
  "usageDays": number
}

Rules:
- paid_collab only if they offer money.
- gifted if they offer product or exposure and no fee.
- spam if irrelevant or a scam.
- follow_up if it is unclear.
- Strip rupee symbols and commas from money. ₹8,000 becomes 8000.
- If no budget, budgetInr is null, not 0.
- If they do not mention usage time, usageDays is 30.
- summary is one sentence.
- Do not invent a higher budget than the email states.

Email:
"""
${rawEmail}
"""`;
}

export function replyPrompt(intent, deal, suggestedInr) {
  return `You write short emails for creator Aanya Kulkarni (@aanya.eats.pune), niche Pune food and city life.
Return JSON only: { "subject": string, "body": string }
The body is plain text, under 120 words, warm and direct, no hashtags, no emojis, no legal clauses.

Facts you must obey:
- Intent of this draft: ${intent}
- Brand: ${deal.brand}
- Their budget: ${deal.budgetInr ?? "none"}
- Deliverables: ${deal.deliverables.join(", ")}
- Deadline: ${deal.deadline}
- Her fee, already decided, is ₹${suggestedInr}. Never change this number.
- Usage included: 30 days. Do not offer more.

If intent is counter, say their offer is below her usual fee and state ₹${suggestedInr} exactly.
If intent is decline, do not negotiate.
If intent is accept, confirm deliverables, deadline, and fee.
If intent is ask_brief, ask for the product, the posting date, and usage days.

Deal summary: ${deal.summary}`;
}
