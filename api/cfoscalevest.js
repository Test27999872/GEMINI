import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, image, messages } = req.body;

    // Initialize the model
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: `You are an elite CFO (Chief Financial Officer) for ScaleVest, an intelligent business management platform. Your role is to:

1. Analyze business financial data with precision
2. Identify profit/loss reasons with clarity
3. Provide actionable, specific recommendations
4. Request shelf photos when product placement might be causing losses
5. Give realistic, implementable advice

RESPONSE RULES:
- Always respond in valid JSON format
- Be direct and specific, not generic
- Use numbers and metrics when possible
- Prioritize actions by impact (HIGH, MEDIUM, LOW)
- If business is in loss and issues seem physical (stock placement, visibility), request a shelf photo

PERSONALITY:
- Professional but approachable
- Data-driven, not emotional
- Solution-focused
- Honest about challenges`
    });

    let result;

    // Handle image analysis (shelf photo)
    if (image) {
      const imageParts = [
        {
          inlineData: {
            data: image,
            mimeType: "image/jpeg"
          }
        }
      ];

      result = await model.generateContent([prompt, ...imageParts]);
      
    } 
    // Handle chat messages
    else if (messages && Array.isArray(messages)) {
      const chat = model.startChat({
        history: messages.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });

      const lastMessage = messages[messages.length - 1];
      result = await chat.sendMessage(lastMessage.content);
    }
    // Handle simple prompt
    else if (prompt) {
      result = await model.generateContent(prompt);
    } 
    else {
      return res.status(400).json({ error: 'No prompt, image, or messages provided' });
    }

    const response = await result.response;
    const text = response.text();

    // Try to parse as JSON, otherwise return as text
    try {
      const jsonResponse = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json(jsonResponse);
    } catch (parseError) {
      // If not JSON, return as plain text
      return res.status(200).json({ 
        text: text,
        raw: true 
      });
    }

  } catch (error) {
    console.error('CFO API Error:', error);
    
    return res.status(500).json({ 
      error: 'CFO analysis failed', 
      details: error.message 
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow larger payloads for images
    },
  },
};
