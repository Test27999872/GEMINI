import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API Key missing' });

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { action, data } = req.body;

        // ✅ FIX: Use 'gemini-1.5-flash' without version prefix if using SDK
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        if (action === 'generateLine') {
            const prompt = `Generate a unique verification phrase like: "ScaleVest Verification Alpha Venture Apex Protocol Code 1234". Return ONLY the phrase.`;
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            return res.status(200).json({ success: true, verificationLine: text });
        } 
        
        else if (action === 'verifyVideo') {
            const { videoBase64, expectedLine } = data;
            const prompt = `Analyze this video. Does the user say: "${expectedLine}"? Return JSON: { "transcript": "text", "containsVerificationLine": true/false, "matchPercentage": number }`;
            
            const result = await model.generateContent([
                prompt,
                { inlineData: { data: videoBase64, mimeType: "video/mp4" } }
            ]);

            const responseText = result.response.text();
            const cleanJson = responseText.replace(/```json|```/g, "").trim();
            return res.status(200).json({ success: true, ...JSON.parse(cleanJson) });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Gemini Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
