// onlinestore.js - OAuth 2.0 Handler for Shopify & Wix Integration
// Deploy this to your GitHub API folder at /api/onlinestore.js

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const WIX_APP_ID = process.env.WIX_APP_ID;
const WIX_APP_SECRET = process.env.WIX_APP_SECRET;
const REDIRECT_URI = 'https://gemini-sigma-plum.vercel.app/api/onlinestore/callback';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, platform, credentials, productData, userId } = req.body || {};
  const { code, state, shop } = req.query || {};

  try {
    // OAuth Callback Handler
    if (req.method === 'GET' && code) {
      if (shop) {
        // Shopify callback
        return await handleShopifyCallback(req, res, code, shop, state);
      } else {
        // Wix callback
        return await handleWixCallback(req, res, code, state);
      }
    }

    // POST endpoints
    if (req.method === 'POST') {
      switch (action) {
        case 'getAuthUrl':
          return getAuthUrl(platform, userId, res);
        
        case 'fetchProducts':
          return await fetchProducts(platform, credentials, res);
        
        case 'syncInventory':
          return await syncInventory(platform, credentials, productData, res);
        
        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Online Store API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ============================================
// OAUTH 2.0 - GET AUTHORIZATION URL
// ============================================

function getAuthUrl(platform, userId, res) {
  if (platform === 'shopify') {
    // Return the Shopify install URL structure
    // User will need to enter their shop name first
    return res.status(200).json({
      success: true,
      authUrlPattern: 'https://{SHOP_NAME}.myshopify.com/admin/oauth/authorize?client_id=' + SHOPIFY_API_KEY + '&scope=read_products,write_products,read_inventory,write_inventory&redirect_uri=' + encodeURIComponent(REDIRECT_URI) + '&state=' + userId
    });
  }

  if (platform === 'wix') {
    const authUrl = `https://www.wix.com/installer/install?appId=${WIX_APP_ID}&redirectUrl=${encodeURIComponent(REDIRECT_URI)}&state=${userId}`;
    
    return res.status(200).json({
      success: true,
      authUrl: authUrl
    });
  }

  return res.status(400).json({ error: 'Unsupported platform' });
}

// ============================================
// SHOPIFY OAUTH CALLBACK
// ============================================

async function handleShopifyCallback(req, res, code, shop, state) {
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

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token');
    }

    // Get shop info
    const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': tokenData.access_token
      }
    });

    const shopData = await shopResponse.json();

    // Return success page with credentials
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shopify Connected!</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white; padding: 50px; border-radius: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
            max-width: 500px;
          }
          h1 { color: #10b981; margin: 0 0 20px 0; font-size: 32px; }
          p { color: #64748b; font-size: 16px; margin-bottom: 30px; }
          .btn {
            background: #10b981; color: white; padding: 15px 40px;
            border: none; border-radius: 12px; font-size: 16px;
            font-weight: 700; cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Shopify Connected!</h1>
          <p>Store: <strong>${shopData.shop.name}</strong></p>
          <p>You can close this window and return to ScaleVest</p>
          <button class="btn" onclick="window.close()">Close Window</button>
        </div>
        <script>
          // Send credentials back to parent window
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
            setTimeout(() => window.close(), 2000);
          }
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Shopify OAuth Error:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1 style="color: red;">❌ Connection Failed</h1>
        <p>${error.message}</p>
        <button onclick="window.close()">Close</button>
      </body>
      </html>
    `);
  }
}

// ============================================
// WIX OAUTH CALLBACK
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

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token');
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Wix Connected!</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; margin: 0;
            background: linear-gradient(135deg, #0c6efd 0%, #0056d2 100%);
          }
          .container {
            background: white; padding: 50px; border-radius: 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
          }
          h1 { color: #0c6efd; margin: 0 0 20px 0; font-size: 32px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Wix Connected!</h1>
          <p>You can close this window and return to ScaleVest</p>
          <button onclick="window.close()" style="background: #0c6efd; color: white; padding: 15px 40px; border: none; border-radius: 12px; font-size: 16px; cursor: pointer;">Close</button>
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
            setTimeout(() => window.close(), 2000);
          }
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('Wix OAuth Error:', error);
    return res.status(500).send(`<h1>Error: ${error.message}</h1>`);
  }
}

// ============================================
// FETCH PRODUCTS FROM STORE
// ============================================

async function fetchProducts(platform, credentials, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    
    try {
      let allProducts = [];
      let nextPageInfo = null;
      
      do {
        const url = nextPageInfo 
          ? `https://${shopUrl}/admin/api/2024-01/products.json?limit=250&page_info=${nextPageInfo}`
          : `https://${shopUrl}/admin/api/2024-01/products.json?limit=250`;
        
        const response = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch Shopify products');
        }

        const data = await response.json();
        
        // Transform Shopify products to ScaleVest format
        const products = data.products.map(product => {
          const variant = product.variants[0];
          
          return {
            externalId: product.id.toString(),
            variantId: variant.id.toString(),
            inventoryItemId: variant.inventory_item_id.toString(),
            name: product.title,
            quantity: variant.inventory_quantity || 0,
            unit: 'pcs',
            price: parseFloat(variant.price) || 0,
            sku: variant.sku || '',
            barcode: variant.barcode || null,
            image: product.image ? product.image.src : null
          };
        });

        allProducts = [...allProducts, ...products];
        
        const linkHeader = response.headers.get('Link');
        nextPageInfo = extractNextPageInfo(linkHeader);
        
      } while (nextPageInfo);

      return res.status(200).json({
        success: true,
        products: allProducts,
        count: allProducts.length
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch Shopify products: ' + error.message });
    }
  }

  if (platform === 'wix') {
    const { accessToken } = credentials;
    
    try {
      const response = await fetch(`https://www.wixapis.com/stores/v1/products/query`, {
        method: 'POST',
        headers: {
          'Authorization': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: { limit: 100 }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Wix products');
      }

      const data = await response.json();
      
      const products = data.products.map(product => ({
        externalId: product.id,
        name: product.name,
        quantity: product.stock?.quantity || 0,
        unit: 'pcs',
        price: product.price?.price || 0,
        sku: product.sku || '',
        barcode: null,
        image: product.media?.mainMedia?.image?.url || null
      }));

      return res.status(200).json({
        success: true,
        products: products,
        count: products.length
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch Wix products: ' + error.message });
    }
  }

  return res.status(400).json({ error: 'Unsupported platform' });
}

// ============================================
// SYNC INVENTORY TO STORE
// ============================================

async function syncInventory(platform, credentials, productData, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    const { inventoryItemId, newQuantity } = productData;
    
    try {
      // Get default location ID
      const locationId = await getDefaultLocationId(shopUrl, accessToken);
      
      // Update inventory level
      const response = await fetch(`https://${shopUrl}/admin/api/2024-01/inventory_levels/set.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available: newQuantity
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update Shopify inventory');
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        message: 'Inventory synced to Shopify',
        newQuantity: data.inventory_level?.available
      });
    } catch (error) {
      return res.status(500).json({ error: 'Shopify sync failed: ' + error.message });
    }
  }

  if (platform === 'wix') {
    const { accessToken } = credentials;
    const { productId, newQuantity } = productData;
    
    try {
      const response = await fetch(`https://www.wixapis.com/stores/v1/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product: {
            stock: {
              trackQuantity: true,
              quantity: newQuantity
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update Wix inventory');
      }

      return res.status(200).json({
        success: true,
        message: 'Inventory synced to Wix'
      });
    } catch (error) {
      return res.status(500).json({ error: 'Wix sync failed: ' + error.message });
    }
  }

  return res.status(400).json({ error: 'Unsupported platform' });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getDefaultLocationId(shopUrl, accessToken) {
  const response = await fetch(`https://${shopUrl}/admin/api/2024-01/locations.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken
    }
  });
  
  const data = await response.json();
  return data.locations[0]?.id;
}

function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  
  const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
  if (!nextLink) return null;
  
  const match = nextLink.match(/page_info=([^&>]+)/);
  return match ? match[1] : null;
}

// ============================================
// SHOPIFY INTEGRATION
// ============================================

async function authenticateStore(platform, credentials, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    
    try {
      // Test connection by fetching shop info
      const response = await fetch(`https://${shopUrl}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Invalid Shopify credentials');
      }

      const data = await response.json();
      
      return res.status(200).json({
        success: true,
        platform: 'shopify',
        shopName: data.shop.name,
        email: data.shop.email,
        currency: data.shop.currency
      });
    } catch (error) {
      return res.status(401).json({ error: 'Shopify authentication failed: ' + error.message });
    }
  }

  if (platform === 'wix') {
    const { siteId, apiKey } = credentials;
    
    try {
      // Test connection with Wix Stores API
      const response = await fetch(`https://www.wixapis.com/stores/v1/products/query`, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'wix-site-id': siteId
        },
        body: JSON.stringify({ query: { limit: 1 } })
      });

      if (!response.ok) {
        throw new Error('Invalid Wix credentials');
      }

      return res.status(200).json({
        success: true,
        platform: 'wix',
        siteId: siteId
      });
    } catch (error) {
      return res.status(401).json({ error: 'Wix authentication failed: ' + error.message });
    }
  }

  return res.status(400).json({ error: 'Unsupported platform' });
}

