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
    
    // Debug: Log all conversation-related requests (successful and failed)
    console.log(`[ChatGPT Analyst] Request completed:`, {
      url: details.url,
      method: details.method,
      statusCode: details.statusCode
    });
    
    // Check if this is a conversation data endpoint (GET request to conversation with UUID)
    // Pattern: /backend-api/conversation/{uuid} (exact match, no additional path)
    const conversationMatch = details.url.match(/\/backend-api\/conversation\/([a-f0-9-]{36})$/);
    
    if (conversationMatch) {
      console.log(`[ChatGPT Analyst] Detected conversation data request: ${details.url}`);
      console.log(`[ChatGPT Analyst] Conversation ID: ${conversationMatch[1]}, Status: ${details.statusCode}`);
      
      // Try to intercept regardless of status code (manual fetch might work even if automated failed)
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: interceptConversationResponse,
        args: [details.url, conversationMatch[1]]
      }).catch(error => {
        console.warn('Could not inject response interceptor:', error);
      });
      
      // Update badge for detected conversation requests
      requestCounts[tabId] = (requestCounts[tabId] || 0) + 1;
      chrome.action.setBadgeText({
        text: requestCounts[tabId].toString(),
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: details.statusCode === 200 ? "#4CAF50" : "#FF9800", // Green for success, Orange for errors
        tabId: tabId
      });
    } else {
      // Debug: Show what didn't match
      if (details.url.includes('/backend-api/conversation/')) {
        console.log(`[ChatGPT Analyst] Conversation URL didn't match pattern: ${details.url}`);
      }
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
  
  // Get the authorization token from various sources
  let authToken = null;
  try {
    // Method 1: Check localStorage/sessionStorage
    authToken = localStorage.getItem('auth_token') || 
               localStorage.getItem('access_token') ||
               localStorage.getItem('authToken') ||
               sessionStorage.getItem('auth_token');
               
    // Method 2: Try to intercept from current page's fetch implementation
    if (!authToken && window.fetch) {
      // Store original fetch
      const originalFetch = window.fetch;
      
      // Temporarily override fetch to capture auth headers
      let capturedToken = null;
      window.fetch = function(...args) {
        try {
          const [url, options] = args;
          if (url && url.includes('/backend-api/') && options && options.headers) {
            const headers = options.headers;
            if (headers.authorization && headers.authorization.startsWith('Bearer ')) {
              capturedToken = headers.authorization.replace('Bearer ', '');
              console.log('[ChatGPT Analyst] Captured auth token from fetch request');
            }
          }
        } catch (e) {
          // Ignore errors
        }
        return originalFetch.apply(this, args);
      };
      
      // Restore original fetch after a short delay
      setTimeout(() => {
        window.fetch = originalFetch;
        if (capturedToken) {
          authToken = capturedToken;
        }
      }, 1000);
    }
    
    // Method 3: Look for token in document cookies
    if (!authToken) {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name && (name.includes('auth') || name.includes('token')) && value) {
          authToken = value;
          break;
        }
      }
    }
  } catch (e) {
    console.warn('[ChatGPT Analyst] Could not access auth token:', e);
  }
  
  console.log('[ChatGPT Analyst] Auth token found:', authToken ? 'Yes' : 'No');
  
  // Build headers similar to ChatGPT's request
  const headers = {
    'accept': '*/*',
    'accept-language': navigator.language || 'en-US,en;q=0.9',
    'oai-language': navigator.language?.split('-')[0] || 'en',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
  };
  
  // Add auth token if available
  if (authToken) {
    headers['authorization'] = `Bearer ${authToken}`;
  }
  
  // Try to get device ID and client version from meta tags or existing requests
  try {
    const deviceId = document.querySelector('meta[name="oai-device-id"]')?.content ||
                    localStorage.getItem('oai-device-id') ||
                    'unknown-device';
    const clientVersion = document.querySelector('meta[name="oai-client-version"]')?.content ||
                         'prod-latest';
    
    headers['oai-device-id'] = deviceId;
    headers['oai-client-version'] = clientVersion;
  } catch (e) {
    // Optional headers, continue without them
  }
  
  console.log('[ChatGPT Analyst] Fetching with headers:', Object.keys(headers));
  
  // Try to re-fetch the same URL that just completed with proper headers
  fetch(apiUrl, {
    method: 'GET',
    credentials: 'include',
    headers: headers,
    mode: 'cors',
    referrer: window.location.href,
    referrerPolicy: 'strict-origin-when-cross-origin'
  })
  .then(response => {
    console.log('[ChatGPT Analyst] Response status:', response.status);
    if (response.ok) {
      return response.json();
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
    
    // Send error info to content script
    window.postMessage({
      type: 'CHATGPT_CONVERSATION_ERROR',
      error: error.message,
      conversationId: conversationId,
      url: apiUrl,
      timestamp: Date.now()
    }, '*');
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