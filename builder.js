const axios = require('axios');
const { JSDOM } = require('jsdom');
const { v2: cloudinary } = require('cloudinary');

// Setup Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// RSS Feeds
const RSS_FEEDS = [
  'https://www.theguardian.com/society/older-people/rss',
  'https://feeds.bbci.co.uk/news/health/ageing/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/2886704.cms',
  'https://indianexpress.com/section/india/rss',
  'https://www.deccanherald.com/rss/lifestyle/feedpage/rss/0,2-9,0.xml',
  'https://socialjustice.gov.in/cms/feed',
  'https://www.helpageindia.org/media-centre/news-and-updates/feed/',
  'https://www.apa.org/monitor/rss.xml',
  'https://www.sciencedaily.com/rss/mind_brain/aging_news.xml',
  'https://www.who.int/feeds/atom/en/index.html'
];

// Keywords about elderly care
const KEYWORDS = [
  "elderly", "senior", "old age", "pension", "neglect", "abuse", "fraud",
  "loneliness", "abandoned", "isolated", "caregiver", "geriatric", "elder rights",
  "dementia", "Alzheimer", "care training", "volunteer", "elder welfare"
];

// Helper: extract image from HTML
function extractImage(html, baseUrl) {
  if (!html) return null;
  const dom = new JSDOM(html);
  const img = dom.window.document.querySelector('img');
  if (img && img.src) {
    try {
      return new URL(img.src, baseUrl).href; // Fix relative URLs
    } catch {
      return null;
    }
  }
  return null;
}

// Main function
async function buildNews() {
  const { CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET } = process.env;
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: API_KEY, api_secret: API_SECRET });

  const allNews = [];
  const seenTitles = new Set();

  for (const url of RSS_FEEDS) {
    try {
      const res = await axios.get(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&api_key=${process.env.RSS2JSON_KEY}`
      );
      const feed = res.data;
      if (feed.status !== 'ok') continue;

      for (const item of feed.items) {
        if (seenTitles.has(item.title)) continue;

        const content = `${item.title} ${item.description}`.toLowerCase();
        const matches = KEYWORDS.some(k => content.includes(k.toLowerCase()));

        // Only keep if keyword matches or we don’t have enough yet
        if (!matches && allNews.length >= 15) continue;

        seenTitles.add(item.title);

        // Find best image
        let imgUrl = item.thumbnail || item.enclosure?.link;
        if (!imgUrl) imgUrl = extractImage(item.description, item.link) || extractImage(item.content, item.link);
        if (!imgUrl) imgUrl = `https://source.unsplash.com/random/800x400/?elderly,senior`;

        // Upload to Cloudinary
        let cloudinaryUrl = null;
        try {
          const uploadResult = await cloudinary.uploader.upload(imgUrl, {
            folder: 'daily-pulse',
            width: 800,
            height: 400,
            crop: 'fill',
            gravity: 'auto',
            quality: 'auto:good',
            fetch_format: 'auto'
          });
          cloudinaryUrl = uploadResult.secure_url;
        } catch (e) {
          console.log("Failed to upload:", item.title);
        }

        allNews.push({
          title: item.title,
          link: item.link,
          image: cloudinaryUrl || `https://source.unsplash.com/random/800x400/?elderly,portrait`,
          pubDate: item.pubDate,
          pubDateString: new Date(item.pubDate).toLocaleDateString(),
          source: feed.feed?.title || 'Unknown'
        });

        if (allNews.length >= 15) break;
      }
      if (allNews.length >= 15) break;
    } catch (e) {
      console.log("Error fetching feed:", e.message);
    }
  }

  // Sort by date (newest first)
  allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Save to file
  require('fs').writeFileSync('news-today.json', JSON.stringify(allNews, null, 2));
  console.log('✅ News built and saved!');
}

buildNews().catch(err => console.error(err));
