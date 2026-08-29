export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Please send POST request with Market Data.");
    }
    
    const marketData = await request.text();
    
    // Gemini API ဆီသို့ လှမ်းခေါ်ခြင်း
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${env.GEMINI_API_KEY}`;
    const prompt = `အောက်ပါ Market Data ကို သေချာဖတ်ပြီး Trade Plan တစ်ခု ရေးဆွဲပေးပါ။ Data: ${marketData}`;

    try {
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await response.json();
      const tradePlan = data.candidates[0].content.parts[0].text;
      
      return new Response(tradePlan, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    } catch (error) {
      return new Response("Error connecting to Gemini API.");
    }
  }
};

