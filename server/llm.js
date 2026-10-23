export async function askJSON(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI returned no message content");
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end < start) {
      const error = new Error("OpenAI did not return JSON");
      error.code = "INVALID_JSON";
      throw error;
    }
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      const error = new Error("OpenAI returned invalid JSON");
      error.code = "INVALID_JSON";
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}
