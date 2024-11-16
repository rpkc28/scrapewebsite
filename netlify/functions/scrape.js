const axios = require('axios');
const cheerio = require('cheerio');

// Enhanced User Agents list
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59'
];

// Enhanced social media patterns with common variations
const SOCIAL_PATTERNS = {
    instagram: {
        pattern: /(?:instagram\.com|instagr\.am|ig\.me)\/([^/?#]+)/i,
        normalize: (url) => {
            const match = url.match(/(?:instagram\.com|instagr\.am|ig\.me)\/([^/?#]+)/i);
            return match ? `https://instagram.com/${match[1]}` : url;
        }
    },
    facebook: {
        pattern: /(?:facebook\.com|fb\.me|fb\.com)\/(?:(?:\w)*#!\/)?(?:pages\/)?(?:[?\w\-]*\/)?(?:\/)?(?:profile.php\?id=(?=\d.*))?([\w\-]*)?/i,
        normalize: (url) => {
            const match = url.match(/(?:facebook\.com|fb\.me|fb\.com)\/((?:profile\.php\?id=\d+|[^/?#]+))/i);
            return match ? `https://facebook.com/${match[1]}` : url;
        }
    },
    linkedin: {
        pattern: /(?:linkedin\.com|lnkd\.in)\/(?:company\/|in\/|profile\/view\?id=)?([^/?#]+)/i,
        normalize: (url) => {
            const match = url.match(/(?:linkedin\.com|lnkd\.in)\/(?:company\/|in\/|profile\/view\?id=)?([^/?#]+)/i);
            return match ? `https://linkedin.com/in/${match[1]}` : url;
        }
    },
    youtube: {
        pattern: /(?:youtube\.com|youtu\.be)\/(?:channel\/|user\/|c\/)?([^/?#]+)/i,
        normalize: (url) => {
            const match = url.match(/(?:youtube\.com|youtu\.be)\/(?:channel\/|user\/|c\/)?([^/?#]+)/i);
            return match ? `https://youtube.com/${match[1]}` : url;
        }
    },
    twitter: {
        pattern: /(?:twitter\.com|x\.com)\/([^/?#]+)/i,
        normalize: (url) => {
            const match = url.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/i);
            return match ? `https://twitter.com/${match[1]}` : url;
        }
    },
    tiktok: {
        pattern: /(?:tiktok\.com|vm\.tiktok\.com)\/(@[^/?#]+|[^/?#]+)/i,
        normalize: (url) => {
            const match = url.match(/(?:tiktok\.com|vm\.tiktok\.com)\/(@[^/?#]+|[^/?#]+)/i);
            return match ? `https://tiktok.com/${match[1]}` : url;
        }
    },
    whatsapp: {
        pattern: /(?:api\.whatsapp\.com|wa\.me)\/(?:send\/)?(?:\d+)/i,
        normalize: (url) => {
            const match = url.match(/(?:\d+)/i);
            return match ? `https://wa.me/${match[0]}` : url;
        }
    }
};

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function retryRequest(url, options, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios({
                ...options,
                url,
                headers: {
                    ...options.headers,
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                },
                timeout: attempt === maxRetries ? 20000 : 10000, // Increase timeout on final attempt
            });
            return response;
        } catch (error) {
            if (attempt === maxRetries) throw error;
            // Wait longer between each retry
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }
}

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { urls, batchSize = 5 } = JSON.parse(event.body);
        
        if (!urls || !Array.isArray(urls)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid input: urls must be an array' })
            };
        }

        const results = [];
        const batches = [];
        
        for (let i = 0; i < urls.length; i += batchSize) {
            batches.push(urls.slice(i, i + batchSize));
        }

        for (const batchUrls of batches) {
            const batchPromises = batchUrls.map(async (url) => {
                try {
                    const normalizedUrl = normalizeUrl(url);
                    console.log(`Scraping URL: ${normalizedUrl}`);
                    
                    const mainPageData = await scrapeUrl(normalizedUrl);
                    let contactPageData = { emails: [], socialLinks: [] };

                    try {
                        const contactUrl = `${normalizedUrl}/contact`;
                        console.log(`Scraping contact page: ${contactUrl}`);
                        contactPageData = await scrapeUrl(contactUrl);
                    } catch (error) {
                        console.log(`Failed to scrape contact page: ${error.message}`);
                    }

                    const emails = [...new Set([...mainPageData.emails, ...contactPageData.emails])];
                    const socialLinks = [...new Set([...mainPageData.socialLinks, ...contactPageData.socialLinks])];

                    return {
                        url: normalizedUrl,
                        emails,
                        socialLinks
                    };
                } catch (error) {
                    console.error(`Error scraping ${url}: ${error.message}`);
                    return {
                        url,
                        error: error.message,
                        emails: [],
                        socialLinks: []
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(results)
        };
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

function normalizeUrl(url) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        return url.toLowerCase().replace(/\/$/, '');
    } catch (error) {
        console.error('URL normalization error:', error);
        throw error;
    }
}

async function scrapeUrl(url) {
    const emails = new Set();
    const socialLinks = new Map();

    try {
        // Try to scrape both HTTP and HTTPS versions if needed
        let response;
        try {
            response = await retryRequest(url, {
                validateStatus: status => status < 500,
                maxRedirects: 5,
                timeout: 10000
            });
        } catch (error) {
            if (url.startsWith('https://')) {
                const httpUrl = url.replace('https://', 'http://');
                response = await retryRequest(httpUrl, {
                    validateStatus: status => status < 500,
                    maxRedirects: 5,
                    timeout: 10000
                });
            } else {
                throw error;
            }
        }

        if (response.status !== 200) {
            throw new Error(`HTTP status ${response.status}`);
        }

        const $ = cheerio.load(response.data);

        // Enhanced email extraction
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        
        // Search for emails in different places
        const searchElements = [
            'body',
            '[href^="mailto:"]',
            'a',
            '.contact',
            '.email',
            '#contact',
            '#email',
            '[class*="contact"]',
            '[class*="email"]',
            '[id*="contact"]',
            '[id*="email"]'
        ];

        // Extract emails
        searchElements.forEach(selector => {
            try {
                $(selector).each((_, element) => {
                    const text = $(element).text();
                    const href = $(element).attr('href');
                    
                    // Check text content
                    const foundEmails = text.match(emailRegex) || [];
                    foundEmails.forEach(email => emails.add(email.toLowerCase()));

                    // Check href attribute
                    if (href) {
                        if (href.startsWith('mailto:')) {
                            const email = href.replace('mailto:', '').split('?')[0].toLowerCase();
                            if (email.match(emailRegex)) {
                                emails.add(email);
                            }
                        }
                    }
                });
            } catch (e) {
                console.log(`Error searching selector ${selector}:`, e.message);
            }
        });

        // Extract and normalize social media links
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            try {
                const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
                
                for (const [platform, { pattern, normalize }] of Object.entries(SOCIAL_PATTERNS)) {
                    if (pattern.test(fullUrl)) {
                        const normalizedUrl = normalize(fullUrl);
                        if (normalizedUrl) {
                            socialLinks.set(platform, normalizedUrl);
                        }
                        break;
                    }
                }
            } catch (e) {
                console.log(`Error processing URL ${href}:`, e.message);
            }
        });

        // Also check meta tags and link elements for social media profiles
        $('meta[property^="og:"], meta[name^="og:"], meta[property^="twitter:"], link[rel="alternate"]').each((_, element) => {
            const content = $(element).attr('content') || $(element).attr('href');
            if (!content) return;

            try {
                for (const [platform, { pattern, normalize }] of Object.entries(SOCIAL_PATTERNS)) {
                    if (pattern.test(content)) {
                        const normalizedUrl = normalize(content);
                        if (normalizedUrl) {
                            socialLinks.set(platform, normalizedUrl);
                        }
                        break;
                    }
                }
            } catch (e) {
                console.log(`Error processing meta content ${content}:`, e.message);
            }
        });

        // Convert social links map to array with platform information
        const socialLinksArray = Array.from(socialLinks.entries()).map(([platform, url]) => ({
            platform,
            url
        }));

        return {
            emails: [...emails],
            socialLinks: socialLinksArray
        };
    } catch (error) {
        console.error(`Scraping error for ${url}:`, error);
        throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
}
