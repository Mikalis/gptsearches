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
      "https://chatgpt.com/backend-api/conversation/*",
      "https://chatgpt.com/backend-api/conversations*",
      "https://chatgpt.com/backend-api/conversation",
      "https://chatgpt.com/backend-anon/conversation*"
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
    // Updated patterns based on current ChatGPT API structure
    const conversationMatch = details.url.match(/\/backend-api\/conversation[s]?\/([a-f0-9-]{36})/) ||
                             details.url.match(/\/backend-api\/conversation\/([a-f0-9-]{36})/) ||
                             details.url.match(/\/backend-anon\/conversation\/([a-f0-9-]{36})/);
    
    if (conversationMatch) {
      const conversationId = conversationMatch[1] || conversationMatch[2] || conversationMatch[3];
      console.log(`[ChatGPT Analyst] Detected conversation data request: ${details.url}`);
      console.log(`[ChatGPT Analyst] Conversation ID: ${conversationId}, Status: ${details.statusCode}`);
      
      // Only try to intercept successful requests (200) and client errors that might work with auth (401, 403)
      if (details.statusCode === 200) {
        console.log(`[ChatGPT Analyst] Successful request - attempting interception`);
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: interceptConversationResponse,
          args: [details.url, conversationId, details.statusCode]
        }).catch(error => {
          console.warn('Could not inject response interceptor:', error);
        });
      } else if (details.statusCode === 404) {
        console.log(`[ChatGPT Analyst] 404 Error - conversation doesn't exist or has expired: ${conversationId}`);
        // Send error to content script without trying to re-fetch
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: notifyConversationError,
          args: [conversationId, `Conversation not found (404). This conversation may have expired or been deleted.`]
        }).catch(error => {
          console.warn('Could not inject error notification:', error);
        });
      } else if (details.statusCode === 401 || details.statusCode === 403) {
        console.log(`[ChatGPT Analyst] Auth error (${details.statusCode}) - attempting interception with better auth`);
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: interceptConversationResponse,
          args: [details.url, conversationId, details.statusCode]
        }).catch(error => {
          console.warn('Could not inject response interceptor:', error);
        });
      } else {
        console.log(`[ChatGPT Analyst] HTTP ${details.statusCode} - skipping interception attempt`);
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: notifyConversationError,
          args: [conversationId, `HTTP ${details.statusCode}: ${details.statusCode === 500 ? 'Server error' : 'Request failed'}`]
        }).catch(error => {
          console.warn('Could not inject error notification:', error);
        });
      }
      
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
      "https://chatgpt.com/backend-api/conversation/*",
      "https://chatgpt.com/backend-api/conversations*",
      "https://chatgpt.com/backend-api/conversation",
      "https://chatgpt.com/backend-anon/conversation*"
    ]
  },
  ["responseHeaders"]
);

// Function to notify of conversation errors without attempting fetch
function notifyConversationError(conversationId, errorMessage) {
  console.log('[ChatGPT Analyst] Conversation error:', errorMessage);
  
  // Send error info to content script
  window.postMessage({
    type: 'CHATGPT_CONVERSATION_ERROR',
    error: errorMessage,
    conversationId: conversationId,
    timestamp: Date.now()
  }, '*');
}

