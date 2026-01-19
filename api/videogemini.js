import { GoogleGenerativeAI } from "@google/generative-ai";

// ⭐ CONFIG: Increase body size limit to Vercel's maximum (4.5MB)
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

export default async function handler(req, res) {
    // 1. Enable CORS
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
    // Make sure your Vercel Env Variable matches this name exactly!
    const apiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY; 
    
    if (!apiKey) {
        console.error("❌ Missing GEMINI_KEY in environment variables");
        return res.status(500).json({ error: 'Server configuration error: API Key missing' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        const { action, data } = req.body;

        // ==========================================
        // ACTION: GENERATE LINE
        // ==========================================
        if (action === 'generateLine') {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `Generate a unique, random verification phrase using this format: "ScaleVest Verification [Word1] [Word2] [Word3] [Word4] Code [4-digit-number]"
            Choose random words from business, space, and tech categories.
            Return ONLY the verification phrase, nothing else.`;

            const result = await model.generateContent(prompt);
            const verificationLine = result.response.text().trim();

            return res.status(200).json({ 
                success: true, 
                verificationLine 
            });
        }

        // ==========================================
        // ACTION: VERIFY VIDEO
        // ==========================================
        else if (action === 'verifyVideo') {
            const { videoBase64, expectedLine } = data;

            if (!videoBase64 || !expectedLine) {
                return res.status(400).json({ error: 'Missing video or verification line' });
            }

            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash",
                generationConfig: { responseMimeType: "application/json" } // Force JSON response
            });

            const prompt = `Analyze this video audio and visuals.
            The user is supposed to say this EXACT phrase: "${expectedLine}"
            
            1. Transcribe what the user said.
            2. Check if the phrase matches exactly (ignore minor punctuation).
            3. Give a match percentage (0-100).

            Return JSON: { "transcript": "string", "containsVerificationLine": boolean, "matchPercentage": number }`;

            const imageParts = [
                {
                    inlineData: {
                        data: videoBase64,
                        mimeType: "video/mp4",
                    },
                },
            ];

            const result = await model.generateContent([prompt, ...imageParts]);
            const responseText = result.response.text();
            const analysisResult = JSON.parse(responseText);

            return res.status(200).json({
                success: true,
                ...analysisResult
            });
        } 
        
        else {
            return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal Server Error' 
        });
    }
}
