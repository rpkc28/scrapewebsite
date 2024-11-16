const axios = require('axios');
const cheerio = require('cheerio');

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
    const socialLinks = new Set();

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000,
            maxRedirects: 5
        });

        const $ = cheerio.load(response.data);

        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const pageText = $('body').text();
        const foundEmails = pageText.match(emailRegex) || [];
        foundEmails.forEach(email => emails.add(email.toLowerCase()));

        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            if (href) {
                const socialPatterns = {
                    facebook: /facebook\.com/i,
                    instagram: /instagram\.com/i,
                    linkedin: /linkedin\.com/i,
                    twitter: /twitter\.com/i,
                    youtube: /youtube\.com/i,
                    tiktok: /tiktok\.com/i
                };

                for (const [platform, pattern] of Object.entries(socialPatterns)) {
                    if (pattern.test(href)) {
                        socialLinks.add(href);
                        break;
                    }
                }
            }
        });

        return {
            emails: [...emails],
            socialLinks: [...socialLinks]
        };
    } catch (error) {
        console.error(`Scraping error for ${url}:`, error);
        throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
}
