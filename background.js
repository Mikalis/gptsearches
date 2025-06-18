// Simple background service worker for ChatGPT Analyst Extension
// Monitors network requests and captures conversation data on page refresh

let capturedConversationData = {};
let pendingAnalysis = {};

// Monitor all requests to ChatGPT backend API
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    
    // Only monitor GET requests to conversation endpoints
    if (details.method === 'GET' && 
        url.includes('/backend-api/conversation/') && 
        !url.includes('/textdocs') && 
        !url.includes('/attachments')) {
      
      const conversationId = extractConversationIdFromUrl(url);
      if (conversationId) {
        console.log(`[ChatGPT Analyst] 🎯 Monitoring request: ${details.method} ${url}`);
        
        // Store request details for later matching with response
        pendingAnalysis[details.requestId] = {
          url: url,
          conversationId: conversationId,
          tabId: details.tabId,
          timestamp: Date.now()
        };
      }
    }
  },
  {
    urls: [
      "https://chatgpt.com/backend-api/*",
      "https://*.chatgpt.com/backend-api/*"
    ]
  },
  ["requestBody"]
);

// Capture response headers and try to intercept JSON data
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const requestInfo = pendingAnalysis[details.requestId];
    
    if (requestInfo && details.statusCode === 200) {
      console.log(`[ChatGPT Analyst] ✅ Response: ${details.method} ${requestInfo.url} -> ${details.statusCode}`);
      
      // Inject script to capture the response data
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        world: 'MAIN',
        func: captureConversationResponse,
        args: [requestInfo.url, requestInfo.conversationId]
      }).catch(err => {
        console.log('[ChatGPT Analyst] Could not inject capture script:', err);
      });
      
      // Clean up
      delete pendingAnalysis[details.requestId];
    }
  },
  {
    urls: [
      "https://chatgpt.com/backend-api/*",
      "https://*.chatgpt.com/backend-api/*"
    ]
  },
  ["responseHeaders"]
);

// Function to inject into page to capture response data
function captureConversationResponse(targetUrl, conversationId) {
  console.log(`[ChatGPT Analyst] 🔍 Setting up response capture for: ${targetUrl}`);
  
  let foundData = false;
  
  // Override fetch to capture the response
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    
    result.then(response => {
      if (response.url === targetUrl && !foundData) {
        console.log(`[ChatGPT Analyst] 🎉 Captured response for: ${response.url}`);
        
        // Clone the response to avoid consuming it
        const responseClone = response.clone();
        responseClone.json().then(data => {
          if (data && (data.mapping || data.conversation_id)) {
            foundData = true;
            console.log('[ChatGPT Analyst] ✅ Found conversation data in response!', {
              url: response.url,
              hasMapping: !!data.mapping,
              mappingKeys: data.mapping ? Object.keys(data.mapping).length : 0,
              conversationId: data.conversation_id || data.id,
              title: data.title
            });
            
            // Send data to content script
            window.postMessage({
              type: 'CHATGPT_NETWORK_DATA',
              data: data,
              conversationId: conversationId,
              url: response.url,
              timestamp: Date.now(),
              source: 'network_capture'
            }, '*');
            
            // Restore original fetch
            window.fetch = originalFetch;
          }
        }).catch(e => {
          console.log('[ChatGPT Analyst] Could not parse JSON from response:', e);
        });
      }
    }).catch(e => {
      console.log('[ChatGPT Analyst] Fetch error:', e);
    });
    
    return result;
  };
  
  // Auto-restore after 10 seconds
  setTimeout(() => {
    if (!foundData) {
      console.log('[ChatGPT Analyst] ⏰ Timeout - restoring original fetch');
      window.fetch = originalFetch;
    }
  }, 10000);
}

// Handle manual refresh request
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refreshAndCapture" && sender.tab) {
    const tabId = sender.tab.id;
    const conversationId = extractConversationIdFromUrl(sender.tab.url);
    
    if (conversationId) {
      console.log(`[ChatGPT Analyst] 🔄 Refreshing tab ${tabId} to capture conversation: ${conversationId}`);
      
      // Mark this tab for monitoring
      capturedConversationData[tabId] = {
        conversationId: conversationId,
        startTime: Date.now(),
        isRefreshing: true
      };
      
      // Refresh the tab
      chrome.tabs.reload(tabId);
      
      sendResponse({ 
        success: true, 
        conversationId: conversationId,
        action: 'refreshing'
      });
      
      // Clean up after 30 seconds
      setTimeout(() => {
        if (capturedConversationData[tabId] && capturedConversationData[tabId].isRefreshing) {
          console.log(`[ChatGPT Analyst] Clearing refresh flag for tab ${tabId} after timeout`);
          delete capturedConversationData[tabId];
        }
      }, 30000);
      
    } else {
      sendResponse({ 
        error: 'No conversation ID found in current URL' 
      });
    }
    
    return true;
  } else if (request.action === "clearRefreshFlag" && sender.tab) {
    const tabId = sender.tab.id;
    console.log(`[ChatGPT Analyst] Data captured successfully for tab ${tabId}, clearing refresh flag`);
    delete capturedConversationData[tabId];
    sendResponse({ success: true });
    return true;
  }
});

// Monitor tab navigation to detect refreshes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && tab.url.includes('chatgpt.com/c/')) {
    const conversationId = extractConversationIdFromUrl(tab.url);
    
    if (conversationId && capturedConversationData[tabId] && capturedConversationData[tabId].isRefreshing) {
      console.log(`[ChatGPT Analyst] 🔄 Tab ${tabId} is refreshing, monitoring for conversation: ${conversationId}`);
      
      // Inject monitoring script early
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          world: 'MAIN',
          func: setupNetworkMonitoring,
          args: [conversationId]
        }).catch(err => {
          console.log('[ChatGPT Analyst] Could not inject monitoring script:', err);
        });
      }, 1000);
    }
  }
});

