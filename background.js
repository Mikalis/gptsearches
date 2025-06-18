// ChatGPT SEO Analyst - Background Service Worker
// Monitors network traffic and coordinates with content script

let activeAnalysis = {};
let requestCounts = {};

// Track conversation API requests and inject response interceptor
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const tabId = details.tabId;
    
    // Initialize tracking for this tab
    if (!requestCounts[tabId]) {
      requestCounts[tabId] = 0;
    }
    
    console.log(`[ChatGPT Analyst] Intercepted conversation request: ${details.url}`);
    
    // Store request details for this tab
    activeAnalysis[tabId] = {
      url: details.url,
      timestamp: Date.now(),
      requestId: details.requestId
    };
    
    // No longer injecting scripts due to CSP restrictions
    // We'll use a different approach to monitor conversation data
    
    return {cancel: false};
  },
  {
    urls: [
      "https://chatgpt.com/backend-api/conversation",
      "https://chatgpt.com/backend-api/conversation/*",
      "https://*.chatgpt.com/backend-api/conversation",
      "https://*.chatgpt.com/backend-api/conversation/*"
    ]
  },
  ["requestBody"]
);

// Monitor completed requests and update badge
chrome.webRequest.onCompleted.addListener(
  function(details) {
    const tabId = details.tabId;
    
    if (details.statusCode === 200 && activeAnalysis[tabId]) {
      console.log(`[ChatGPT Analyst] API request completed successfully for tab ${tabId}`);
      
      // Increment request count
      requestCounts[tabId] = (requestCounts[tabId] || 0) + 1;
      
      // Update badge with request count
      chrome.action.setBadgeText({
        text: requestCounts[tabId].toString(),
        tabId: tabId
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: "#4CAF50",
        tabId: tabId
      });
      
      // Send a simple notification to content script that a request completed
      chrome.tabs.sendMessage(tabId, {
        action: "requestCompleted",
        url: details.url,
        timestamp: Date.now(),
        requestCount: requestCounts[tabId]
      }).catch(error => {
        console.warn(`[ChatGPT Analyst] Could not send notification to tab ${tabId}:`, error);
      });
    }
  },
  {
    urls: [
      "https://chatgpt.com/backend-api/conversation",
      "https://chatgpt.com/backend-api/conversation/*",
      "https://*.chatgpt.com/backend-api/conversation",
      "https://*.chatgpt.com/backend-api/conversation/*"
    ]
  },
  ["responseHeaders"]
);

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle_overlay") {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url.includes("chatgpt.com")) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleOverlay"
        });
      }
    });
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete activeAnalysis[tabId];
  delete requestCounts[tabId];
});

// Reset badge when navigating away from ChatGPT
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && !changeInfo.url.includes("chatgpt.com")) {
    chrome.action.setBadgeText({text: "", tabId: tabId});
    delete activeAnalysis[tabId];
    delete requestCounts[tabId];
  }
});

// Extract conversation ID from ChatGPT URL
function extractConversationId(url) {
  const match = url.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

console.log("[ChatGPT Analyst] Background service worker loaded and monitoring network traffic"); 