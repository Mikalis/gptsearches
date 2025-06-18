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
  
  // Instead of overriding fetch, use a response listener approach
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  // Store original fetch for monitoring without breaking auth
  const originalFetch = window.fetch;
  let foundData = false;
  
  // Monitor responses without interfering with requests
  const responseObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('/backend-api/conversation/') && 
          entry.name.includes(conversationId) &&
          !foundData) {
        
        console.log('[ChatGPT Analyst] Found conversation API call:', entry.name);
        
        // Try to get the response data using a different approach
        setTimeout(() => {
          tryExtractConversationFromDOM(conversationId);
        }, 1000);
      }
    }
  });
  
  responseObserver.observe({ entryTypes: ['resource'] });
  
  // Also try to monitor successful fetch responses more carefully
  window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    const url = args[0];
    
    if (typeof url === 'string' && 
        url.includes('/backend-api/conversation/') && 
        url.includes(conversationId)) {
      
      console.log('[ChatGPT Analyst] Monitoring conversation fetch:', url);
      
      result.then(response => {
        if (response.ok && !foundData) {
          // Clone response and try to read it
          response.clone().json().then(data => {
            if (isConversationData(data, conversationId)) {
              foundData = true;
              console.log('[ChatGPT Analyst] Successfully captured conversation data!', {
                url: url,
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
                timestamp: Date.now(),
                success: true
              }, '*');
              
              // Cleanup
              responseObserver.disconnect();
              window.fetch = originalFetch;
            }
          }).catch(e => {
            console.log('[ChatGPT Analyst] Could not parse JSON from response');
          });
        }
      }).catch(e => {
        console.log('[ChatGPT Analyst] Request failed:', e.message);
      });
    }
    
    return result;
  };
  
  // Restore after timeout
  setTimeout(() => {
    if (!foundData) {
      console.log('[ChatGPT Analyst] Timeout - restoring original fetch');
      window.fetch = originalFetch;
      responseObserver.disconnect();
    }
  }, 15000);
  
  // Helper function to extract conversation data from DOM or other sources
  function tryExtractConversationFromDOM(conversationId) {
    // Try to find conversation data in the page's javascript context
    if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
      console.log('[ChatGPT Analyst] Found Next.js data, searching for conversation...');
      
      const props = window.__NEXT_DATA__.props;
      if (props.pageProps && props.pageProps.serverResponse) {
        const serverData = props.pageProps.serverResponse.data;
        if (isConversationData(serverData, conversationId)) {
          foundData = true;
          console.log('[ChatGPT Analyst] Found conversation data in Next.js context!');
          
          window.postMessage({
            type: 'CHATGPT_CONVERSATION_DATA',
            data: serverData,
            conversationId: conversationId,
            url: 'DOM_EXTRACTION',
            timestamp: Date.now(),
            success: true
          }, '*');
          
          return;
        }
      }
    }
    
    // Try to look for conversation data in window globals
    const possibleDataSources = [
      'window.__INITIAL_STATE__',
      'window.__PRELOADED_STATE__',
      'window.__CONVERSATION_DATA__'
    ];
    
    for (const source of possibleDataSources) {
      try {
        const data = eval(source);
        if (data && isConversationData(data, conversationId)) {
          foundData = true;
          console.log(`[ChatGPT Analyst] Found conversation data in ${source}!`);
          
          window.postMessage({
            type: 'CHATGPT_CONVERSATION_DATA',
            data: data,
            conversationId: conversationId,
            url: source,
            timestamp: Date.now(),
            success: true
          }, '*');
          
          return;
        }
      } catch (e) {
        // Source doesn't exist or not accessible
      }
    }
    
    console.log('[ChatGPT Analyst] Could not find conversation data in DOM context');
  }
  
  // Helper function to check if data contains conversation
  function isConversationData(data, targetId) {
    if (!data || typeof data !== 'object') return false;
    
    // Check for error responses first
    if (data.detail && data.detail.code === 'conversation_not_found') {
      console.log('[ChatGPT Analyst] Conversation not found:', data.detail.message);
      window.postMessage({
        type: 'CHATGPT_CONVERSATION_ERROR',
        error: `Conversation not found: ${data.detail.message}. Please try with a different active conversation.`,
        conversationId: targetId,
        timestamp: Date.now()
      }, '*');
      return false;
    }
    
    // Check if this is conversation data
    if (data.mapping && Object.keys(data.mapping).length > 0) {
      // Check if conversation ID matches exactly
      if (data.conversation_id === targetId) {
        return true;
      }
      
      // Or check if URL contained the ID
      if (data.id === targetId) {
        return true;
      }
      
      // Or if we have message structure, consider it valid conversation data
      // (for cases where ID might not match exactly but we have real conversation data)
      const hasValidMessages = Object.values(data.mapping).some(node => 
        node && node.message && node.message.content && node.message.author
      );
      
      if (hasValidMessages) {
        console.log('[ChatGPT Analyst] Found conversation data with valid message structure');
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

// Handle manual analysis with page reload
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualAnalysis" && sender.tab) {
    const tabId = sender.tab.id;
    const conversationId = extractConversationId(sender.tab.url);
    
    if (conversationId) {
      console.log(`[ChatGPT Analyst] Manual analysis requested for: ${conversationId}`);
      
      // Check if we're already in a reload cycle for this tab
      if (capturedConversationData[tabId] && capturedConversationData[tabId].isReloading) {
        console.log(`[ChatGPT Analyst] Already reloading tab ${tabId}, skipping...`);
        sendResponse({ error: 'Page is already reloading, please wait...' });
        return true;
      }
      
      // Mark this tab as being reloaded
      capturedConversationData[tabId] = {
        isReloading: true,
        conversationId: conversationId,
        startTime: Date.now()
      };
      
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
      
      // Clear reload flag after 30 seconds to prevent permanent blocking
      setTimeout(() => {
        if (capturedConversationData[tabId] && capturedConversationData[tabId].isReloading) {
          console.log(`[ChatGPT Analyst] Clearing reload flag for tab ${tabId} after timeout`);
          delete capturedConversationData[tabId];
        }
      }, 30000);
      
      sendResponse({ success: true, conversationId: conversationId, action: 'reloading' });
    } else {
      sendResponse({ error: 'No conversation ID found in current URL' });
    }
    
    return true;
  } else if (request.action === "clearReloadFlag" && sender.tab) {
    const tabId = sender.tab.id;
    console.log(`[ChatGPT Analyst] Clearing reload flag for tab ${tabId} - data successfully captured`);
    delete capturedConversationData[tabId];
    sendResponse({ success: true });
    return true;
  }
});