// Setup comprehensive network monitoring
function setupNetworkMonitoring(conversationId) {
  console.log(`[ChatGPT Analyst] 🎯 Setting up network monitoring for conversation: ${conversationId}`);
  
  let foundData = false;
  
  // Method 1: Override XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (url && url.includes('/backend-api/conversation/') && 
        url.includes(conversationId) && 
        !url.includes('/textdocs') && 
        !url.includes('/attachments')) {
      
      console.log(`[ChatGPT Analyst] 🔍 Monitoring XHR: ${method} ${url}`);
      
      this.addEventListener('load', function() {
        if (this.status === 200 && !foundData) {
          try {
            const data = JSON.parse(this.responseText);
            if (data && (data.mapping || data.conversation_id)) {
              foundData = true;
              console.log('[ChatGPT Analyst] ✅ Captured conversation data via XHR!');
              
              // Send to content script
              window.postMessage({
                type: 'CHATGPT_NETWORK_DATA',
                data: data,
                conversationId: conversationId,
                url: url,
                timestamp: Date.now(),
                source: 'xhr_capture'
              }, '*');
              
              // Restore originals
              XMLHttpRequest.prototype.open = originalXHROpen;
              XMLHttpRequest.prototype.send = originalXHRSend;
            }
          } catch (e) {
            console.log('[ChatGPT Analyst] XHR response was not JSON');
          }
        }
      });
    }
    
    return originalXHROpen.call(this, method, url, ...args);
  };
  
  // Method 2: Override fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const result = originalFetch.apply(this, args);
    
    result.then(response => {
      const url = response.url;
      if (url && url.includes('/backend-api/conversation/') && 
          url.includes(conversationId) && 
          !url.includes('/textdocs') && 
          !url.includes('/attachments') && 
          !foundData) {
        
        console.log(`[ChatGPT Analyst] 🔍 Monitoring fetch: ${url}`);
        
        const responseClone = response.clone();
        responseClone.json().then(data => {
          if (data && (data.mapping || data.conversation_id) && !foundData) {
            foundData = true;
            console.log('[ChatGPT Analyst] ✅ Captured conversation data via fetch!');
            
            // Send to content script
            window.postMessage({
              type: 'CHATGPT_NETWORK_DATA',
              data: data,
              conversationId: conversationId,
              url: url,
              timestamp: Date.now(),
              source: 'fetch_capture'
            }, '*');
            
            // Restore original
            window.fetch = originalFetch;
          }
        }).catch(e => {
          console.log('[ChatGPT Analyst] Fetch response was not JSON');
        });
      }
    }).catch(e => {
      // Ignore fetch errors
    });
    
    return result;
  };
  
  // Auto-restore after 15 seconds
  setTimeout(() => {
    if (!foundData) {
      console.log('[ChatGPT Analyst] ⏰ Timeout - restoring original network methods');
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      window.fetch = originalFetch;
    }
  }, 15000);
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
  delete pendingAnalysis[tabId];
});

// Extract conversation ID from URL
function extractConversationIdFromUrl(url) {
  const match = url.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

console.log("[ChatGPT Analyst] Network monitoring background script loaded");

// ---------------- Debugger-based response capture -----------------
function attachDebuggerAndCapture(tabId, conversationId) {
  chrome.debugger.attach({tabId}, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.warn('[ChatGPT Analyst] Debugger attach failed:', chrome.runtime.lastError.message);
      return;
    }
    console.log(`[ChatGPT Analyst] 🐞 Debugger attached to tab ${tabId}`);
    chrome.debugger.sendCommand({tabId}, 'Network.enable');
  });
  
  function onEvent(source, method, params) {
    if (source.tabId !== tabId) return;
    if (method === 'Network.responseReceived') {
      const {requestId, response} = params;
      if (response.mimeType === 'application/json' &&
          response.url.includes('/backend-api/conversation/') &&
          response.url.includes(conversationId) &&
          !response.url.includes('/textdocs') &&
          !response.url.includes('/attachments')) {
        console.log('[ChatGPT Analyst] 🎯 Debugger matched response:', response.url);
        chrome.debugger.sendCommand({tabId}, 'Network.getResponseBody', {requestId}, (bodyResult) => {
          if (chrome.runtime.lastError) {
            console.warn('[ChatGPT Analyst] getResponseBody error:', chrome.runtime.lastError.message);
            return;
          }
          let body = bodyResult.body;
          if (bodyResult.base64Encoded) {
            body = atob(body);
          }
          try {
            const jsonData = JSON.parse(body);
            console.log('[ChatGPT Analyst] ✅ Debugger captured JSON');
            // send to content script
            chrome.tabs.sendMessage(tabId, {
              action: 'networkData',
              source: 'debugger_capture',
              url: response.url,
              conversationId,
              timestamp: Date.now(),
              data: jsonData
            });
          } catch(e) {
            console.warn('[ChatGPT Analyst] JSON parse error debugger:', e);
          }
          // Detach after first capture
          chrome.debugger.onEvent.removeListener(onEvent);
          chrome.debugger.detach({tabId});
          console.log('[ChatGPT Analyst] 🐞 Debugger detached');
        });
      }
    }
  }
  chrome.debugger.onEvent.addListener(onEvent);
}

// Message listener for debugger capture
chrome.runtime.onMessage.addListener((request, sender, sendResponse)=>{
  if(request.action==='debuggerCapture' && sender.tab){
    attachDebuggerAndCapture(sender.tab.id, request.conversationId);
    sendResponse({success:true});
    return true;
  }
}); 