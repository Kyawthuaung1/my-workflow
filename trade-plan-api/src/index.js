export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(
        "Please send POST request with Market Data.",
        { status: 405 }
      );
    }

    try {
      const marketData = await request.json();

      const geminiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${env.GEMINI_API_KEY}`;

      const prompt = `
You are a professional crypto trading analyst.

Analyze the following market data and create a trade plan.

Return ONLY valid JSON.

Market Data:
${JSON.stringify(marketData)}
`;

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                symbol: { type: "STRING" },
                side: { type: "STRING" },
                entry: { type: "NUMBER" },
                stop_loss: { type: "NUMBER" },
                take_profit: { type: "NUMBER" },
                confidence: { type: "NUMBER" },
                analysis: { type: "STRING" }
              },
              required: [
                "symbol",
                "side",
                "entry",
                "stop_loss",
                "take_profit",
                "confidence",
                "analysis"
              ]
            }
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();

        return new Response(
          JSON.stringify({
            error: "Gemini API error",
            details: errorText
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      const data = await response.json();

      const result =
        data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!result) {
        return new Response(
          JSON.stringify({
            error: "No trade plan returned by Gemini"
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response(result, {
        headers: {
          "Content-Type": "application/json"
        }
      });

    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Invalid request",
          message: error.message
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
