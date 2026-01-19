import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb', // Standard Vercel limit
        },
    },
};

export default async function handler(req, res) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'API Key missing' });

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { action, data } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // ==========================================
        // ACTION: GENERATE LINE
        // ==========================================
        if (action === 'generateLine') {
            const prompt = `Generate a unique verification phrase using this format: "ScaleVest Verification Alpha Venture Apex Protocol Code 1234". Return ONLY the phrase, no other text.`;
            const result = await model.generateContent(prompt);
            return res.status(200).json({ 
                success: true, 
                verificationLine: result.response.text().trim() 
            });
        } 
        
        // ==========================================
        // ACTION: VERIFY VIDEO (URL METHOD)
        // ==========================================
        else if (action === 'verifyVideo') {
            const { videoUrl, expectedLine } = data;

            if (!videoUrl) return res.status(400).json({ error: 'Missing videoUrl' });

            // ⭐ THE BYPASS: Server fetches the video from Firebase URL directly
            const videoResponse = await fetch(videoUrl);
            const videoBuffer = await videoResponse.arrayBuffer();
            const videoBase64 = Buffer.from(videoBuffer).toString('base64');

            const prompt = `Analyze this video. Does the speaker say this EXACT phrase: "${expectedLine}"? 
            Return ONLY a JSON object: { "transcript": "text", "containsVerificationLine": true/false, "matchPercentage": number }`;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: videoBase64, mimeType: "video/mp4" } }
            ]);

            const responseText = result.response.text();
            const cleanJson = responseText.replace(/```json|```/g, "").trim();
            
            return res.status(200).json({ 
                success: true, 
                ...JSON.parse(cleanJson) 
            });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Gemini SDK Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
