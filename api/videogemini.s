

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { action, data } = req.body;
    const GEMINI_KEY = process.env.GEMINI_KEY;
    
    if (!GEMINI_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }
    
    try {
        if (action === 'generateLine') {
            // Generate unique verification line using Gemini
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: `Generate a unique, random verification phrase using this format: "ScaleVest Verification [Word1] [Word2] [Word3] [Word4] Code [4-digit-number]"

Choose random words from these categories:
- Word1: Alpha, Beta, Gamma, Delta, Sigma, Omega, Zeta, Theta, Lambda, Kappa
- Word2: Venture, Capital, Founder, Scale, Growth, Launch, Vision, Impact, Pioneer, Innovation
- Word3: Phoenix, Titan, Nova, Apex, Summit, Zenith, Prime, Elite, Vertex, Eclipse
- Word4: Protocol, Matrix, Vector, Quantum, Nexus, Cipher, Echo, Pulse, Spectrum, Vortex

Generate a completely random combination that has never been used before. Return ONLY the verification phrase, nothing else.`
                            }]
                        }]
                    })
                }
            );
            
            const result = await response.json();
            
            if (!result.candidates || !result.candidates[0]) {
                throw new Error('Failed to generate verification line');
            }
            
            const verificationLine = result.candidates[0].content.parts[0].text.trim();
            
            return res.status(200).json({ 
                success: true, 
                verificationLine 
            });
            
        } else if (action === 'verifyVideo') {
            // Verify video speech using Gemini Vision
            const { videoBase64, expectedLine } = data;
            
            if (!videoBase64 || !expectedLine) {
                return res.status(400).json({ error: 'Missing required data' });
            }
            
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                {
                                    inline_data: {
                                        mime_type: "video/mp4",
                                        data: videoBase64
                                    }
                                },
                                {
                                    text: `Analyze this video and transcribe ALL spoken words. 

CRITICAL TASK: Check if the speaker says this EXACT verification phrase: "${expectedLine}"

Return a JSON response with this exact format:
{
  "transcript": "full transcription of everything spoken",
  "containsVerificationLine": true/false,
  "matchPercentage": 0-100
}

The verification line must be spoken word-for-word. Calculate the match percentage based on how many words from the verification line appear in the correct order.`
                                }
                            ]
                        }]
                    })
                }
            );
            
            const result = await response.json();
            
            if (!result.candidates || !result.candidates[0]) {
                throw new Error('Failed to analyze video');
            }
            
            const responseText = result.candidates[0].content.parts[0].text.trim();
            
            // Parse JSON response
            let analysisResult;
            try {
                // Remove markdown code blocks if present
                const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
                analysisResult = JSON.parse(cleanedText);
            } catch (e) {
                // Fallback parsing if JSON is not properly formatted
                const containsLine = responseText.toLowerCase().includes('true');
                analysisResult = {
                    transcript: responseText,
                    containsVerificationLine: containsLine,
                    matchPercentage: containsLine ? 100 : 0
                };
            }
            
            return res.status(200).json({
                success: true,
                ...analysisResult
            });
            
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
        
    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ 
            error: 'API request failed', 
            details: error.message 
        });
    }
}