async function fetchProducts(platform, credentials, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    
    try {
      let allProducts = [];
      let nextPageInfo = null;
      
      do {
        const url = nextPageInfo 
          ? `https://${shopUrl}/admin/api/2024-01/products.json?limit=250&page_info=${nextPageInfo}`
          : `https://${shopUrl}/admin/api/2024-01/products.json?limit=250`;
        
        const response = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch Shopify products');
        }

        const data = await response.json();
        
        // Transform Shopify products to ScaleVest format
        const products = data.products.map(product => {
          // Get first variant for quantity
          const variant = product.variants[0];
          
          return {
            externalId: product.id.toString(),
            variantId: variant.id.toString(),
            name: product.title,
            quantity: variant.inventory_quantity || 0,
            unit: 'pcs',
            price: parseFloat(variant.price) || 0,
            sku: variant.sku || '',
            barcode: variant.barcode || null,
            image: product.image ? product.image.src : null
          };
        });

        allProducts = [...allProducts, ...products];
        
        // Check for pagination
        const linkHeader = response.headers.get('Link');
        nextPageInfo = extractNextPageInfo(linkHeader);
        
      } while (nextPageInfo);

      return res.status(200).json({
        success: true,
        products: allProducts,
        count: allProducts.length
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch Shopify products: ' + error.message });
    }
  }

  if (platform === 'wix') {
    const { siteId, apiKey } = credentials;
    
    try {
      const response = await fetch(`https://www.wixapis.com/stores/v1/products/query`, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'wix-site-id': siteId
        },
        body: JSON.stringify({
          query: { limit: 100 }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Wix products');
      }

      const data = await response.json();
      
      // Transform Wix products to ScaleVest format
      const products = data.products.map(product => ({
        externalId: product.id,
        name: product.name,
        quantity: product.stock?.quantity || 0,
        unit: 'pcs',
        price: product.price?.price || 0,
        sku: product.sku || '',
        barcode: null,
        image: product.media?.mainMedia?.image?.url || null
      }));

      return res.status(200).json({
        success: true,
        products: products,
        count: products.length
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch Wix products: ' + error.message });
    }
  }

  return res.status(400).json({ error: 'Unsupported platform' });
}

async function syncInventory(platform, credentials, productData, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    const { variantId, newQuantity, locationId } = productData;
    
    try {
      // Update inventory level
      const response = await fetch(`https://${shopUrl}/admin/api/2024-01/inventory_levels/set.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          location_id: locationId || await getDefaultLocationId(shopUrl, accessToken),
          inventory_item_id: await getInventoryItemId(shopUrl, accessToken, variantId),
          available: newQuantity
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update Shopify inventory');
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        message: 'Inventory synced to Shopify',
        newQuantity: data.inventory_level?.available
      });
    } catch (error) {
      return res.status(500).json({ error: 'Shopify sync failed: ' + error.message });
    }
  }

  if (platform === 'wix') {
    const { siteId, apiKey } = credentials;
    const { productId, newQuantity } = productData;
    
    try {
      const response = await fetch(`https://www.wixapis.com/stores/v1/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'wix-site-id': siteId
        },
        body: JSON.stringify({
          product: {
            stock: {
              trackQuantity: true,
              quantity: newQuantity
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update Wix inventory');
      }

      return res.status(200).json({
        success: true,
        message: 'Inventory synced to Wix'
      });
    } catch (error) {
      return res.status(500).json({ error: 'Wix sync failed: ' + error.message });
    }
  }

  return res.status(400).json({ error: 'Unsupported platform' });
}

// Helper function to get Shopify location ID
async function getDefaultLocationId(shopUrl, accessToken) {
  const response = await fetch(`https://${shopUrl}/admin/api/2024-01/locations.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken
    }
  });
  
  const data = await response.json();
  return data.locations[0]?.id;
}

// Helper function to get inventory item ID from variant ID
async function getInventoryItemId(shopUrl, accessToken, variantId) {
  const response = await fetch(`https://${shopUrl}/admin/api/2024-01/variants/${variantId}.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken
    }
  });
  
  const data = await response.json();
  return data.variant?.inventory_item_id;
}

// Extract next page info from Link header (Shopify pagination)
function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  
  const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
  if (!nextLink) return null;
  
  const match = nextLink.match(/page_info=([^&>]+)/);
  return match ? match[1] : null;
}

// Handle incoming webhooks from Shopify/Wix
async function handleWebhook(platform, webhookData, res) {
  // Webhook verification would go here
  // For now, just acknowledge receipt
  
  return res.status(200).json({
    success: true,
    message: 'Webhook received'
  });
}
