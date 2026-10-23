export function quote(creator, deal) {
  const format = ["reel", "post", "stories"].includes(deal.format) ? deal.format : "reel";
  const baseInr = creator.rates[format];
  const usageExtra = Number(deal.usageDays) > 30;
  const suggestedInr = usageExtra ? Math.round((baseInr * 1.4) / 100) * 100 : baseInr;
  const hasBudget = typeof deal.budgetInr === "number" && Number.isFinite(deal.budgetInr);
  const lowball = hasBudget && deal.budgetInr < baseInr * 0.7;
  let reason;
  if (!hasBudget) {
    reason = `No fee was offered. Her ${format} rate is ₹${baseInr.toLocaleString("en-IN")}.`;
  } else if (usageExtra) {
    reason = `The offered budget is ₹${deal.budgetInr.toLocaleString("en-IN")}; her ${format} rate is ₹${baseInr.toLocaleString("en-IN")} and extended usage brings the suggested fee to ₹${suggestedInr.toLocaleString("en-IN")}.`;
  } else {
    reason = `The offered budget is ₹${deal.budgetInr.toLocaleString("en-IN")} and her ${format} rate is ₹${baseInr.toLocaleString("en-IN")}.`;
  }
  return { baseInr, suggestedInr, lowball, usageExtra, reason };
}

export function insight(posts) {
  const average = (topic) => {
    const rows = posts.filter((post) => post.topic === topic);
    return rows.length ? Math.round(rows.reduce((sum, post) => sum + post.reach, 0) / rows.length) : 0;
  };
  const averages = { food: average("food"), beauty: average("beauty") };
  const text = averages.food > averages.beauty
    ? "Food and commute reels outperform beauty posts. Prefer food collabs."
    : `Beauty posts average ${averages.beauty.toLocaleString("en-IN")} reach, compared with ${averages.food.toLocaleString("en-IN")} for food posts. Compare results before choosing a collab.`;
  return { text, averages };
}

export function todayActions(deals, insightText) {
  const next = deals.find((deal) => deal.status === "new");
  const unpaid = deals.find((deal) => deal.status === "posted");
  return [
    next ? `Reply to ${next.brand}` : "No new brand emails.",
    unpaid ? `Chase payment from ${unpaid.brand}` : "No unpaid live posts.",
    insightText,
  ];
}
