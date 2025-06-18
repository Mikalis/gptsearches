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
    
    // Inject response interceptor into the page
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: injectResponseInterceptor,
      world: 'MAIN'
    }).catch(error => {
      console.warn('Could not inject response interceptor:', error);
    });
    
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

// Function to be injected into the main world to intercept fetch responses
function injectResponseInterceptor() {
  if (window.chatgptAnalystInjected) return;
  window.chatgptAnalystInjected = true;
  
  // Store original fetch
  const originalFetch = window.fetch;
  
  // Override fetch to intercept ChatGPT responses
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    // Check if this is a ChatGPT conversation GET endpoint (contains conversation ID)
    const url = args[0];
    if (url && typeof url === 'string' && 
        url.includes('/backend-api/conversation/') && 
        url.match(/\/backend-api\/conversation\/[a-f0-9-]{36}$/)) {
      
      console.log('ChatGPT Analyst: Intercepting conversation data from:', url);
      const clonedResponse = response.clone();
      
      try {
        const data = await clonedResponse.text();
        // Send the response data to content script
        window.postMessage({
          type: 'CHATGPT_RESPONSE_INTERCEPTED',
          url: url,
          data: data,
          timestamp: Date.now(),
          method: 'GET'
        }, '*');
      } catch (error) {
        console.warn('Error intercepting ChatGPT conversation data:', error);
      }
    }
    
    return response;
  };
}

console.log("[ChatGPT Analyst] Background service worker loaded and monitoring network traffic"); 