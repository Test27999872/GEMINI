import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'API Key missing' });

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { action, data } = req.body;

        // ✅ FIX: Using 'gemini-1.5-flash' without the version prefix or '-latest' suffix
        // The SDK handles the URL versioning automatically.
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        if (action === 'generateLine') {
            const prompt = `Generate a unique verification phrase using this format: "ScaleVest Verification Alpha Venture Apex Protocol Code 1234". Return ONLY the phrase, no other text.`;
            
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim();
            
            return res.status(200).json({ 
                success: true, 
                verificationLine: text 
            });
        } 
        
        else if (action === 'verifyVideo') {
            const { videoBase64, expectedLine } = data;
            const prompt = `Analyze this video. Does the speaker say this EXACT phrase: "${expectedLine}"? 
            Return ONLY a JSON object: { "transcript": "text", "containsVerificationLine": true/false, "matchPercentage": number }`;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: videoBase64, mimeType: "video/mp4" } }
            ]);

            const responseText = result.response.text();
            // Remove markdown code blocks if Gemini includes them
            const cleanJson = responseText.replace(/```json|```/g, "").trim();
            
            return res.status(200).json({ 
                success: true, 
                ...JSON.parse(cleanJson) 
            });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Gemini SDK Error:', error);
        // This will send the error back to your vests.html console for easy debugging
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}
