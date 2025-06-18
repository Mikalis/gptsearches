# 🔍 ChatGPT SEO Analyst 
*Unlock AI's Hidden Search Patterns*

## **Want Maximum ChatGPT Visibility?**

**Contact [Unic.com](https://unic.com) - Our specialists optimize for ChatGPT visibility & AI discoverability!**

<div align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px;">

### **Expert ChatGPT Visibility Consulting**

*ChatGPT Optimization* • *AI Content Strategy* • *Visibility Audits*

</div>

## 🚨 Important Notes

- **Privacy**: All analysis happens locally in your browser
- **No Data Collection**: Extension doesn't send data anywhere
- **ChatGPT Updates**: May require updates if ChatGPT changes their API
- **Development Extension**: This is a development tool, not for production use


## **What This Extension Does**

Reveals ChatGPT's internal search queries and reasoning patterns in real-time. See exactly what AI searches for when answering questions giving you unprecedented SEO insights.

**Key Features:**
- **Real AI Search Queries** - See ChatGPT's actual search terms
- **Internal Reasoning** - Understand AI decision-making process  
- **Export Data** - Save insights for analysis
- **Live Overlay** - Non-intrusive interface on ChatGPT
- **Quick Toggle** - `Ctrl+Shift+S` shortcut

## 📥 **How to Install**

### **3 Simple Steps:**

1. **Download** this folder to your computer
2. **Open Chrome** → Go to `chrome://extensions/` → Toggle **Developer mode** ON
3. **Click "Load unpacked"** → Select this folder → Done! ✅

### **How to Use:**
1. Go to **ChatGPT.com**
2. Ask any question
3. Click on the Extension and use it 

(hint: sometimes a refresh is triggerd)

### What Data is Captured

The extension monitors ChatGPT's API responses for:

1. **Search Queries** (`metadata.search_queries`):
   - Actual search terms used by ChatGPT
   - Helpful for understanding SEO opportunities

2. **Internal Thoughts** (`content.thoughts`):
   - ChatGPT's reasoning process
   - Planning and decision-making insights


## 🔍 How It Works

1. **Background Script** (`background.js`):
   - Uses `chrome.webRequest` API to monitor network traffic
   - Filters for ChatGPT conversation endpoints
   - Coordinates with content script

2. **Content Script** (`content.js`):
   - Injected into ChatGPT pages
   - Fetches and analyzes API responses
   - Creates and manages overlay interface

3. **Network Analysis**:
   - Monitors POST requests to `/backend-api/conversation/`
   - Re-fetches responses to parse JSON data
   - Extracts search queries and thoughts from response structure

## 🐛 Troubleshooting

### Extension Not Working
- Ensure you're on `chatgpt.com`
- Check Developer Mode is enabled
- Reload the extension in `chrome://extensions/`

### No Data Detected
- Try asking questions that require current information
- Some ChatGPT responses don't trigger searches
- Check browser console for error messages

### Network Issues
- CORS restrictions may prevent data access
- Clear browser cache and cookies
- Disable other conflicting extensions

### Overlay Not Appearing
- Check auto-show setting in popup
- Use `Ctrl+Shift+S` to manually toggle
- Verify extension permissions

