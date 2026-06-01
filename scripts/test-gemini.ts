import "dotenv/config";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const prompt = `You are classifying a local event into exactly one category.\n\nEvent title: "Test Event"\nEvent description: "This is a test."\n\nValid categories: music, comedy, art, theater, food_drink, fitness, community, nightlife, family, sports, film, other\n\nCategory:`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 256,
        topP: 1,
      },
    }),
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
main().catch(console.error);
