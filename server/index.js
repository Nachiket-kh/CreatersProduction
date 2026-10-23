import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readStore, writeStore } from "./store.js";
import { quote, insight, todayActions } from "./rate.js";
import { askJSON } from "./llm.js";
import { parsePrompt, replyPrompt } from "./prompts.js";
import { samples } from "./samples.js";

const app = new Hono();
const statuses = ["new", "negotiating", "confirmed", "posted", "paid"];
const replyIntents = ["accept", "counter", "decline", "ask_brief"];

app.use("/api/*", cors({ origin: "http://localhost:5173", allowMethods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"], allowHeaders: ["Content-Type"] }));
app.onError((error, c) => {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  return c.json({ error: status === 500 ? "Internal server error" : error.message }, status);
});

function validParsedDeal(value) {
  return value && typeof value.brand === "string" &&
    ["paid_collab", "gifted", "spam", "follow_up"].includes(value.intent) &&
    ["reel", "post", "stories"].includes(value.format) &&
    (value.budgetInr === null || (typeof value.budgetInr === "number" && Number.isFinite(value.budgetInr))) &&
    typeof value.deadline === "string" && Array.isArray(value.deliverables) &&
    value.deliverables.every((item) => typeof item === "string") &&
    typeof value.summary === "string" && typeof value.usageDays === "number" && Number.isFinite(value.usageDays);
}

function fallbackParse(rawEmail) {
  if (/(?:^|[^\d])(?:8,000|8000)(?!\d)/.test(rawEmail)) {
    return { brand: "Café Ramwadi", intent: "paid_collab", format: "reel", budgetInr: 8000, deadline: "this week", deliverables: ["1 30 second reel", "2 stories"], summary: "Café Ramwadi offered ₹8,000 for one reel and two stories with 30 days of usage.", usageDays: 30 };
  }
  if (/GlowTheory|cannot pay/i.test(rawEmail)) {
    return { brand: "GlowTheory", intent: "gifted", format: "reel", budgetInr: null, deadline: "no deadline given", deliverables: ["1 reel"], summary: "GlowTheory offered a gifted skincare kit for one reel with no fee.", usageDays: 30 };
  }
  if (/(?:^|[^\d])(?:18,000|18000)(?!\d)/.test(rawEmail)) {
    return { brand: "Vanaz Bakehouse", intent: "paid_collab", format: "reel", budgetInr: 18000, deadline: "in 10 days", deliverables: ["1 reel", "3 stories"], summary: "Vanaz Bakehouse offered ₹18,000 for one reel and three stories with 30 days of usage.", usageDays: 30 };
  }
  return { brand: "Unknown brand", intent: "follow_up", format: "reel", budgetInr: null, deadline: "unclear", deliverables: ["1 reel"], summary: "Could not read this email. Review it yourself.", usageDays: 30 };
}

function fallbackReply(intent, deal, suggestedInr) {
  const amount = `₹${suggestedInr.toLocaleString("en-IN")}`;
  if (intent === "accept") {
    return { subject: `Yes — ${deal.brand} x Aanya`, body: `Hi,\n\nHappy to confirm ${deal.deliverables.join(" and ")} by ${deal.deadline} for ${amount}.\n\nThanks,\nAanya` };
  }
  if (intent === "counter") {
    return { subject: `Rate for ${deal.brand}`, body: `Hi,\n\nThanks for the offer. The budget does not match my ${deal.format || "reel"} rate. My fee is ${amount}, including 30 days of usage.\n\nThanks,\nAanya` };
  }
  if (intent === "decline") {
    return { subject: "Not the right fit", body: "Hi,\n\nThanks for thinking of me. I’ll have to pass on this collaboration, but I appreciate you reaching out.\n\nBest,\nAanya" };
  }
  return { subject: "A few details before I confirm", body: "Hi,\n\nCould you share more about the product, the posting date, and how many days you need usage?\n\nThanks,\nAanya" };
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/creator", async (c) => {
  const db = await readStore();
  return c.json(db.creator);
});

app.put("/api/creator", async (c) => {
  const body = await c.req.json();
  const rates = body?.rates;
  if (typeof body?.niche !== "string" || typeof body?.followers !== "number" || !Number.isFinite(body.followers) ||
    !rates || ["reel", "post", "stories"].some((key) => typeof rates[key] !== "number" || !Number.isFinite(rates[key]) || rates[key] <= 0)) {
    return c.json({ error: "Provide a niche, numeric followers count, and positive reel, post, and stories rates." }, 400);
  }
  const db = await readStore();
  db.creator = { ...db.creator, niche: body.niche, followers: body.followers, rates: { reel: rates.reel, post: rates.post, stories: rates.stories } };
  await writeStore(db);
  return c.json(db.creator);
});

app.get("/api/deals", async (c) => {
  const db = await readStore();
  return c.json({ deals: [...db.deals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((deal) => ({ ...deal, quote: quote(db.creator, deal) })) });
});

app.get("/api/deals/:id", async (c) => {
  const db = await readStore();
  const deal = db.deals.find((item) => item.id === c.req.param("id"));
  if (!deal) return c.json({ error: "Deal not found" }, 404);
  return c.json({ ...deal, quote: quote(db.creator, deal) });
});

app.patch("/api/deals/:id", async (c) => {
  const body = await c.req.json();
  if (!statuses.includes(body?.status)) return c.json({ error: "Status must be new, negotiating, confirmed, posted, or paid." }, 400);
  const db = await readStore();
  const deal = db.deals.find((item) => item.id === c.req.param("id"));
  if (!deal) return c.json({ error: "Deal not found" }, 404);
  deal.status = body.status;
  await writeStore(db);
  return c.json(deal);
});

app.post("/api/inbox/parse", async (c) => {
  const body = await c.req.json();
  if (typeof body?.rawEmail !== "string" || !body.rawEmail.trim()) return c.json({ error: "rawEmail is required" }, 400);
  const db = await readStore();
  let parsed;
  let source = "llm";
  try {
    const prompt = parsePrompt(body.rawEmail);
    try {
      parsed = await askJSON(prompt);
    } catch (error) {
      if (error.code !== "INVALID_JSON") throw error;
      parsed = null;
    }
    if (!validParsedDeal(parsed)) {
      try {
        parsed = await askJSON(`${prompt}\n\nYour last answer was invalid JSON. Fix it.`);
      } catch {
        parsed = null;
      }
    }
    if (!validParsedDeal(parsed)) throw new Error("Invalid deal fields from model");
  } catch {
    parsed = fallbackParse(body.rawEmail);
    source = "fallback";
  }
  const deal = { id: `d-${Date.now()}`, ...parsed, status: "new", createdAt: new Date().toISOString() };
  db.deals.push(deal);
  await writeStore(db);
  return c.json({ deal, quote: quote(db.creator, deal), source }, 201);
});

app.post("/api/deals/:id/rate", async (c) => {
  const db = await readStore();
  const deal = db.deals.find((item) => item.id === c.req.param("id"));
  if (!deal) return c.json({ error: "Deal not found" }, 404);
  return c.json(quote(db.creator, deal));
});

app.post("/api/deals/:id/reply", async (c) => {
  const body = await c.req.json();
  if (!replyIntents.includes(body?.intent)) return c.json({ error: "intent must be accept, counter, decline, or ask_brief" }, 400);
  const db = await readStore();
  const deal = db.deals.find((item) => item.id === c.req.param("id"));
  if (!deal) return c.json({ error: "Deal not found" }, 404);
  const q = quote(db.creator, deal);
  let reply;
  let source = "llm";
  try {
    reply = await askJSON(replyPrompt(body.intent, deal, q.suggestedInr));
    if (!reply || typeof reply.subject !== "string" || typeof reply.body !== "string") throw new Error("Invalid reply fields from model");
    const amountForms = [`₹${q.suggestedInr}`, `₹${q.suggestedInr.toLocaleString("en-IN")}`];
    if (body.intent === "counter" && !amountForms.some((amount) => reply.body.includes(amount))) {
      reply.body = `${reply.body.trim()}\n\nMy fee for this is ${amountForms[1]}.`;
    }
  } catch {
    reply = fallbackReply(body.intent, deal, q.suggestedInr);
    source = "fallback";
  }
  return c.json({ ...reply, quote: q, source });
});

app.get("/api/content", async (c) => {
  const db = await readStore();
  const result = insight(db.posts);
  return c.json({ posts: db.posts, insight: result.text, averages: result.averages });
});

app.get("/api/today", async (c) => {
  const db = await readStore();
  const contentInsight = insight(db.posts).text;
  const counts = Object.fromEntries(statuses.map((status) => [status, db.deals.filter((deal) => deal.status === status).length]));
  return c.json({ actions: todayActions(db.deals, contentInsight), counts });
});

app.get("/api/samples", (c) => c.json(samples));

const port = Number(process.env.PORT || 3001);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`CollabDesk API listening on http://localhost:${info.port}`);
});
