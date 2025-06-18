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
  
  // Also detach debugger when tab is loading a new page
  if (changeInfo.status === 'loading') {
    chrome.debugger.getTargets((targets) => {
      const stillAttached = targets.some(target => 
        target.tabId === tabId && target.attached);
      
      if (stillAttached) {
        console.log('[ChatGPT Analyst] Tab navigating - detaching debugger from tab:', tabId);
        try {
          chrome.debugger.detach({tabId}, () => {
            if (chrome.runtime.lastError) {
              console.log('[ChatGPT Analyst] Debugger already detached during navigation:', chrome.runtime.lastError.message);
            }
          });
        } catch (error) {
          console.log('[ChatGPT Analyst] Error detaching debugger during navigation:', error.message);
        }
      }
    });
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
  
  // Also detach debugger if still attached
  chrome.debugger.getTargets((targets) => {
    const stillAttached = targets.some(target => 
      target.tabId === tabId && target.attached);
    
    if (stillAttached) {
      console.log('[ChatGPT Analyst] Tab closed - detaching debugger from tab:', tabId);
      try {
        chrome.debugger.detach({tabId}, () => {
          if (chrome.runtime.lastError) {
            console.log('[ChatGPT Analyst] Debugger already detached on tab close:', chrome.runtime.lastError.message);
          }
        });
      } catch (error) {
        console.log('[ChatGPT Analyst] Error detaching debugger on tab close:', error.message);
      }
    }
  });
});

// Extract conversation ID from URL
function extractConversationIdFromUrl(url) {
  const match = url.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

console.log("[ChatGPT Analyst] Network monitoring background script loaded");

// ---------------- Debugger-based response capture -----------------

// Message listener for debugger capture
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'debuggerCapture' && sender.tab) {
    console.log('[ChatGPT Analyst] Received debuggerCapture request:', request.conversationId);
    
    captureConversationData(sender.tab.id);
    sendResponse({success: true, message: 'Debugger capture initiated'});
    return true;
  }
});



function captureConversationData(tabId) {
  console.log('[ChatGPT Analyst] 🕷️ Attaching debugger to tab:', tabId);
  
  let dataCaptured = false; // Flag to track if we've captured data
  
  // Enable Network domain to capture requests
  chrome.debugger.enable({tabId}, "1.0", () => {
    if (chrome.runtime.lastError) {
      console.error('[ChatGPT Analyst] Failed to enable debugger:', chrome.runtime.lastError.message);
      chrome.tabs.sendMessage(tabId, {
        action: 'debuggerError',
        error: `Failed to enable debugger: ${chrome.runtime.lastError.message}`
      });
      return;
    }
    
    console.log('[ChatGPT Analyst] Debugger enabled, enabling Network domain...');
    
    chrome.debugger.sendCommand({tabId}, "Network.enable", {}, (result) => {
      if (chrome.runtime.lastError) {
        console.error('[ChatGPT Analyst] Failed to enable Network domain:', chrome.runtime.lastError.message);
        chrome.tabs.sendMessage(tabId, {
          action: 'debuggerError',
          error: `Failed to enable Network domain: ${chrome.runtime.lastError.message}`
        });
        return;
      }
      
      console.log('[ChatGPT Analyst] Network domain enabled, listening for responses...');
    });
    
    // Listen for network events
    const onDebuggerEvent = (debuggeeId, message, params) => {
      if (debuggeeId.tabId !== tabId) return;
      
      if (message === 'Network.responseReceived') {
        const url = params.response.url;
        
        // Check if this is a conversation API call
        if (url.includes('/backend-api/conversation/') && !url.includes('/continue')) {
          console.log('[ChatGPT Analyst] 📡 Detected conversation API response:', url);
          
          // Get the response body
          chrome.debugger.sendCommand({tabId}, "Network.getResponseBody", {
            requestId: params.requestId
          }, (result) => {
            if (chrome.runtime.lastError) {
              console.log('[ChatGPT Analyst] Could not get response body:', chrome.runtime.lastError.message);
              return;
            }
            
            if (result && result.body) {
              console.log('[ChatGPT Analyst] ✅ Successfully captured conversation data');
              dataCaptured = true; // Mark data as captured
              
              try {
                const data = JSON.parse(result.body);
                const conversationId = url.match(/conversation\/([^\/\?]+)/)?.[1];
                
                // Send data to content script
                chrome.tabs.sendMessage(tabId, {
                  action: 'networkData',
                  data: data,
                  url: url,
                  conversationId: conversationId,
                  timestamp: Date.now(),
                  source: 'debugger_capture'
                });
                
                // Detach debugger after successful capture
                chrome.debugger.onEvent.removeListener(onDebuggerEvent);
                try {
                  chrome.debugger.detach({tabId}, () => {
                    if (chrome.runtime.lastError) {
                      console.log('[ChatGPT Analyst] Debugger already detached after capture:', chrome.runtime.lastError.message);
                    }
                  });
                } catch (error) {
                  console.log('[ChatGPT Analyst] Error detaching debugger after capture:', error.message);
                }
                
              } catch (error) {
                console.error('[ChatGPT Analyst] Error parsing conversation data:', error);
              }
            }
          });
        }
      }
    };
    
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    
    // Auto-detach after timeout
    setTimeout(() => {
      chrome.debugger.getTargets((targets) => {
        const stillAttached = targets.some(target => 
          target.tabId === tabId && target.attached);
        
        if (stillAttached) {
          console.log('[ChatGPT Analyst] ⏰ Timeout - detaching debugger');
          chrome.debugger.onEvent.removeListener(onDebuggerEvent);
          
          // Safe detach with error handling
          try {
            chrome.debugger.detach({tabId}, () => {
              if (chrome.runtime.lastError) {
                console.log('[ChatGPT Analyst] Debugger already detached:', chrome.runtime.lastError.message);
              }
            });
          } catch (error) {
            console.log('[ChatGPT Analyst] Error detaching debugger:', error.message);
          }
          
          // Only show timeout error if no data was captured
          if (!dataCaptured) {
            // Check if we've already sent data before showing error
            chrome.tabs.sendMessage(tabId, {action: 'checkDataReceived'}, (response) => {
              if (chrome.runtime.lastError) {
                console.log('[ChatGPT Analyst] Tab communication error:', chrome.runtime.lastError.message);
                return;
              }
              
              // Only show error if we haven't received data yet
              if (!response || !response.dataReceived) {
                chrome.tabs.sendMessage(tabId, {
                  action: 'debuggerError',
                  error: 'Timeout waiting for conversation data. Try refreshing the page manually.'
                });
              } else {
                console.log('[ChatGPT Analyst] Skipping timeout error - data already received');
              }
            });
          } else {
            console.log('[ChatGPT Analyst] Skipping timeout error - data was captured during session');
          }
        }
      });
    }, 60000);
  });
} 