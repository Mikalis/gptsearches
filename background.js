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
    
    // Only target the specific conversation endpoint we need
    const isTargetConversationRequest = 
      details.url.includes('/backend-api/conversation/') && 
      details.statusCode === 200 &&
      details.method === 'GET' &&
      !details.url.includes('/textdocs'); // Skip textdocs endpoint
    
    if (isTargetConversationRequest) {
      console.log(`[ChatGPT Analyst] Found target conversation request: ${details.url}`);
      
      // Inject the response interceptor for this specific request
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

// Focused function to intercept conversation response data
function interceptAnyConversationResponse(responseUrl, method) {
  console.log(`[ChatGPT Analyst] 🎯 Setting up interception for: ${method} ${responseUrl}`);
  
  // Get conversation ID from current page
  const conversationId = getCurrentConversationId();
  if (!conversationId) {
    console.log('[ChatGPT Analyst] No conversation ID found');
    return;
  }
  
  console.log(`[ChatGPT Analyst] Target conversation ID: ${conversationId}`);
  
  let foundData = false;
  let originalMethods = {};
  
     // Method 1: Intercept Response.prototype.json() for fetch responses
   originalMethods.responseJson = Response.prototype.json;
   Response.prototype.json = function() {
     const result = originalMethods.responseJson.call(this);
     const url = this.url;
     
     if (url && url.includes('/backend-api/conversation/') && 
         url.includes(conversationId) && !foundData) {
       
       console.log('[ChatGPT Analyst] 🎉 Intercepted Response.json() for:', url);
       
       result.then(data => {
         console.log('[ChatGPT Analyst] 📊 Analyzing response data:', {
           url: url,
           hasData: !!data,
           dataType: typeof data,
           isArray: Array.isArray(data),
           keys: data && typeof data === 'object' ? Object.keys(data) : [],
           hasMapping: !!(data && data.mapping),
           hasDetail: !!(data && data.detail),
           conversationId: data && data.conversation_id ? data.conversation_id : 'not found'
         });
         
         if (isConversationData(data, conversationId)) {
           foundData = true;
           console.log('[ChatGPT Analyst] ✅ Successfully captured conversation data via Response.json!', {
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
           
           // Restore original methods
           restoreOriginalMethods();
         } else {
           console.log('[ChatGPT Analyst] Response data does not match conversation criteria');
           
           // Check if this is an error response
           if (data && data.detail && data.detail.code) {
             console.log('[ChatGPT Analyst] Found error response:', data.detail);
             foundData = true; // Prevent timeout
             restoreOriginalMethods();
           }
         }
       }).catch(e => {
         console.log('[ChatGPT Analyst] JSON parsing failed:', e);
       });
     }
     
     return result;
   };
  
  // Method 2: Intercept XMLHttpRequest for legacy API calls
  originalMethods.xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (url && url.includes('/backend-api/conversation/') && 
        url.includes(conversationId) && !foundData) {
      
      console.log('[ChatGPT Analyst] 🎯 Monitoring XMLHttpRequest to:', url);
      
      this.addEventListener('load', function() {
        if (this.status === 200 && !foundData) {
          try {
            const data = JSON.parse(this.responseText);
            if (isConversationData(data, conversationId)) {
              foundData = true;
              console.log('[ChatGPT Analyst] ✅ Successfully captured conversation data via XMLHttpRequest!');
              
              window.postMessage({
                type: 'CHATGPT_CONVERSATION_DATA',
                data: data,
                conversationId: conversationId,
                url: url,
                timestamp: Date.now(),
                success: true
              }, '*');
              
              restoreOriginalMethods();
            }
          } catch (e) {
            console.log('[ChatGPT Analyst] XHR response was not JSON');
          }
        }
      });
    }
    
    return originalMethods.xhrOpen.call(this, method, url, ...args);
  };
  
  // Auto-restore after 10 seconds
  setTimeout(() => {
    if (!foundData) {
      console.log('[ChatGPT Analyst] ⏰ Timeout - restoring original methods without finding data');
      restoreOriginalMethods();
      
      // Send error if no data found
      window.postMessage({
        type: 'CHATGPT_CONVERSATION_ERROR',
        error: 'Could not capture conversation data from the API response. The conversation might be loading or the response structure has changed.',
        conversationId: conversationId,
        timestamp: Date.now()
      }, '*');
    }
  }, 10000);
  
  function restoreOriginalMethods() {
    if (originalMethods.responseJson) {
      Response.prototype.json = originalMethods.responseJson;
    }
    if (originalMethods.xhrOpen) {
      XMLHttpRequest.prototype.open = originalMethods.xhrOpen;
    }
    console.log('[ChatGPT Analyst] 🔄 Original methods restored');
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
  console.log('[ChatGPT Analyst] Setting up smart response interception...');
  
  const conversationId = getCurrentConversationId();
  if (!conversationId) return;
  
  console.log(`[ChatGPT Analyst] Will intercept responses for conversation: ${conversationId}`);
  
  let foundData = false;
  
  // Smart approach: Intercept Response prototype to capture data
  const originalJson = Response.prototype.json;
  const originalText = Response.prototype.text;
  
  // Override Response.json to capture conversation data
  Response.prototype.json = function() {
    const result = originalJson.call(this);
    const url = this.url;
    
    // Check if this is a conversation-related response
    if (url && url.includes('/backend-api/conversation/') && 
        url.includes(conversationId) && !foundData) {
      
      console.log('[ChatGPT Analyst] 🎯 Intercepting JSON response from:', url);
      
      result.then(data => {
        if (isConversationData(data, conversationId)) {
          foundData = true;
          console.log('[ChatGPT Analyst] 🎉 Successfully intercepted conversation data!', {
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
          
          // Restore original Response methods
          Response.prototype.json = originalJson;
          Response.prototype.text = originalText;
        }
      }).catch(e => {
        console.log('[ChatGPT Analyst] JSON parsing failed:', e);
      });
    }
    
    return result;
  };
  
  // Backup: Monitor XMLHttpRequest for older API calls
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (url && url.includes('/backend-api/conversation/') && 
        url.includes(conversationId)) {
      
      console.log('[ChatGPT Analyst] 🔍 Monitoring XHR to:', url);
      
      this.addEventListener('load', function() {
        if (this.status === 200 && !foundData) {
          try {
            const data = JSON.parse(this.responseText);
            if (isConversationData(data, conversationId)) {
              foundData = true;
              console.log('[ChatGPT Analyst] 🎉 Captured conversation data via XHR!');
              
              window.postMessage({
                type: 'CHATGPT_CONVERSATION_DATA',
                data: data,
                conversationId: conversationId,
                url: url,
                timestamp: Date.now(),
                success: true
              }, '*');
              
              // Restore originals
              XMLHttpRequest.prototype.open = originalXHROpen;
              XMLHttpRequest.prototype.send = originalXHRSend;
              Response.prototype.json = originalJson;
            }
          } catch (e) {
            console.log('[ChatGPT Analyst] XHR response was not JSON');
          }
        }
      });
    }
    
    return originalXHROpen.call(this, method, url, ...args);
  };
  
  // Fallback: Try to extract from Next.js context after delay
  setTimeout(() => {
    if (!foundData) {
      tryExtractFromPageContext(conversationId);
    }
  }, 2000);
  
  // Auto-restore after 20 seconds
  setTimeout(() => {
    if (!foundData) {
      console.log('[ChatGPT Analyst] Timeout - restoring original Response/XHR methods');
      Response.prototype.json = originalJson;
      Response.prototype.text = originalText;
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      
      // Try one more time from DOM
      tryExtractFromPageContext(conversationId);
    }
  }, 20000);
  
  // Helper function to extract from page context
  function tryExtractFromPageContext(conversationId) {
    console.log('[ChatGPT Analyst] Trying to extract from page context...');
    
    // Method 1: Next.js SSR data
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
          return;
        }
      }
    }
    
    // Method 2: Try to find conversation data in window globals
    const globalSources = ['__CONVERSATION_STATE__', '__CHAT_DATA__', '__INITIAL_STATE__'];
    for (const source of globalSources) {
      try {
        const data = window[source];
        if (data && isConversationData(data, conversationId)) {
          foundData = true;
          console.log(`[ChatGPT Analyst] 🎉 Found conversation data in window.${source}!`);
          
          window.postMessage({
            type: 'CHATGPT_CONVERSATION_DATA',
            data: data,
            conversationId: conversationId,
            url: `WINDOW_${source}`,
            timestamp: Date.now(),
            success: true
          }, '*');
          return;
        }
      } catch (e) {
        // Source doesn't exist
      }
    }
    
    // Method 3: Try to extract from React props (ChatGPT uses React)
    const reactRoot = document.querySelector('#__next') || document.querySelector('[data-reactroot]');
    if (reactRoot && reactRoot._reactInternalInstance) {
      console.log('[ChatGPT Analyst] Trying to extract from React instance...');
      // This is more complex and might not work with current React versions
    }
    
    if (!foundData) {
      console.log('[ChatGPT Analyst] Could not extract conversation data from any source');
      window.postMessage({
        type: 'CHATGPT_CONVERSATION_ERROR',
        error: 'Could not capture conversation data. The conversation might be loading or the API structure has changed.',
        conversationId: conversationId,
        timestamp: Date.now()
      }, '*');
    }
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
console.log("[ChatGPT Analyst] Simplified background service worker loaded"); 