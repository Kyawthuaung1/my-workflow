export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "trade-plan-api",
        status: "running"
      });
    }

    // CMC market data
if (request.method === "GET" && url.pathname === "/market") {
  const input = (
    url.searchParams.get("symbol") || "BTCUSDT"
  ).toUpperCase();

  // BTCUSDT -> BTC
  const symbol = input.endsWith("USDT")
    ? input.slice(0, -4)
    : input;

  try {
    const cmcUrl =
      "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest" +
      `?symbol=${encodeURIComponent(symbol)}` +
      "&convert=USD";

    const response = await fetch(cmcUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-CMC_PRO_API_KEY": env.CMC_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return json({
        ok: false,
        source: "coinmarketcap",
        input_symbol: input,
        resolved_symbol: symbol,
        error: "CMC API request failed.",
        details: data
      }, response.status);
    }

    const asset = Array.isArray(data?.data)
  ? data.data.find((item) => item?.symbol === symbol)
  : data?.data?.[symbol];

    if (!asset) {
      return json({
        ok: false,
        source: "coinmarketcap",
        input_symbol: input,
        resolved_symbol: symbol,
        error: "Asset not found on CoinMarketCap."
      }, 404);
    }

    const quote = Array.isArray(asset?.quote)
  ? asset.quote.find((item) => item?.symbol === "USD")
  : asset?.quote?.USD;

    return json({
      ok: true,
      source: "coinmarketcap",
      input_symbol: input,
      resolved_symbol: symbol,
      asset: {
        id: asset.id,
        name: asset.name,
        symbol: asset.symbol
      },
      market: {
        price: quote?.price ?? null,
        market_cap: quote?.market_cap ?? null,
        volume_24h: quote?.volume_24h ?? null,
        percent_change_1h: quote?.percent_change_1h ?? null,
        percent_change_24h: quote?.percent_change_24h ?? null,
        percent_change_7d: quote?.percent_change_7d ?? null,
        last_updated: quote?.last_updated ?? null
      },
      cmc_timestamp: data?.status?.timestamp ?? null
    });

  } catch (error) {
    return json({
      ok: false,
      source: "coinmarketcap",
      error: error instanceof Error
        ? error.message
        : String(error)
    }, 500);
  }
}
    // Binance public OHLCV
    if (request.method === "GET" && url.pathname === "/ohlcv") {
      const input = (
        url.searchParams.get("symbol") || "BTCUSDT"
      ).toUpperCase();

      const symbol = input.endsWith("USDT")
        ? input
        : `${input}USDT`;

      const intervalInput = (
        url.searchParams.get("interval") || "1h"
      ).toLowerCase();

      const intervalMap = {
        "5m": "5m",
        "15m": "15m",
        "1h": "1h",
        "4h": "4h",
        "1d": "1d",
        "hourly": "1h",
        "daily": "1d"
      };

      const interval = intervalMap[intervalInput];

      if (!interval) {
        return json({
          ok: false,
          source: "binance",
          error: "Unsupported interval.",
          supported_intervals: ["5m", "15m", "1h", "4h", "1d"]
        }, 400);
      }

      const count = Math.min(
        Math.max(
          parseInt(url.searchParams.get("count") || "24", 10),
          1
        ),
        1000
      );

      try {
        const binanceUrl =
          "https://data-api.binance.vision/api/v3/klines" +
          `?symbol=${encodeURIComponent(symbol)}` +
          `&interval=${encodeURIComponent(interval)}` +
          `&limit=${count}`;

        const response = await fetch(binanceUrl, {
          method: "GET",
          headers: {
            "Accept": "application/json"
          }
        });

        const contentType = response.headers.get("content-type") || "";
const raw = await response.text();

if (!response.ok) {
  return json({
    ok: false,
    source: "binance",
    input_symbol: input,
    resolved_symbol: symbol,
    error: "Binance HTTP request failed.",
    status: response.status,
    content_type: contentType,
    details: raw.slice(0, 500)
  }, response.status);
}

let data;

try {
  data = JSON.parse(raw);
} catch (e) {
  return json({
    ok: false,
    source: "binance",
    input_symbol: input,
    resolved_symbol: symbol,
    error: "Binance returned non-JSON response.",
    status: response.status,
    content_type: contentType,
    details: raw.slice(0, 500)
  }, 502);
}

if (!Array.isArray(data)) {
        const candles = data.map((candle) => ({
          time_open: new Date(Number(candle[0])).toISOString(),
          time_close: new Date(Number(candle[6])).toISOString(),
          open: Number(candle[1]),
          high: Number(candle[2]),
          low: Number(candle[3]),
          close: Number(candle[4]),
          volume: Number(candle[5])
        }));

        return json({
          ok: true,
          source: "binance",
          input_symbol: input,
          resolved_symbol: symbol,
          interval,
          count_requested: count,
          count_returned: candles.length,
          candles
        });

      } catch (error) {
        return json({
          ok: false,
          source: "binance",
          input_symbol: input,
          resolved_symbol: symbol,
          error: "Connection to Binance failed.",
          details: error instanceof Error
            ? error.message
            : String(error)
        }, 500);
      }
    }

    // Existing Gemini POST endpoint
    if (request.method !== "POST") {
      return json({
        ok: false,
        error: "Method not allowed."
      }, 405);
    }

    try {
      const marketData = await request.json();

      if (!marketData || typeof marketData !== "object") {
        return json({
          ok: false,
          error: "Invalid market data."
        }, 400);
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
        return json({
          ok: false,
          error: "Gemini API request failed.",
          details: data
        }, response.status);
      }

      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return json({
          ok: false,
          error: "Gemini returned no analysis."
        }, 502);
      }

      return json({
        ok: true,
        analysis: JSON.parse(text)
      });

    } catch (error) {
      return json({
        ok: false,
        error: "Server error.",
        message: error instanceof Error
          ? error.message
          : String(error)
      }, 500);
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