// Function to setup network interception before page reload
function setupNetworkInterception() {
  console.log('[ChatGPT Analyst] Setting up network interception...');
  
  const conversationId = getCurrentConversationId();
  if (!conversationId) return;
  
  console.log(`[ChatGPT Analyst] Will monitor for conversation: ${conversationId}`);
  
  let foundData = false;
  
  // Use PerformanceObserver to monitor network activity without breaking auth
  const responseObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name.includes('/backend-api/conversation/') && 
          entry.name.includes(conversationId) &&
          !foundData) {
        
        console.log('[ChatGPT Analyst] 🎯 Detected conversation API call after reload:', entry.name);
        
        // Wait a bit for response to be processed, then try to extract
        setTimeout(() => {
          tryExtractFromPageContext(conversationId);
        }, 500);
      }
    }
  });
  
  responseObserver.observe({ entryTypes: ['resource'] });
  
  // Also try direct monitoring of specific conversation endpoint
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    const url = args[0];
    
    // Only monitor the specific conversation endpoint to avoid auth issues
    if (typeof url === 'string' && 
        url.includes(`/backend-api/conversation/${conversationId}`) &&
        !url.includes('/textdocs') && // Skip textdocs endpoint
        !foundData) {
      
      console.log('[ChatGPT Analyst] 🔍 Monitoring specific conversation endpoint:', url);
      
      result.then(response => {
        if (response.ok) {
          response.clone().json().then(data => {
            if (isConversationData(data, conversationId)) {
              foundData = true;
              console.log('[ChatGPT Analyst] 🎉 Successfully captured conversation data after reload!', {
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
                timestamp: Date.now(),
                success: true
              }, '*');
              
              // Cleanup
              window.fetch = originalFetch;
              responseObserver.disconnect();
            }
          }).catch(() => {
            console.log('[ChatGPT Analyst] Response was not JSON');
          });
        }
      }).catch((e) => {
        console.log('[ChatGPT Analyst] Fetch failed:', e.message);
      });
    }
    
    return result;
  };
  
  // Auto-restore after 15 seconds
  setTimeout(() => {
    if (!foundData) {
      console.log('[ChatGPT Analyst] Timeout - cleaning up network interception');
      window.fetch = originalFetch;
      responseObserver.disconnect();
    }
  }, 15000);
  
  // Helper function to extract from page context
  function tryExtractFromPageContext(conversationId) {
    // Try to extract from Next.js data
    if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
      const props = window.__NEXT_DATA__.props;
      if (props.pageProps && props.pageProps.serverResponse) {
        const data = props.pageProps.serverResponse.data;
        if (isConversationData(data, conversationId)) {
          foundData = true;
          console.log('[ChatGPT Analyst] 🎉 Found conversation data in Next.js SSR data!');
          
          window.postMessage({
            type: 'CHATGPT_CONVERSATION_DATA',
            data: data,
            conversationId: conversationId,
            url: 'NEXTJS_SSR_DATA',
            timestamp: Date.now(),
            success: true
          }, '*');
          
          responseObserver.disconnect();
          return;
        }
      }
    }
    
    console.log('[ChatGPT Analyst] Could not extract conversation data from page context');
  }
  
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