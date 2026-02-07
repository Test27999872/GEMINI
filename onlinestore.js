// api/onlinestore.js - SIMPLIFIED VERSION WITH CORS FIX
// This version handles CORS more reliably

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const WIX_APP_ID = process.env.WIX_APP_ID;
const WIX_APP_SECRET = process.env.WIX_APP_SECRET;
const REDIRECT_URI = 'https://gemini-sigma-plum.vercel.app/api/callback';

// Helper function to set CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

export default async function handler(req, res) {
  // Set CORS headers for all requests
  setCorsHeaders(res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Handle POST requests
    if (req.method === 'POST') {
      const { action, platform, credentials, productData, userId } = req.body;

      switch (action) {
        case 'getAuthUrl':
          return handleGetAuthUrl(platform, userId, res);
        
        case 'fetchProducts':
          return await handleFetchProducts(platform, credentials, res);
        
        case 'syncInventory':
          return await handleSyncInventory(platform, credentials, productData, res);
        
        default:
          return res.status(400).json({ success: false, error: 'Invalid action' });
      }
    }

    // Handle GET requests (OAuth callbacks will be handled separately)
    return res.status(405).json({ success: false, error: 'Method not allowed' });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================
// GET AUTH URL
// ============================================

function handleGetAuthUrl(platform, userId, res) {
  if (platform === 'shopify') {
    // Return pattern for client to construct URL
    const scopes = 'read_products,write_products,read_inventory,write_inventory,read_locations';
    const authUrlPattern = `https://{SHOP_NAME}.myshopify.com/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${userId}`;
    
    return res.status(200).json({
      success: true,
      authUrlPattern: authUrlPattern
    });
  }

  if (platform === 'wix') {
    const authUrl = `https://www.wix.com/installer/install?appId=${WIX_APP_ID}&redirectUrl=${encodeURIComponent(REDIRECT_URI)}&state=${userId}`;
    
    return res.status(200).json({
      success: true,
      authUrl: authUrl
    });
  }

  return res.status(400).json({ success: false, error: 'Unsupported platform' });
}

// ============================================
// FETCH PRODUCTS
// ============================================

async function handleFetchProducts(platform, credentials, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    
    try {
      let allProducts = [];
      let hasNextPage = true;
      let pageInfo = null;
      
      while (hasNextPage && allProducts.length < 1000) {
        const url = pageInfo 
          ? `https://${shopUrl}/admin/api/2024-01/products.json?limit=250&page_info=${pageInfo}`
          : `https://${shopUrl}/admin/api/2024-01/products.json?limit=250`;
        
        const response = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
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
            image: product.image?.src || null
          };
        });

        allProducts = [...allProducts, ...products];
        
        // Check for next page
        const linkHeader = response.headers.get('Link');
        if (linkHeader) {
          const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
          if (nextLink) {
            const match = nextLink.match(/page_info=([^&>]+)/);
            pageInfo = match ? match[1] : null;
            hasNextPage = !!pageInfo;
          } else {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      return res.status(200).json({
        success: true,
        products: allProducts,
        count: allProducts.length
      });
    } catch (error) {
      console.error('Shopify fetch error:', error);
      return res.status(500).json({ success: false, error: error.message });
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
        const errorText = await response.text();
        throw new Error(`Wix API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const products = (data.products || []).map(product => ({
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
      console.error('Wix fetch error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(400).json({ success: false, error: 'Unsupported platform' });
}

// ============================================
// SYNC INVENTORY
// ============================================

async function handleSyncInventory(platform, credentials, productData, res) {
  if (platform === 'shopify') {
    const { shopUrl, accessToken } = credentials;
    const { inventoryItemId, newQuantity } = productData;
    
    try {
      // Get default location
      const locResponse = await fetch(`https://${shopUrl}/admin/api/2024-01/locations.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      
      if (!locResponse.ok) {
        throw new Error('Failed to get Shopify location');
      }
      
      const locData = await locResponse.json();
      const locationId = locData.locations[0]?.id;
      
      if (!locationId) {
        throw new Error('No Shopify location found');
      }
      
      // Update inventory
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
        const errorText = await response.text();
        throw new Error(`Shopify sync error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        message: 'Synced to Shopify',
        newQuantity: data.inventory_level?.available
      });
    } catch (error) {
      console.error('Shopify sync error:', error);
      return res.status(500).json({ success: false, error: error.message });
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
        const errorText = await response.text();
        throw new Error(`Wix sync error: ${response.status} - ${errorText}`);
      }

      return res.status(200).json({
        success: true,
        message: 'Synced to Wix'
      });
    } catch (error) {
      console.error('Wix sync error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(400).json({ success: false, error: 'Unsupported platform' });
}
