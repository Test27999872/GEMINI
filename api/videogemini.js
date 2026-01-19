import { GoogleGenerativeAI } from "@google/generative-ai";

// ⭐ CONFIG: Increase body size limit to Vercel's maximum
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req, res) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 2. Initialize Gemini
    const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ success: false, error: 'API Key missing in Vercel settings' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { action, data } = req.body;

        // --- ACTION: GENERATE LINE ---
        if (action === 'generateLine') {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Generate a unique verification phrase like: "ScaleVest Verification Alpha Venture Apex Protocol Code 1234". Return ONLY the phrase.`;
            
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            return res.status(200).json({ success: true, verificationLine: text });
        }

        // --- ACTION: VERIFY VIDEO ---
        else if (action === 'verifyVideo') {
            const { videoBase64, expectedLine } = data;
            if (!videoBase64) return res.status(400).json({ error: 'No video data' });

            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash"
            });

            const prompt = `Analyze this video. The user must say: "${expectedLine}". 
            Return ONLY a JSON object with: 
            { "transcript": "text", "containsVerificationLine": true/false, "matchPercentage": number }`;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: videoBase64, mimeType: "video/mp4" } }
            ]);

            const responseText = result.response.text();
            
            // Clean the response (remove markdown if Gemini adds it)
            const cleanJson = responseText.replace(/```json|```/g, "").trim();
            const analysis = JSON.parse(cleanJson);

            return res.status(200).json({ success: true, ...analysis });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message,
            tip: "Check if your video is too large or if the API key is valid."
        });
    }
}
