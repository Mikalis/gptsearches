// ChatGPT SEO Analyst - Background Service Worker
// Simplified version that mimics user workflow: reload + intercept network traffic

let activeRequests = {};
let capturedConversationData = {};

// Monitor ALL network requests to find conversation data
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const tabId = details.tabId;
    
    // Store request for matching with response
    activeRequests[details.requestId] = {
      url: details.url,
      tabId: tabId,
      timestamp: Date.now(),
      method: details.method
    };
    
    console.log(`[ChatGPT Analyst] Monitoring request: ${details.method} ${details.url}`);
    
    return {cancel: false};
  },
  {
    urls: [
      "https://chatgpt.com/*",
      "https://*.chatgpt.com/*"
    ]
  },
  ["requestBody"]
);

// Intercept responses that contain conversation data
chrome.webRequest.onCompleted.addListener(
  function(details) {
    const requestInfo = activeRequests[details.requestId];
    if (!requestInfo) return;
    
    const tabId = requestInfo.tabId;
    
    // Log all completed requests for debugging
    console.log(`[ChatGPT Analyst] Response: ${details.method} ${details.url} -> ${details.statusCode}`);
    
    // Look for any request that might contain conversation data
    const isConversationRelated = 
      details.url.includes('/backend-api/') && 
      details.statusCode === 200 &&
      (details.method === 'GET' || details.method === 'POST');
    
    if (isConversationRelated) {
      console.log(`[ChatGPT Analyst] Found potential conversation data: ${details.url}`);
      
      // Try to intercept this response
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: interceptAnyConversationResponse,
        args: [details.url, details.method]
      }).catch(error => {
        console.warn('Could not inject interceptor:', error);
      });
    }
    
    // Clean up
    delete activeRequests[details.requestId];
  },
  {
    urls: [
      "https://chatgpt.com/*",
      "https://*.chatgpt.com/*"
    ]
  },
  ["responseHeaders"]
);

// Simplified function to intercept any response that might contain conversation data
function interceptAnyConversationResponse(responseUrl, method) {
  console.log(`[ChatGPT Analyst] Intercepting: ${method} ${responseUrl}`);
  
  // Get conversation ID from current page
  const conversationId = getCurrentConversationId();
  if (!conversationId) {
    console.log('[ChatGPT Analyst] No conversation ID found');
    return;
  }
  
  console.log(`[ChatGPT Analyst] Looking for conversation ID: ${conversationId}`);
  
  // Override fetch to capture responses
  const originalFetch = window.fetch;
  
  // Monitor all fetch requests for conversation data
  window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    
    result.then(response => {
      const url = args[0];
      
      // Check if this response might contain our conversation data
      if (typeof url === 'string' && 
          url.includes('/backend-api/') && 
          response.ok) {
        
        // Clone response to read without consuming original
        response.clone().json().then(data => {
          
          // Check if this data contains our conversation
          if (isConversationData(data, conversationId)) {
            console.log('[ChatGPT Analyst] Found conversation data!', {
              url: url,
              method: response.method || 'GET',
              dataSize: JSON.stringify(data).length,
              hasMapping: !!data.mapping,
              title: data.title
            });
            
            // Send to content script
            window.postMessage({
              type: 'CHATGPT_CONVERSATION_DATA',
              data: data,
              conversationId: conversationId,
              url: url,
              timestamp: Date.now()
            }, '*');
            
            // Restore original fetch
            window.fetch = originalFetch;
          }
        }).catch(e => {
          // Not JSON or other error, ignore
        });
      }
    }).catch(e => {
      // Request failed, ignore
    });
    
    return result;
  };
  
  // Restore fetch after 10 seconds if no data found
  setTimeout(() => {
    window.fetch = originalFetch;
    console.log('[ChatGPT Analyst] Fetch monitoring timeout');
  }, 10000);
  
  // Helper function to check if data contains conversation
  function isConversationData(data, targetId) {
    if (!data || typeof data !== 'object') return false;
    
    // Check if this is conversation data
    if (data.mapping && Object.keys(data.mapping).length > 0) {
      // Check if conversation ID matches
      if (data.conversation_id === targetId) {
        return true;
      }
      
      // Or check if URL contained the ID
      if (data.id === targetId) {
        return true;
      }
      
      // Or check if any message references our conversation
      for (const nodeId in data.mapping) {
        const node = data.mapping[nodeId];
        if (node && node.message) {
          return true; // Found message structure, likely our conversation
        }
      }
    }
    
    return false;
  }
  
  function getCurrentConversationId() {
    const match = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }
}