// Function to inject into main world to intercept responses
function interceptConversationResponse(apiUrl, conversationId, originalStatusCode) {
  console.log('[ChatGPT Analyst] Injected interceptor for:', apiUrl);
  console.log('[ChatGPT Analyst] Conversation ID:', conversationId);
  console.log('[ChatGPT Analyst] Original request status:', originalStatusCode);
  
  // First, try to get the latest auth token from the page
  let authToken = null;
  
  // Method 1: Check if there's a current fetch with auth headers
  const originalFetch = window.fetch;
  let tokenPromise = new Promise((resolve) => {
    // Override fetch temporarily to capture auth token
    window.fetch = function(...args) {
      const result = originalFetch.apply(this, args);
      
      try {
        const [url, options] = args;
        if (url && url.includes('/backend-api/') && options && options.headers) {
          const headers = options.headers;
          if (headers.authorization && headers.authorization.startsWith('Bearer ')) {
            authToken = headers.authorization.replace('Bearer ', '');
            console.log('[ChatGPT Analyst] Captured fresh auth token');
            resolve(authToken);
          }
        }
      } catch (e) {
        // Continue without error
      }
      
      return result;
    };
    
    // Restore fetch after 2 seconds
    setTimeout(() => {
      window.fetch = originalFetch;
      resolve(authToken);
    }, 2000);
  });
  
  // Method 2: Check stored tokens
  if (!authToken) {
    try {
      authToken = localStorage.getItem('auth_token') || 
                 localStorage.getItem('access_token') ||
                 localStorage.getItem('authToken') ||
                 sessionStorage.getItem('auth_token');
    } catch (e) {
      console.warn('[ChatGPT Analyst] Could not access stored tokens:', e);
    }
  }
  
  // Method 3: Try different URL patterns based on user workflow
  const tryUrls = [
    apiUrl, // Original URL
    `https://chatgpt.com/backend-api/conversation/${conversationId}`,
    `https://chatgpt.com/backend-api/conversations/${conversationId}`,
    `https://chatgpt.com/backend-anon/conversation/${conversationId}`
  ];
  
  console.log('[ChatGPT Analyst] Will try URLs:', tryUrls);
  
  // Wait for potential auth token capture, then try requests
  tokenPromise.then((capturedToken) => {
    const finalAuthToken = capturedToken || authToken;
    console.log('[ChatGPT Analyst] Using auth token:', finalAuthToken ? 'Yes' : 'No');
    
    // Try each URL pattern
    let attempts = 0;
    
    function tryNextUrl() {
      if (attempts >= tryUrls.length) {
        console.warn('[ChatGPT Analyst] All URL patterns failed');
        window.postMessage({
          type: 'CHATGPT_CONVERSATION_ERROR',
          error: 'Could not find conversation data using any known URL pattern',
          conversationId: conversationId,
          url: apiUrl,
          timestamp: Date.now()
        }, '*');
        return;
      }
      
      const currentUrl = tryUrls[attempts];
      attempts++;
      
      console.log(`[ChatGPT Analyst] Trying URL ${attempts}/${tryUrls.length}: ${currentUrl}`);
      
      // Build headers
      const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': navigator.language || 'en-US,en;q=0.9',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
      };
      
      if (finalAuthToken) {
        headers['authorization'] = `Bearer ${finalAuthToken}`;
      }
      
      // Add OpenAI specific headers if available
      try {
        const deviceId = document.querySelector('meta[name="oai-device-id"]')?.content ||
                        localStorage.getItem('oai-device-id');
        const clientVersion = document.querySelector('meta[name="oai-client-version"]')?.content ||
                             'prod-latest';
        
        if (deviceId) headers['oai-device-id'] = deviceId;
        headers['oai-client-version'] = clientVersion;
      } catch (e) {
        // Optional headers, continue without them
      }
      
      fetch(currentUrl, {
        method: 'GET',
        credentials: 'include',
        headers: headers,
        mode: 'cors'
      })
      .then(response => {
        console.log(`[ChatGPT Analyst] Response from ${currentUrl}:`, {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type')
        });
        
        if (response.ok) {
          return response.json();
        } else if (response.status === 404 && attempts < tryUrls.length) {
          // Try next URL
          console.log(`[ChatGPT Analyst] 404 on ${currentUrl}, trying next...`);
          tryNextUrl();
          return null;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      })
      .then(data => {
        if (!data) return; // Skip if we're trying next URL
        
        console.log('[ChatGPT Analyst] Successfully intercepted conversation data:', {
          url: currentUrl,
          dataSize: JSON.stringify(data).length,
          hasMapping: !!data.mapping,
          mappingKeys: data.mapping ? Object.keys(data.mapping).length : 0,
          title: data.title
        });
        
        // Send success data to content script
        window.postMessage({
          type: 'CHATGPT_CONVERSATION_DATA',
          data: data,
          conversationId: conversationId,
          url: currentUrl,
          timestamp: Date.now()
        }, '*');
      })
      .catch(error => {
        console.warn(`[ChatGPT Analyst] Error with ${currentUrl}:`, error.message);
        
        if (attempts < tryUrls.length) {
          // Try next URL
          tryNextUrl();
        } else {
          // All attempts failed
          console.error('[ChatGPT Analyst] All conversation fetch attempts failed:', error);
          window.postMessage({
            type: 'CHATGPT_CONVERSATION_ERROR',
            error: `Failed to fetch conversation: ${error.message}`,
            conversationId: conversationId,
            url: apiUrl,
            timestamp: Date.now()
          }, '*');
        }
      });
    }
    
    // Start trying URLs
    tryNextUrl();
  });
}

// Handle keyboard shortcuts and manual analysis
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

// Handle manual analysis requests from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualAnalysis" && sender.tab) {
    const tabId = sender.tab.id;
    const conversationId = extractConversationId(sender.tab.url);
    
    if (conversationId) {
      console.log(`[ChatGPT Analyst] Manual analysis requested for conversation: ${conversationId}`);
      
      // Try to fetch current conversation directly
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: interceptConversationResponse,
        args: [`https://chatgpt.com/backend-api/conversation/${conversationId}`, conversationId, 'manual']
      }).catch(error => {
        console.warn('Could not inject manual analysis:', error);
        sendResponse({ error: 'Failed to inject analysis script' });
      });
      
      sendResponse({ success: true, conversationId: conversationId });
    } else {
      sendResponse({ error: 'No conversation ID found in current URL' });
    }
    
    return true; // Keep message channel open
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