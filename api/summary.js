import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

export default async function handler(req, res) {
    // --- CORS HEADERS START ---
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Matches your origin from the error log
    res.setHeader('Access-Control-Allow-Origin', 'https://upscalevest.site'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle the Preflight request (The browser's "handshake")
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    // --- CORS HEADERS END ---

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { action, data } = req.body;

        if (action === 'summarizeApplication') {
            const { application, vest } = data;

            // Ensure the model is correctly initialized
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const prompt = `
You are an AI assistant helping an angel investor analyze a startup funding application.

APPLICATION DETAILS:
- Application Name: ${application.appName || 'N/A'}
- Founder: ${application.founderName || 'N/A'}
- Startup Name: ${application.startupName || 'N/A'}
- Funding Goal: ${application.fundingGoal || 'N/A'}
- Message: ${application.message || 'N/A'}
- Category: ${application.category || 'N/A'}

${vest ? `
VEST DETAILS:
- Vest Name: ${vest.vestName || 'N/A'}
- Category: ${vest.category || 'N/A'}
- Overview: ${vest.overview || 'N/A'}
- Main Vest Info: ${JSON.stringify(vest.mainVest || {})}
- Audit Details: ${JSON.stringify(vest.audit || {})}
- Startup Details: ${JSON.stringify(vest.startupDetails || {})}
- Roadmap: ${JSON.stringify(vest.roadmap || {})}
- Founder Presence: ${JSON.stringify(vest.founderPresence || {})}
` : 'No vest data provided.'}

Please provide a comprehensive summary including:
1. **Application Overview**: Brief summary of what the founder is requesting
2. **Category Analysis**: What category/sector is this in and market potential
3. **Vest Analysis** (if available): Key highlights from their vest document
4. **Audit & Compliance**: Any audit details or compliance information
5. **Startup Details**: Team, traction, business model insights
6. **Roadmap**: Key milestones and timeline
7. **Founder Presence**: Founder's background and credibility
8. **Investment Recommendation**: Your assessment and key considerations

Format the response in a clear, organized manner with proper sections.
`;

            const result = await model.generateContent(prompt);
            const summary = result.response.text();

            return res.status(200).json({
                success: true,
                summary: summary
            });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate summary'
        });
    }
}
