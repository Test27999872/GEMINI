

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, platform, credentials, productData, webhookData } = req.body;

  try {
    switch (action) {
      case 'authenticate':
        return await authenticateStore(platform, credentials, res);
      
      case 'fetchProducts':
        return await fetchProducts(platform, credentials, res);
      
      case 'syncInventory':
        return await syncInventory(platform, credentials, productData, res);
      
      case 'webhook':
        return await handleWebhook(platform, webhookData, res);
      
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Online Store API Error:', error);
    return res.status(500).json({ error: error.message });
  }
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
