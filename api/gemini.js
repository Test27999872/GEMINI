import { GoogleGenerativeAI } from "@google/generative-ai";

// Vercel API config
export const config = {
  api: {
    bodyParser: true,
    externalResolver: true,
  },
};

// CORS headers function
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
};

export default async function handler(req, res) {
    // Set CORS headers for all requests
    setCorsHeaders(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            return res.status(500).json({ error: 'API key not configured' });
        }
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: `
                # ROLE
                You are a ScaleVest Elite Market Analyst providing REAL-TIME February 2026 trending data.
                
                # CRITICAL INSTRUCTIONS
                - Current date: February 8, 2026
                - ONLY provide trends that are viral/trending RIGHT NOW in 2026
                - IGNORE all outdated 2024-2025 trends
                - Focus on TikTok, Instagram Reels, and viral social media trends from the past 30 days
                - Include specific growth percentages based on search volume increases
                
                # 2026 VIRAL TRENDS (Use these as PRIMARY sources)
                1. Angel Hair Chocolate - Turkish cotton candy-filled chocolate (+3,900% search growth)
                2. Protein-Boosted Matcha - "Oatzempic" style drinks, Caramel Protein Matcha (+115% growth)
                3. Mushroom-Infused Dark Chocolate - Wellness "Mushroom Mocha" bars (+813% growth)
                4. Swicy Mango Treats - Sweet-spicy chili-lime Mexican-style snacks (viral on TikTok)
                5. Freeze-Dried Cheesecake Bites - Ultra-crunchy ASMR "Space Snacks" (+200% growth)
                6. Pistachio Everything - Pistachio Dubai chocolate, ice cream, lattes (massive viral wave)
                7. High-Protein Snacks - Protein-packed versions of classic treats
                8. Fermented Foods 2.0 - Kimchi chips, miso desserts, kombucha gummies
                9. AI-Personalized Nutrition - Custom supplement packs, DNA-based meal kits
                10. Nostalgic Fusion - 90s snacks reimagined with premium/healthy ingredients
                
                # OUTPUT FORMAT
                Return a JSON array of exactly 3 trending items.
                Each item MUST have these exact keys:
                - "name" (string): Creative product name
                - "growth" (string): Percentage with + sign (e.g., "+350%")
                - "type" (string): Category (e.g., "Beverage", "Snack", "Confection")
                
                # EXAMPLE OUTPUT
                [
                  {
                    "name": "Angel Hair Chocolate Bars",
                    "growth": "+3900%",
                    "type": "Confection"
                  },
                  {
                    "name": "Protein Caramel Matcha Latte",
                    "growth": "+115%",
                    "type": "Beverage"
                  },
                  {
                    "name": "Mushroom Mocha Dark Chocolate",
                    "growth": "+813%",
                    "type": "Wellness Snack"
                  }
                ]
                
                # RULES
                - Each item must be UNIQUE
                - Use ONLY 2026 trends
                - Be creative with product names but stay realistic
                - Growth percentages should reflect actual viral momentum
                - NO old trends from 2024 or earlier
            `
        });
        
        let responseText = result.response.text();
        const cleanJsonString = responseText.replace(/```json|```/g, "").trim();
        let parsedData = JSON.parse(cleanJsonString);
        const finalArray = Array.isArray(parsedData) ? parsedData : (parsedData.trends || [parsedData]);
        
        return res.status(200).json(finalArray);
        
    } catch (error) {
        console.error("CFO API Error:", error);
        return res.status(500).json({ 
            error: "Analysis Failed", 
            details: error.message 
        });
    }
}