// Handle manual analysis with page reload
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualAnalysis" && sender.tab) {
    const tabId = sender.tab.id;
    const conversationId = extractConversationId(sender.tab.url);
    
    if (conversationId) {
      console.log(`[ChatGPT Analyst] Manual analysis requested for: ${conversationId}`);
      console.log(`[ChatGPT Analyst] Will reload page to capture fresh network traffic`);
      
      // First, inject our interceptor
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: setupNetworkInterception
      });
      
      // Then reload the page after a short delay
      setTimeout(() => {
        chrome.tabs.reload(tabId);
      }, 500);
      
      sendResponse({ success: true, conversationId: conversationId, action: 'reloading' });
    } else {
      sendResponse({ error: 'No conversation ID found in current URL' });
    }
    
    return true;
  }
});

// Function to setup network interception before page reload
function setupNetworkInterception() {
  console.log('[ChatGPT Analyst] Setting up network interception...');
  
  const conversationId = getCurrentConversationId();
  if (!conversationId) return;
  
  console.log(`[ChatGPT Analyst] Will monitor for conversation: ${conversationId}`);
  
  // Store original fetch
  const originalFetch = window.fetch;
  
  // Override fetch to monitor all requests
  window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    const url = args[0];
    
    // Monitor the result
    result.then(response => {
      if (response.ok && typeof url === 'string' && url.includes('/backend-api/')) {
        
        // Clone and check response
        response.clone().json().then(data => {
          if (isConversationData(data, conversationId)) {
            console.log('[ChatGPT Analyst] 🎉 Found conversation data after reload!', {
              url: url,
              dataSize: JSON.stringify(data).length,
              hasMapping: !!data.mapping,
              mappingKeys: data.mapping ? Object.keys(data.mapping).length : 0,
              title: data.title
            });
            
            // Send success data
            window.postMessage({
              type: 'CHATGPT_CONVERSATION_DATA',
              data: data,
              conversationId: conversationId,
              url: url,
              timestamp: Date.now()
            }, '*');
            
            // Restore fetch
            window.fetch = originalFetch;
          }
        }).catch(() => {
          // Not JSON, ignore
        });
      }
    }).catch(() => {
      // Request failed, ignore  
    });
    
    return result;
  };
  
  // Auto-restore after 15 seconds
  setTimeout(() => {
    window.fetch = originalFetch;
  }, 15000);
  
  // Helper functions
  function isConversationData(data, targetId) {
    return data && 
           data.mapping && 
           Object.keys(data.mapping).length > 0 &&
           (data.conversation_id === targetId || data.id === targetId || hasMessageStructure(data));
  }
  
  function hasMessageStructure(data) {
    if (!data.mapping) return false;
    for (const nodeId in data.mapping) {
      const node = data.mapping[nodeId];
      if (node && node.message && node.message.content) {
        return true;
      }
    }
    return false;
  }
  
  function getCurrentConversationId() {
    const match = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle_overlay") {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url.includes("chatgpt.com")) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "toggleOverlay"});
      }
    });
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete capturedConversationData[tabId];
});

// Extract conversation ID from ChatGPT URL
function extractConversationId(url) {
  const match = url.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

console.log("[ChatGPT Analyst] Simplified background service worker loaded"); 