import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

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
    const { prompt, image, images, messages, language } = req.body;

    // Initialize the model with GOD-LEVEL system instruction
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp", // Using experimental for better performance
      systemInstruction: `You are THE BUSINESS KING - an omniscient, god-level CFO and business strategist with supernatural analytical abilities. You possess:

🏆 CORE POWERS:
1. X-RAY VISION into business problems - you see what others miss
2. PROPHET-LEVEL foresight - predict outcomes with scary accuracy
3. SURGICAL PRECISION - cut through complexity, give exact solutions
4. WEALTH MULTIPLICATION - turn struggling businesses into profit machines
5. BRUTAL HONESTY - tell hard truths, no sugarcoating

📊 YOUR EXPERTISE:
- Financial forensics (find hidden profit leaks)
- Inventory optimization (visual + data analysis)
- Pricing psychology (maximize revenue per customer)
- Customer behavior prediction
- Risk assessment and mitigation
- Market positioning strategies
- Operational efficiency hacks

🎯 RESPONSE PROTOCOL:
1. USE SIMPLE LANGUAGE - explain like talking to a friend who doesn't know business terms
2. BE SPECIFIC WITH NUMBERS - "increase price by ₹10" not "optimize pricing"
3. PRIORITIZE BY IMPACT - what makes money FASTEST comes first
4. GIVE STEP-BY-STEP ACTIONS - numbered, easy to follow
5. PREDICT OUTCOMES - "This will add ₹5,000/month within 2 weeks"
6. IDENTIFY ROOT CAUSES - don't just treat symptoms

🌍 MULTILINGUAL CAPABILITY:
- Respond in simple ${language === 'hi' ? 'Hindi (हिंदी)' : 'English'}
- Avoid complex business jargon
- Use everyday words that anyone can understand
- When in Hindi, use Devanagari script properly

📸 VISUAL ANALYSIS SUPERPOWERS (When analyzing shelf/shop images):
1. Identify EVERY profit-killing mistake instantly
2. Spot hidden opportunities normal people miss
3. Compare to successful businesses mentally
4. Calculate potential revenue increase from changes
5. Detect customer psychology triggers (or lack thereof)
6. Analyze lighting, placement, cleanliness, organization
7. Give EXACT repositioning instructions

💰 PROFITABILITY RULES:
- If losing money: STOP THE BLEEDING first (cut wasteful costs immediately)
- If breaking even: FIND QUICK WINS (small changes = big impact)
- If profitable: SCALE UP (10x thinking, not 10% thinking)

🚨 RESPONSE FORMAT:
Always respond in VALID JSON (no markdown, no code blocks):
{
  "status": "profitable/breaking-even/losing-money/critical",
  "simpleExplanation": "1-2 sentences anyone can understand",
  "biggestProblem": "The ONE thing killing profits most",
  "hiddenOpportunity": "The thing they're missing that could 2x revenue",
  "immediateActions": [
    {
      "number": 1,
      "action": "Exact step in simple words",
      "reason": "Why this works",
      "moneyImpact": "₹X more per day/week/month",
      "timeToImplement": "X hours/days",
      "difficulty": "easy/medium/hard"
    }
  ],
  "warnings": ["What will go wrong if they don't act"],
  "encouragement": "Motivational message",
  "nextSteps": "What to do after these actions"
}

🎨 FOR VISUAL ANALYSIS (Multiple Shelves):
{
  "overallScore": "X/10",
  "totalPotentialIncrease": "₹X per month if all fixed",
  "criticalIssues": ["Urgent problems losing money NOW"],
  "shelfAnalysis": [
    {
      "shelfNumber": 1,
      "score": "X/10",
      "moneyLost": "₹X per day from this shelf",
      "biggestMistake": "The worst thing about this shelf",
      "quickFix": "Easiest change with biggest impact",
      "detailedIssues": ["Issue 1", "Issue 2"],
      "recommendations": [
        {
          "change": "What to do",
          "where": "Exactly where",
          "why": "Psychology behind it",
          "moneyGain": "₹X more per week"
        }
      ]
    }
  ],
  "compareToCompetitors": "How this compares to successful shops",
  "psychologyTricks": ["Customer psychology tactics to add"],
  "priorityActions": "Do these 3 things TODAY"
}

PERSONALITY TRAITS:
- Confident bordering on cocky (but accurate)
- Impatient with excuses
- Obsessed with results
- Speaks in money, not theories
- Uses analogies anyone understands
- Sometimes uses tough love
- Always ends with hope and action

FORBIDDEN PHRASES:
❌ "Consider" → ✅ "DO THIS:"
❌ "You might want to" → ✅ "You MUST"
❌ "Optimize" → ✅ "Change X to Y"
❌ "Leverage" → ✅ "Use"
❌ "Stakeholders" → ✅ "People"

Remember: You're not just an advisor. You're THE BUSINESS KING. Act like it.`
    });

    let result;
    
    // Handle MULTIPLE IMAGES analysis (shelf photos, shop layout, etc.)
    if (images && Array.isArray(images) && images.length > 0) {
      console.log(`🖼️ Analyzing ${images.length} images...`);
      
      const imageParts = images.map((imgData, index) => ({
        inlineData: {
          data: imgData,
          mimeType: "image/jpeg"
        }
      }));

      // Enhanced prompt for multiple images
      const multiImagePrompt = `${prompt}

ANALYZING ${images.length} IMAGES - Each represents a different shelf/area.

Give me:
1. Individual analysis for EACH image (numbered)
2. Overall business assessment
3. Which shelf/area is WORST (losing most money)
4. Which shelf/area is BEST (example for others)
5. PRIORITY LIST - what to fix first for maximum profit

Remember: Use ${language === 'hi' ? 'simple Hindi (सरल हिंदी)' : 'simple English'} that anyone can understand.`;

      result = await model.generateContent([multiImagePrompt, ...imageParts]);
      
    } 
    // Handle SINGLE IMAGE analysis
    else if (image) {
      console.log('🖼️ Analyzing single image...');
      
      const imageParts = [
        {
          inlineData: {
            data: image,
            mimeType: "image/jpeg"
          }
        }
      ];

      const singleImagePrompt = `${prompt}

Analyze this shelf/shop image like a hawk. Miss NOTHING.
Use ${language === 'hi' ? 'simple Hindi (सरल हिंदी)' : 'simple English'}.`;

      result = await model.generateContent([singleImagePrompt, ...imageParts]);
      
    } 
    // Handle CHAT CONVERSATION
    else if (messages && Array.isArray(messages)) {
      console.log('💬 Handling chat conversation...');
      
      const chat = model.startChat({
        history: messages.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        generationConfig: {
          temperature: 0.8, // Slightly higher for creative problem-solving
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096, // Increased for detailed analysis
        }
      });

      const lastMessage = messages[messages.length - 1];
      result = await chat.sendMessage(lastMessage.content);
    }
    // Handle SIMPLE BUSINESS ANALYSIS (prompt only)
    else if (prompt) {
      console.log('📊 Analyzing business data...');
      
      const enhancedPrompt = `${prompt}

Language: ${language === 'hi' ? 'Hindi (हिंदी में जवाब दें)' : 'English'}
Mode: GOD-LEVEL ANALYSIS - Be brutally honest and specific.`;

      result = await model.generateContent(enhancedPrompt);
    } 
    else {
      return res.status(400).json({ 
        error: 'No prompt, image, images, or messages provided',
        hint: 'Send either: prompt (text), image (base64), images (array of base64), or messages (chat history)'
      });
    }

    // Extract response
    const response = await result.response;
    const text = response.text();

    console.log('✅ Analysis complete');

    // Try to parse as JSON
    try {
      // Clean up markdown code blocks if present
      const cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonResponse = JSON.parse(cleanedText);
      
      // Add metadata
      jsonResponse._metadata = {
        timestamp: new Date().toISOString(),
        model: "gemini-2.0-flash-exp",
        language: language || 'en',
        analysisType: images ? 'multi-image' : image ? 'single-image' : messages ? 'chat' : 'business-data',
        imageCount: images ? images.length : image ? 1 : 0
      };

      return res.status(200).json(jsonResponse);
      
    } catch (parseError) {
      console.warn('⚠️ Response not in JSON format, returning as text');
      
      // If not JSON, return as text with metadata
      return res.status(200).json({ 
        text: text,
        raw: true,
        _metadata: {
          timestamp: new Date().toISOString(),
          model: "gemini-2.0-flash-exp",
          language: language || 'en',
          parseError: parseError.message
        }
      });
    }

  } catch (error) {
    console.error('❌ BUSINESS KING API Error:', error);
    
    // Enhanced error response
    return res.status(500).json({ 
      error: 'Business analysis failed', 
      details: error.message,
      hint: error.message.includes('quota') ? 
        'API quota exceeded. Please try again later.' :
        error.message.includes('image') ?
        'Image processing failed. Ensure images are valid base64 JPEG/PNG.' :
        'Unknown error. Check your request format.',
      timestamp: new Date().toISOString()
    });
  }
}

// Configuration for large payloads (multiple images)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Increased to 50MB for multiple high-res images
    },
    responseLimit: '50mb', // Increased response limit
  },
  maxDuration: 60, // 60 seconds timeout for complex analysis
};
