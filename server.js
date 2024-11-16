const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Helper function to normalize URLs
function normalizeUrl(url) {
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    return url.toLowerCase().replace(/\/$/, '');
}

// Helper function to clean emails
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}

// Helper function to get contact page URL
function getContactPageUrl(baseUrl) {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.hostname}/contact`;
}

// Helper function to extract social media links
function extractSocialLinks($) {
    const socialPatterns = {
        facebook: [/facebook\.com/i, /fb\.com/i, /fb\.me/i],
        instagram: [/instagram\.com/i, /instagr\.am/i],
        linkedin: [/linkedin\.com/i, /lnkd\.in/i],
        youtube: [/youtube\.com/i, /youtu\.be/i],
        twitter: [/twitter\.com/i, /x\.com/i],
        tiktok: [/tiktok\.com/i, /douyin\.com/i]
    };

    const socialLinks = {};

    // Initialize empty arrays for each platform
    Object.keys(socialPatterns).forEach(platform => {
        socialLinks[platform] = new Set();
    });

    // Find all links
    $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        // Try to create a valid URL
        let url;
        try {
            url = new URL(href, 'https://example.com');
        } catch {
            return;
        }

        // Check each platform's patterns
        Object.entries(socialPatterns).forEach(([platform, patterns]) => {
            if (patterns.some(pattern => pattern.test(url.href))) {
                socialLinks[platform].add(url.href);
            }
        });
    });

    // Convert Sets to Arrays and clean up empty platforms
    const result = {};
    Object.entries(socialLinks).forEach(([platform, links]) => {
        const linksArray = Array.from(links);
        if (linksArray.length > 0) {
            result[platform] = linksArray;
        }
    });

    return result;
}

async function scrapeWebsite(url) {
    try {
        // Normalize URL
        url = normalizeUrl(url);
        
        // Scrape main page
        const mainResponse = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        let combinedHtml = mainResponse.data;

        // Try to scrape contact page
        try {
            const contactUrl = getContactPageUrl(url);
            const contactResponse = await axios.get(contactUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            combinedHtml += contactResponse.data;
        } catch (error) {
            console.log(`Contact page not found for ${url}`);
        }

        // Load combined HTML for scraping
        const $ = cheerio.load(combinedHtml);
        
        // Extract emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const emails = [...new Set(
            (combinedHtml.match(emailRegex) || [])
                .map(normalizeEmail)
                .filter(email => 
                    !email.includes('example') &&
                    !email.includes('your@') &&
                    !email.includes('test@') &&
                    !email.includes('.png') &&
                    !email.includes('.jpg')
                )
        )];

        // Extract social media links
        const socialLinks = extractSocialLinks($);

        return {
            emails,
            socialLinks
        };
    } catch (error) {
        throw new Error('Failed to scrape website');
    }
}

app.post('/scrape', async (req, res) => {
    const { urls, batchSize = 5 } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    const results = [];
    
    // Process URLs in batches
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchPromises = batch.map(async (url) => {
            try {
                const result = await scrapeWebsite(url);
                return {
                    url,
                    ...result
                };
            } catch (error) {
                return {
                    url,
                    error: error.message
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    res.json(results);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});