// ChatGPT SEO Analyst - Background Service Worker
// Monitors network traffic and coordinates with content script

let activeAnalysis = {};
let requestCounts = {};

// Store active requests to match with responses
let activeRequests = {};

// Track conversation API requests
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const tabId = details.tabId;
    
    // Initialize tracking for this tab
    if (!requestCounts[tabId]) {
      requestCounts[tabId] = 0;
    }
    
    console.log(`[ChatGPT Analyst] Intercepted conversation request: ${details.url}`);
    
    // Store request details to match with response
    activeRequests[details.requestId] = {
      url: details.url,
      tabId: tabId,
      timestamp: Date.now(),
      requestId: details.requestId
    };
    
    return {cancel: false};
  },
  {
    urls: [
      "https://chatgpt.com/backend-api/conversation/*"
    ]
  },
  ["requestBody"]
);

// Monitor completed requests and inject response interceptor
chrome.webRequest.onCompleted.addListener(
  function(details) {
    const requestInfo = activeRequests[details.requestId];
    if (!requestInfo) return;
    
    const tabId = requestInfo.tabId;
    
    if (details.statusCode === 200) {
      console.log(`[ChatGPT Analyst] API request completed successfully: ${details.url}`);
      
      // Check if this is a conversation data endpoint (GET request to conversation with UUID)
      const conversationMatch = details.url.match(/\/backend-api\/conversation\/([a-f0-9-]{36})$/);
      
      if (conversationMatch && details.method === 'GET') {
        console.log(`[ChatGPT Analyst] Detected conversation data request: ${details.url}`);
        
        // Inject script to capture this specific response
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: interceptConversationResponse,
          args: [details.url, conversationMatch[1]]
        }).catch(error => {
          console.warn('Could not inject response interceptor:', error);
        });
      }
      
      // Increment request count and update badge
      requestCounts[tabId] = (requestCounts[tabId] || 0) + 1;
      chrome.action.setBadgeText({
        text: requestCounts[tabId].toString(),
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: "#4CAF50",
        tabId: tabId
      });
    }
    
    // Clean up request tracking
    delete activeRequests[details.requestId];
  },
  {
    urls: [
      "https://chatgpt.com/backend-api/conversation/*"
    ]
  },
  ["responseHeaders"]
);

// Function to inject into main world to intercept responses
function interceptConversationResponse(apiUrl, conversationId) {
  // This runs in the main world context, so it has access to the same fetch context as ChatGPT
  console.log('[ChatGPT Analyst] Injected interceptor for:', apiUrl);
  
  // Try to re-fetch the same URL that just completed
  fetch(apiUrl, {
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
    }
  })
  .then(response => {
    if (response.ok) {
      return response.json();
    }
    throw new Error(`HTTP ${response.status}`);
  })
  .then(data => {
    console.log('[ChatGPT Analyst] Successfully intercepted conversation data');
    
    // Send data to content script via window.postMessage
    window.postMessage({
      type: 'CHATGPT_CONVERSATION_DATA',
      data: data,
      conversationId: conversationId,
      url: apiUrl,
      timestamp: Date.now()
    }, '*');
  })
  .catch(error => {
    console.warn('[ChatGPT Analyst] Could not intercept conversation data:', error);
  });
}

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