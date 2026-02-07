// ============================================
// SCALEVEST GLOBAL ONLINE STORE INTEGRATION (OAuth Edition)
// ============================================
// Deploy to: /api/onlinestore.js
// This single file handles all users, all shops, and all platforms.

export default async function handler(req, res) {
    // Enable CORS for frontend communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { action, platform, storeUrl, apiSecret, productId, quantity, userId, code } = req.body;

        // 1. OAUTH HANDSHAKE ROUTE (The "Magic Login")
        if (action === 'authorize') {
            if (platform === 'shopify') {
                const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                // Redirect user to Shopify to click "Install/Allow"
                const authUrl = `https://${cleanUrl}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_CLIENT_ID}&scope=read_products,write_inventory,read_inventory&redirect_uri=${process.env.REDIRECT_URI}&state=${userId}`;
                return res.status(200).json({ url: authUrl });
            }
        }

        // 2. EXCHANGE CODE FOR TOKEN (After Login)
        if (action === 'exchangeToken') {
            if (platform === 'shopify') {
                const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                const tokenResponse = await fetch(`https://${cleanUrl}/admin/oauth/access_token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: process.env.SHOPIFY_CLIENT_ID,
                        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
                        code
                    })
                });
                const tokenData = await tokenResponse.json();
                return res.status(200).json({ success: true, access_token: tokenData.access_token });
            }
        }

        // 3. CORE LOGIC ROUTING
        switch (action) {
            case 'verify':
                return await verifyConnection(res, platform, storeUrl, apiSecret);
            case 'fetchProducts':
                return await fetchProducts(res, platform, storeUrl, apiSecret);
            case 'updateInventory':
                return await updateInventory(res, platform, storeUrl, apiSecret, productId, quantity);
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('ScaleVest API Error:', error);
        return res.status(500).json({ error: 'System error', details: error.message });
    }
}

// ============================================
// HELPER FUNCTIONS (The Engine)
// ============================================

async function shopifyRequest(storeUrl, endpoint, method, apiSecret, body = null) {
    const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;
    
    const options = {
        method,
        headers: {
            'X-Shopify-Access-Token': apiSecret,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Shopify API Error: ${response.status}`);
    return await response.json();
}

async function verifyConnection(res, platform, storeUrl, apiSecret) {
    try {
        if (platform === 'shopify') {
            const data = await shopifyRequest(storeUrl, 'shop.json', 'GET', apiSecret);
            return res.status(200).json({ success: true, shopName: data.shop.name });
        }
        if (platform === 'wix') {
            // Wix logic here
            return res.status(200).json({ success: true });
        }
    } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
}

async function fetchProducts(res, platform, storeUrl, apiSecret) {
    try {
        if (platform === 'shopify') {
            const data = await shopifyRequest(storeUrl, 'products.json?limit=250', 'GET', apiSecret);
            const products = data.products.map(p => ({
                id: p.id.toString(),
                name: p.title,
                quantity: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
                sku: p.variants[0]?.sku || '',
                inventoryItemId: p.variants[0]?.inventory_item_id
            }));
            return res.status(200).json({ success: true, products });
        }
    } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
}

async function updateInventory(res, platform, storeUrl, apiSecret, productId, quantity) {
    try {
        if (platform === 'shopify') {
            // Get product to find inventory_item_id
            const pData = await shopifyRequest(storeUrl, `products/${productId}.json`, 'GET', apiSecret);
            const invItemId = pData.product.variants[0].inventory_item_id;
            
            // Get first location ID
            const locData = await shopifyRequest(storeUrl, 'locations.json', 'GET', apiSecret);
            const locId = locData.locations[0].id;

            // Set stock level
            await shopifyRequest(storeUrl, 'inventory_levels/set.json', 'POST', apiSecret, {
                location_id: locId,
                inventory_item_id: invItemId,
                available: quantity
            });
            return res.status(200).json({ success: true, message: 'Stock Synced' });
        }
    } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
}
