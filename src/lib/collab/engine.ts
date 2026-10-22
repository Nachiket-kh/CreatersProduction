import type { Creator, Deal, Format, Intent, Mail, Reel } from "./types";

export function inr(n: number) {
  return `\u20b9${n.toLocaleString("en-IN")}`;
}

export function quote(creator: Creator, format: Format, budgetInr: number | null, usageDays: number) {
  const base = creator.rates[format];
  const suggestedInr = usageDays > 30 ? Math.round((base * 1.4) / 100) * 100 : base;
  const lowball = budgetInr != null && budgetInr < base * 0.7;
  const reason =
    budgetInr == null
      ? `No fee was offered. Your ${format} rate is ${inr(base)}.`
      : lowball
        ? `Their ${inr(budgetInr)} is under your ${format} rate of ${inr(base)}.`
        : `Their ${inr(budgetInr)} meets your ${format} rate of ${inr(suggestedInr)}.`;
  return { suggestedInr, lowball, reason };
}

export function parseMail(body: string, subject: string) {
  const text = `${subject}\n${body}`;
  const money = text.match(/\u20b9\s?([\d,]+)/);
  const budgetInr = money ? Number(money[1].replace(/,/g, "")) : null;
  const format = /stories/i.test(text) && !/reel/i.test(text) ? "stories" : /post\b/i.test(text) && !/reel/i.test(text) ? "post" : "reel";
  const gifted = /cannot pay|no fee|exposure|gifted/i.test(text);
  const intent = gifted ? "gifted" : budgetInr ? "paid_collab" : "follow_up";
  const brand = subject.split(/ x | for | \u2014 | - /i)[0].replace(/^collab\s*/i, "").trim() || "Unknown brand";
  const usageDays = /60 days/.test(text) ? 60 : 30;
  const topic = /skincare|beauty|glow/i.test(text) ? "beauty" : /commute|metro|outfit/i.test(text) ? "commute" : "food";
  const deliverables = [
    format === "reel" ? "1 reel" : format === "post" ? "1 post" : "story set",
    /3 stories/i.test(text) ? "3 stories" : /2 stories/i.test(text) ? "2 stories" : "",
  ].filter(Boolean);
  const deadline = /this week/i.test(text) ? "this week" : /10 days/i.test(text) ? "in 10 days" : /no deadline/i.test(text) ? "no deadline" : "this month";
  const summary = gifted
    ? `${brand} wants a gifted ${format}. No fee.`
    : `${brand} offered ${budgetInr ? inr(budgetInr) : "no budget"} for a ${format}.`;
  return { brand, intent, format, budgetInr, deadline, deliverables, summary, usageDays, topic };
}

export function draftFor(creator, parsed, suggestedInr, lowball) {
  if (/alcohol|bar\b/i.test(`${parsed.summary} ${parsed.brand}`)) {
    return {
      draftKind: "decline",
      draftSubject: `Can't take this \u2014 ${parsed.brand}`,
      draftBody: `Hi,\n\nThanks for the note. I do not promote alcohol brands, so I will pass.\n\nAanya`,
    };
  }
  if (parsed.intent === "gifted" || parsed.intent === "spam") {
    return {
      draftKind: "decline",
      draftSubject: `Not the right fit \u2014 ${parsed.brand}`,
      draftBody: `Hi,\n\nThanks for writing. I do not take unpaid or gifted-only work. If a paid ${parsed.format} makes sense later, my fee starts at ${inr(suggestedInr)}.\n\nAanya`,
    };
  }
  if (lowball) {
    return {
      draftKind: "counter",
      draftSubject: `Rate for ${parsed.brand}`,
      draftBody: `Hi,\n\nI would like to do this. ${inr(parsed.budgetInr ?? 0)} is below my ${parsed.format} fee. I can deliver ${parsed.deliverables.join(" + ")} for ${inr(suggestedInr)}, with 30 days of usage.\n\nAanya\n${creator.handle}`,
    };
  }
  return {
    draftKind: "accept",
    draftSubject: `Yes \u2014 ${parsed.brand} x Aanya`,
    draftBody: `Hi,\n\nHappy to confirm ${parsed.deliverables.join(" + ")} for ${inr(suggestedInr)}, posted ${parsed.deadline}. Usage is 30 days.\n\nAanya\n${creator.handle}`,
  };
}

export function dealFromMail(mail, creator) {
  const parsed = parseMail(mail.body, mail.subject);
  const q = quote(creator, parsed.format, parsed.budgetInr, parsed.usageDays);
  const draft = draftFor(creator, parsed, q.suggestedInr, q.lowball);
  return { id: `deal-${mail.id}`, mailId: mail.id, ...parsed, status: "new", ...q, ...draft };
}

export function insight(reels) {
  const avg = (topic) => {
    const rows = reels.filter((r) => r.topic === topic);
    if (!rows.length) return 0;
    return Math.round(rows.reduce((s, r) => s + r.reach, 0) / rows.length);
  };
  const food = avg("food");
  const beauty = avg("beauty");
  const commute = avg("commute");
  const line =
    food >= beauty
      ? "Food and metro reels outperform beauty posts. Autopilot will prefer food collabs."
      : "Beauty is ahead this week. Autopilot will not auto-decline beauty briefs.";
  return { food, beauty, commute, line };
}

export function fitScore(topic, reels) {
  const { food, beauty } = insight(reels);
  if (topic === "food") return food >= beauty ? 92 : 70;
  if (topic === "beauty") return beauty > food ? 88 : 41;
  if (topic === "commute") return 76;
  return 60;
}
