// api/callback.js - OAuth Callback Handler
// This handles the OAuth redirects from Shopify and Wix

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const WIX_APP_ID = process.env.WIX_APP_ID;
const WIX_APP_SECRET = process.env.WIX_APP_SECRET;

export default async function handler(req, res) {
  const { code, state, shop, hmac } = req.query;

  try {
    // Shopify callback (has 'shop' parameter)
    if (shop) {
      return await handleShopifyCallback(req, res, code, shop, state, hmac);
    }
    
    // Wix callback (no 'shop' parameter)
    if (code && state) {
      return await handleWixCallback(req, res, code, state);
    }
    
    // Invalid callback
    return res.status(400).send('<h1>Invalid OAuth callback</h1>');
    
  } catch (error) {
    console.error('Callback error:', error);
    return res.status(500).send(`<h1>Error: ${error.message}</h1>`);
  }
}

// ============================================
// SHOPIFY CALLBACK
// ============================================

async function handleShopifyCallback(req, res, code, shop, state, hmac) {
  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('No access token received');
    }

    // Get shop info
    const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': tokenData.access_token
      }
    });

    if (!shopResponse.ok) {
      throw new Error('Failed to fetch shop info');
    }

    const shopData = await shopResponse.json();

    // Success page with auto-close
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connected to Shopify!</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #96bf48 0%, #5f9025 100%);
            animation: fadeIn 0.5s ease;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .container {
            background: white; 
            padding: 60px 50px; 
            border-radius: 30px;
            box-shadow: 0 25px 70px rgba(0,0,0,0.3); 
            text-align: center;
            max-width: 500px;
            animation: slideUp 0.5s ease;
          }
          @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .checkmark {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #10b981;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 1s ease infinite;
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          .checkmark svg {
            width: 50px;
            height: 50px;
            stroke: white;
            stroke-width: 3;
          }
          h1 { 
            color: #10b981; 
            margin: 0 0 15px 0; 
            font-size: 32px;
            font-weight: 800;
          }
          .store-name {
            font-size: 20px;
            color: #1e293b;
            font-weight: 600;
            margin-bottom: 20px;
          }
          .message {
            color: #64748b;
            font-size: 15px;
            margin-bottom: 30px;
            line-height: 1.6;
          }
          .countdown {
            font-size: 13px;
            color: #94a3b8;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">
            <svg viewBox="0 0 24 24" fill="none">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1>✅ Successfully Connected!</h1>
          <div class="store-name">${shopData.shop.name}</div>
          <div class="message">
            Your Shopify store is now connected to ScaleVest.<br>
            This window will close automatically.
          </div>
          <div class="countdown">Closing in <span id="timer">2</span> seconds...</div>
        </div>
        <script>
          // Send credentials to parent window
          if (window.opener) {
            window.opener.postMessage({
              platform: 'shopify',
              credentials: {
                shopUrl: '${shop}',
                accessToken: '${tokenData.access_token}'
              },
              shopName: '${shopData.shop.name}',
              userId: '${state}'
            }, '*');
          }
          
          // Countdown and close
          let seconds = 2;
          const timer = setInterval(() => {
            seconds--;
            document.getElementById('timer').textContent = seconds;
            if (seconds <= 0) {
              clearInterval(timer);
              window.close();
            }
          }, 1000);
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Shopify callback error:', error);
    
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Failed</title>
        <style>
          body { 
            font-family: Arial; 
            text-align: center; 
            padding: 50px;
            background: #fef2f2;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          h1 { color: #ef4444; margin-bottom: 20px; }
          p { color: #64748b; margin-bottom: 30px; }
          button {
            background: #ef4444;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Connection Failed</h1>
          <p>${error.message}</p>
          <button onclick="window.close()">Close Window</button>
        </div>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(errorHtml);
  }
}

// ============================================
// WIX CALLBACK
// ============================================

async function handleWixCallback(req, res, code, state) {
  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://www.wix.com/oauth/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        client_id: WIX_APP_ID,
        client_secret: WIX_APP_SECRET,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('No access token received');
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connected to Wix!</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #0c6efd 0%, #0056d2 100%);
            animation: fadeIn 0.5s ease;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .container {
            background: white; 
            padding: 60px 50px; 
            border-radius: 30px;
            box-shadow: 0 25px 70px rgba(0,0,0,0.3); 
            text-align: center;
            animation: slideUp 0.5s ease;
          }
          @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .checkmark {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #0c6efd;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 1s ease infinite;
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          .checkmark svg {
            width: 50px;
            height: 50px;
            stroke: white;
            stroke-width: 3;
          }
          h1 { color: #0c6efd; margin: 0 0 20px 0; font-size: 32px; }
          p { color: #64748b; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">
            <svg viewBox="0 0 24 24" fill="none">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1>✅ Wix Connected!</h1>
          <p>This window will close automatically...</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              platform: 'wix',
              credentials: {
                accessToken: '${tokenData.access_token}',
                refreshToken: '${tokenData.refresh_token || ''}'
              },
              instanceId: '${tokenData.instance_id || ''}',
              userId: '${state}'
            }, '*');
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Wix callback error:', error);
    return res.status(500).send(`<h1>Error: ${error.message}</h1>`);
  }
}
