import React, { useState } from "react";
import { createRoot } from "react-dom/client";

console.log("App.js is loading...");

function ScraperForm({ onSubmit }) {
  const [urls, setUrls] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const urlList = urls.split('\n').filter(url => url.trim() !== '');
    onSubmit(urlList);
  };

  return (
    <form onSubmit={handleSubmit} className="scraper-form">
      <textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder="Enter website URLs (one per line)"
        required
      />
      <button type="submit">Scrape</button>
    </form>
  );
}

function ResultDisplay({ results, totalUrls, scrapedUrls }) {
  if (!results || Object.keys(results).length === 0) return null;

  const platforms = [
    "emails",
    "facebook",
    "instagram",
    "linkedin",
    "youtube",
    "twitter",
    "tiktok",
    "whatsapp",
    "telegram"
  ];

  const copyResults = () => {
    const text = Object.entries(results)
      .map(([url, data]) => {
        return `${url}\n${platforms
          .map(platform => `${platform}: ${data[platform].join(', ')}`)
          .join('\n')}\n`;
      })
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  const downloadCSV = () => {
    let csv = "URL,Platform,Value\n";
    Object.entries(results).forEach(([url, data]) => {
      platforms.forEach(platform => {
        data[platform].forEach(value => {
          csv += `"${url}","${platform}","${value}"\n`;
        });
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "scraping_results.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const progress = Math.round((scrapedUrls / totalUrls) * 100);

  return (
    <div className="results">
      <h2>Scraping Results</h2>
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }}></div>
      </div>
      <p>{scrapedUrls} out of {totalUrls} websites scraped ({progress}%)</p>
      <div className="result-actions">
        <button onClick={copyResults}>Copy Results</button>
        <button onClick={downloadCSV}>Download CSV</button>
      </div>
      {Object.entries(results).map(([url, data]) => (
        <div key={url} className="website-result">
          <h3>{url}</h3>
          {platforms.map((platform) => (
            <div key={platform}>
              <h4>{platform.charAt(0).toUpperCase() + platform.slice(1)}:</h4>
              <ul>
                {data[platform].map((item, index) => (
                  <li key={index}>
                    {platform === "emails" ? (
                      item
                    ) : (
                      <a href={item} target="_blank" rel="noopener noreferrer">
                        {item}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

async function scrapeWebsite(url) {
  try {
    const response = await fetch('/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      throw new Error('Failed to scrape website');
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    return {
      [url]: {
        emails: [],
        facebook: [],
        instagram: [],
        linkedin: [],
        youtube: [],
        twitter: [],
        tiktok: [],
        whatsapp: [],
        telegram: []
      }
    };
  }
}

function App() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalUrls, setTotalUrls] = useState(0);
  const [scrapedUrls, setScrapedUrls] = useState(0);

  const handleSubmit = async (urls) => {
    setLoading(true);
    setError(null);
    setResults({});
    setTotalUrls(urls.length);
    setScrapedUrls(0);

    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      try {
        const batchResults = await Promise.all(batch.map(scrapeWebsite));
        const combinedResults = Object.assign({}, ...batchResults);
        setResults(prevResults => ({ ...prevResults, ...combinedResults }));
        setScrapedUrls(prevScraped => prevScraped + batch.length);
      } catch (err) {
        setError(err.message);
        break;
      }
      // Add a small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    setLoading(false);
  };

  return (
    <div className="app">
      <header>
        <h1>🕷️ Multi-Website Scraper</h1>
      </header>
      <main>
        <ScraperForm onSubmit={handleSubmit} />
        {loading && <p>Scraping in progress...</p>}
        {error && <p className="error">{error}</p>}
        <ResultDisplay results={results} totalUrls={totalUrls} scrapedUrls={scrapedUrls} />
      </main>
    </div>
  );
}

// Add styles
const style = document.createElement('style');
style.textContent = `
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background-color: #f0f4f8;
  color: #333;
}
.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
header {
  background-color: #4a90e2;
  color: white;
  padding: 20px 0;
  text-align: center;
  border-radius: 8px 8px 0 0;
}
main {
  background-color: #ffffff;
  padding: 20px;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.scraper-form {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}
textarea {
  height: 100px;
  padding: 10px;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-bottom: 10px;
}
button {
  padding: 10px 20px;
  font-size: 16px;
  background-color: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:hover {
  background-color: #3a7bc8;
}
.results {
  margin-top: 20px;
}
.result-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.website-result {
  margin-bottom: 30px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 20px;
}
.results h2 {
  color: #4a90e2;
}
.results h3 {
  color: #666;
}
.results h4 {
  color: #4a90e2;
  margin-bottom: 5px;
}
.results ul {
  list-style-type: none;
  padding-left: 0;
}
.results li {
  margin-bottom: 5px;
}
.error {
  color: #e74c3c;
  font-weight: bold;
}
.progress-bar {
  width: 100%;
  height: 20px;
  background-color: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 10px;
}
.progress {
  height: 100%;
  background-color: #4caf50;
  transition: width 0.5s ease-in-out;
}
`;
document.head.appendChild(style);

// Initialize the app
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Could not find root element!");
} else {
  console.log("Found root element, initializing React...");
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
