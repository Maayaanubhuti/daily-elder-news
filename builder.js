const axios = require('axios');
const { JSDOM } = require('jsdom');
const { v2: cloudinary } = require('cloudinary');

// Setup Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// RSS Feeds (only high-quality sources)
const RSS_FEEDS = [
  'https://www.theguardian.com/society/older-people/rss',
  'https://feeds.bbci.co.uk/news/health/ageing/rss.xml',
  'https://www.helpageindia.org/media-centre/news-and-updates/feed/',
  'https://socialjustice.gov.in/cms/feed',
  'https://www.who.int/feeds/atom/en/index.html'
];

// Keywords related to elderly welfare
const KEYWORDS = [
  "elderly", "senior", "old age", "pension", "neglect", "abuse", "fraud",
  "loneliness", "abandoned", "isolated", "caregiver", "geriatric", "elder rights",
  "dementia", "alzheimer", "care training", "volunteer", "elder welfare",
  "maintenance act", "SCSS", "old age home", "daycare", "grandparent", "retirement",
  "over 70", "over-70", "winter fuel", "elder care", "ageing", "aging"
];

// Helper: extract image from HTML
function extractImage(html, baseUrl) {
  if (!html) return null;
  try {
    const dom = new JSDOM(html);
    const img = dom.window.document.querySelector('img');
    if (img && img.src) {
      return new URL(img.src.trim(), baseUrl).href; // Resolve relative URLs
    }
  } catch (e) {
    return null;
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
      const cleanUrl = url.trim();
      const res = await axios.get(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(cleanUrl)}&api_key=${process.env.RSS2JSON_KEY}`
      );
      const feed = res.data;
      if (feed.status !== 'ok') {
        console.log(`❌ Failed feed: ${cleanUrl}`);
        continue;
      }

      for (const item of feed.items) {
        const title = item.title?.trim();
        const link = item.link?.trim();
        if (!title || !link || seenTitles.has(title)) continue;

        // Combine content for keyword search
        const content = `${title} ${item.description || ''} ${item.content || ''}`.toLowerCase();
        const hasKeyword = KEYWORDS.some(k => content.includes(k.toLowerCase()));

        // Only allow if keyword matches
        if (!hasKeyword) {
          console.log("Skipped (no keyword):", title);
          continue;
        }

        seenTitles.add(title);

        // Find best image
        let imgUrl = item.thumbnail?.trim() || 
                     item.enclosure?.link?.trim();

        if (!imgUrl) {
          imgUrl = extractImage(item.description, link) ||
                   extractImage(item.content, link);
        }

        // Upload to Cloudinary
        let cloudinaryUrl = null;
        if (imgUrl) {
          try {
            const result = await cloudinary.uploader.upload(imgUrl, {
              folder: 'daily-pulse',
              width: 800,
              height: 400,
              crop: 'fill',
              gravity: 'auto',
              quality: 'auto:good',
              fetch_format: 'auto'
            });
            cloudinaryUrl = result.secure_url;
          } catch (e) {
            console.log("Upload failed:", title, e.message);
          }
        }

        allNews.push({
          title: title,
          link: link,
          image: cloudinaryUrl || `https://source.unsplash.com/random/800x400/?elderly,india,portrait`,
          pubDate: item.pubDate,
          pubDateString: new Date(item.pubDate).toLocaleDateString(),
          source: feed.feed?.title?.trim() || 'Unknown Source'
        });

        if (allNews.length >= 10) break; // Max 10 news items
      }
      if (allNews.length >= 10) break;
    } catch (e) {
      console.error("Error fetching feed:", e.message);
    }
  }

  // Sort by date (newest first)
  allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Save to file
  const fs = require('fs');
  fs.writeFileSync('news-today.json', JSON.stringify(allNews, null, 2));
  console.log('✅ Successfully generated news-today.json with', allNews.length, 'articles');
  console.log('📄 Check: https://raw.githubusercontent.com/Maayaanubhuti/daily-elder-news/main/news-today.json');
}

buildNews().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
