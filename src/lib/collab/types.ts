export type Format = "reel" | "post" | "stories";
export type Intent = "paid_collab" | "gifted" | "spam" | "follow_up";
export type Status = "new" | "negotiating" | "confirmed" | "posted" | "paid" | "declined";

export type Mail = {
  id: string;
  from: string;
  subject: string;
  body: string;
  received: string;
  processed: boolean;
};

export type Deal = {
  id: string;
  mailId: string;
  brand: string;
  intent: Intent;
  format: Format;
  budgetInr: number | null;
  deadline: string;
  deliverables: string[];
  summary: string;
  usageDays: number;
  status: Status;
  topic: string;
  suggestedInr: number;
  lowball: boolean;
  reason: string;
  draftSubject: string;
  draftBody: string;
  draftKind: "accept" | "counter" | "decline" | "ask_brief";
};

export type Reel = {
  id: string;
  title: string;
  topic: "food" | "commute" | "beauty";
  reach: number;
  saves: number;
  collab: boolean;
};

export type LogLine = { id: string; text: string };

export type Creator = {
  name: string;
  handle: string;
  gmail: string;
  niche: string;
  followers: number;
  rates: Record<Format, number>;
};
