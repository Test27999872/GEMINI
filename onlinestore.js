// ============================================
// SCALEVEST ONLINE STORE INTEGRATION API
// ============================================
// Deploy this to: /api/onlinestore.js in your Vercel project
// Environment Variables Required: SHOPIFY_KEY, WIX_KEY

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

    try {
        const { action, platform, storeUrl, apiKey, apiSecret, productId, quantity } = req.body;

        // Validate required fields
        if (!action || !platform) {
            return res.status(400).json({ 
                error: 'Missing required fields: action and platform are required' 
            });
        }

        // Route to appropriate handler
        switch (action) {
            case 'verify':
                return await verifyConnection(res, platform, storeUrl, apiKey, apiSecret);
            
            case 'fetchProducts':
                return await fetchProducts(res, platform, storeUrl, apiKey, apiSecret);
            
            case 'updateInventory':
                return await updateInventory(res, platform, storeUrl, apiKey, apiSecret, productId, quantity);
            
            case 'createProduct':
                return await createProduct(res, platform, storeUrl, apiKey, apiSecret, req.body.productData);
            
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error', 
            details: error.message 
        });
    }
}

// ============================================
// SHOPIFY INTEGRATION
// ============================================

async function shopifyRequest(storeUrl, endpoint, method = 'GET', apiKey, apiSecret, body = null) {
    const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;
    
    const options = {
        method: method,
        headers: {
            'X-Shopify-Access-Token': apiSecret || process.env.SHOPIFY_KEY,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
}

async function shopifyVerify(storeUrl, apiKey, apiSecret) {
    try {
        const data = await shopifyRequest(storeUrl, 'shop.json', 'GET', apiKey, apiSecret);
        return {
            success: true,
            shopName: data.shop.name,
            email: data.shop.email,
            domain: data.shop.domain
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function shopifyFetchProducts(storeUrl, apiKey, apiSecret) {
    try {
        const data = await shopifyRequest(storeUrl, 'products.json?limit=250', 'GET', apiKey, apiSecret);
        
        const products = [];
        
        for (const product of data.products) {
            // Get total inventory across all variants
            let totalQuantity = 0;
            let inventoryItemId = null;
            let locationId = null;

            if (product.variants && product.variants.length > 0) {
                for (const variant of product.variants) {
                    totalQuantity += variant.inventory_quantity || 0;
                    if (variant.inventory_item_id && !inventoryItemId) {
                        inventoryItemId = variant.inventory_item_id;
                    }
                }
            }

            products.push({
                id: product.id.toString(),
                name: product.title,
                quantity: totalQuantity,
                unit: 'pcs',
                sku: product.variants[0]?.sku || '',
                price: product.variants[0]?.price || '0.00',
                inventoryItemId: inventoryItemId,
                variants: product.variants.map(v => ({
                    id: v.id,
                    title: v.title,
                    sku: v.sku,
                    quantity: v.inventory_quantity || 0,
                    inventoryItemId: v.inventory_item_id
                }))
            });
        }

        return {
            success: true,
            products: products,
            count: products.length
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function shopifyUpdateInventory(storeUrl, apiKey, apiSecret, productId, newQuantity) {
    try {
        // First, get the product to find inventory details
        const productData = await shopifyRequest(storeUrl, `products/${productId}.json`, 'GET', apiKey, apiSecret);
        
        if (!productData.product || !productData.product.variants || productData.product.variants.length === 0) {
            throw new Error('Product not found or has no variants');
        }

        // Get the first variant's inventory item ID
        const variant = productData.product.variants[0];
        const inventoryItemId = variant.inventory_item_id;

        // Get available locations
        const locationsData = await shopifyRequest(storeUrl, 'locations.json', 'GET', apiKey, apiSecret);
        
        if (!locationsData.locations || locationsData.locations.length === 0) {
            throw new Error('No locations found');
        }

        const locationId = locationsData.locations[0].id;

        // Update inventory level
        const updateData = await shopifyRequest(
            storeUrl, 
            'inventory_levels/set.json',
            'POST',
            apiKey,
            apiSecret,
            {
                location_id: locationId,
                inventory_item_id: inventoryItemId,
                available: newQuantity
            }
        );

        return {
            success: true,
            message: 'Inventory updated successfully',
            newQuantity: newQuantity
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function shopifyCreateProduct(storeUrl, apiKey, apiSecret, productData) {
    try {
        const shopifyProduct = {
            product: {
                title: productData.name,
                body_html: productData.description || '',
                vendor: productData.vendor || 'ScaleVest',
                product_type: productData.category || 'General',
                variants: [
                    {
                        price: productData.price || '0.00',
                        sku: productData.sku || '',
                        inventory_quantity: productData.quantity || 0,
                        inventory_management: 'shopify'
                    }
                ]
            }
        };

        const data = await shopifyRequest(storeUrl, 'products.json', 'POST', apiKey, apiSecret, shopifyProduct);

        return {
            success: true,
            product: {
                id: data.product.id.toString(),
                name: data.product.title
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// WIX INTEGRATION
// ============================================

async function wixRequest(endpoint, method = 'GET', apiKey, body = null) {
    const url = `https://www.wixapis.com/stores/v1/${endpoint}`;
    
    const options = {
        method: method,
        headers: {
            'Authorization': apiKey || process.env.WIX_KEY,
            'Content-Type': 'application/json',
            'wix-site-id': body?.siteId || '' // Wix requires site ID
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Wix API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
}

async function wixVerify(storeUrl, apiKey) {
    try {
        // Extract site ID from URL if present
        const siteIdMatch = storeUrl.match(/site[_-]id[=:]([a-f0-9-]+)/i);
        const siteId = siteIdMatch ? siteIdMatch[1] : null;

        // Try to query products to verify connection
        const data = await wixRequest('products/query', 'POST', apiKey, {
            query: {
                paging: {
                    limit: 1
                }
            },
            siteId: siteId
        });

        return {
            success: true,
            siteId: siteId,
            productsCount: data.totalResults || 0
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function wixFetchProducts(storeUrl, apiKey) {
    try {
        const siteIdMatch = storeUrl.match(/site[_-]id[=:]([a-f0-9-]+)/i);
        const siteId = siteIdMatch ? siteIdMatch[1] : null;

        const data = await wixRequest('products/query', 'POST', apiKey, {
            query: {
                paging: {
                    limit: 100
                }
            },
            siteId: siteId
        });

        const products = data.products.map(product => ({
            id: product.id,
            name: product.name,
            quantity: product.stock?.quantity || 0,
            unit: 'pcs',
            sku: product.sku || '',
            price: product.price?.price || '0.00',
            trackInventory: product.stock?.trackInventory || false
        }));

        return {
            success: true,
            products: products,
            count: products.length
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function wixUpdateInventory(storeUrl, apiKey, productId, newQuantity) {
    try {
        const siteIdMatch = storeUrl.match(/site[_-]id[=:]([a-f0-9-]+)/i);
        const siteId = siteIdMatch ? siteIdMatch[1] : null;

        const data = await wixRequest(`products/${productId}`, 'PATCH', apiKey, {
            product: {
                stock: {
                    trackInventory: true,
                    quantity: newQuantity
                }
            },
            siteId: siteId
        });

        return {
            success: true,
            message: 'Inventory updated successfully',
            newQuantity: newQuantity
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function wixCreateProduct(storeUrl, apiKey, productData) {
    try {
        const siteIdMatch = storeUrl.match(/site[_-]id[=:]([a-f0-9-]+)/i);
        const siteId = siteIdMatch ? siteIdMatch[1] : null;

        const wixProduct = {
            product: {
                name: productData.name,
                description: productData.description || '',
                sku: productData.sku || '',
                price: {
                    price: productData.price || '0.00',
                    currency: 'USD'
                },
                stock: {
                    trackInventory: true,
                    quantity: productData.quantity || 0
                }
            },
            siteId: siteId
        };

        const data = await wixRequest('products', 'POST', apiKey, wixProduct);

        return {
            success: true,
            product: {
                id: data.product.id,
                name: data.product.name
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// ROUTE HANDLERS
// ============================================

async function verifyConnection(res, platform, storeUrl, apiKey, apiSecret) {
    let result;
    
    if (platform === 'shopify') {
        result = await shopifyVerify(storeUrl, apiKey, apiSecret);
    } else if (platform === 'wix') {
        result = await wixVerify(storeUrl, apiKey);
    } else {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    return res.status(result.success ? 200 : 400).json(result);
}

async function fetchProducts(res, platform, storeUrl, apiKey, apiSecret) {
    let result;
    
    if (platform === 'shopify') {
        result = await shopifyFetchProducts(storeUrl, apiKey, apiSecret);
    } else if (platform === 'wix') {
        result = await wixFetchProducts(storeUrl, apiKey);
    } else {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    return res.status(result.success ? 200 : 400).json(result);
}

async function updateInventory(res, platform, storeUrl, apiKey, apiSecret, productId, quantity) {
    if (!productId || quantity === undefined) {
        return res.status(400).json({ error: 'productId and quantity are required' });
    }

    let result;
    
    if (platform === 'shopify') {
        result = await shopifyUpdateInventory(storeUrl, apiKey, apiSecret, productId, quantity);
    } else if (platform === 'wix') {
        result = await wixUpdateInventory(storeUrl, apiKey, productId, quantity);
    } else {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    return res.status(result.success ? 200 : 400).json(result);
}

async function createProduct(res, platform, storeUrl, apiKey, apiSecret, productData) {
    if (!productData || !productData.name) {
        return res.status(400).json({ error: 'Product data with name is required' });
    }

    let result;
    
    if (platform === 'shopify') {
        result = await shopifyCreateProduct(storeUrl, apiKey, apiSecret, productData);
    } else if (platform === 'wix') {
        result = await wixCreateProduct(storeUrl, apiKey, productData);
    } else {
        return res.status(400).json({ error: 'Invalid platform' });
    }

    return res.status(result.success ? 200 : 400).json(result);
}
