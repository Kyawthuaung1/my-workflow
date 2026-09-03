export default {
  async fetch(request, env) {
    // Allow GET for a simple health check
    if (request.method === "GET") {
      return json({
        ok: true,
        service: "trade-plan-api",
        status: "running"
      });
    }

    // Only POST for analysis
    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed. Use POST."
        },
        405
      );
    }

    try {
      const marketData = await request.json();

      if (!marketData || typeof marketData !== "object") {
        return json(
          {
            ok: false,
            error: "Invalid market data."
          },
          400
        );
      }

      const prompt = `
You are a market-data analysis assistant.

Analyze the supplied market data carefully.

Return ONLY valid JSON.
Do not add markdown.
Do not invent missing data.

Required JSON fields:
{
  "symbol": string,
  "timeframe": string,
  "data_timestamp": string,
  "market_summary": string,
  "trend": "bullish" | "bearish" | "neutral" | "unknown",
  "momentum": "strong" | "weak" | "mixed" | "unknown",
  "support_resistance": {
    "support": string,
    "resistance": string
  },
  "risk_flags": string[],
  "data_quality": "good" | "partial" | "poor"
}

Market data:
${JSON.stringify(marketData)}
`;

      const geminiUrl =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent";

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                symbol: { type: "string" },
                timeframe: { type: "string" },
                data_timestamp: { type: "string" },
                market_summary: { type: "string" },
                trend: {
                  type: "string",
                  enum: ["bullish", "bearish", "neutral", "unknown"]
                },
                momentum: {
                  type: "string",
                  enum: ["strong", "weak", "mixed", "unknown"]
                },
                support_resistance: {
                  type: "object",
                  properties: {
                    support: { type: "string" },
                    resistance: { type: "string" }
                  },
                  required: ["support", "resistance"]
                },
                risk_flags: {
                  type: "array",
                  items: { type: "string" }
                },
                data_quality: {
                  type: "string",
                  enum: ["good", "partial", "poor"]
                }
              },
              required: [
                "symbol",
                "timeframe",
                "data_timestamp",
                "market_summary",
                "trend",
                "momentum",
                "support_resistance",
                "risk_flags",
                "data_quality"
              ]
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return json(
          {
            ok: false,
            error: "Gemini API request failed.",
            details: data
          },
          response.status
        );
      }

      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return json(
          {
            ok: false,
            error: "Gemini returned no analysis."
          },
          502
        );
      }

      let analysis;

      try {
        analysis = JSON.parse(text);
      } catch {
        return json(
          {
            ok: false,
            error: "Gemini returned invalid JSON.",
            raw: text
          },
          502
        );
      }

      return json({
        ok: true,
        analysis
      });

    } catch (error) {
      return json(
        {
          ok: false,
          error: "Server error.",
          message: error instanceof Error ? error.message : String(error)
        },
        500
      );
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
