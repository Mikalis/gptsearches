// ChatGPT Analyst - Background Script
console.log("[ChatGPT Analyst] Background script loaded");

// Extract conversation ID from URL
function extractConversationId(url) {
  if (!url) return null;
  
  // Match conversation ID in various URL patterns
  const patterns = [
    /chatgpt\.com\/c\/([a-zA-Z0-9-]+)/,
    /chatgpt\.com\/conversation\/([a-zA-Z0-9-]+)/,
    /chatgpt\.com\/chat\/([a-zA-Z0-9-]+)/,
    /chat\.openai\.com\/c\/([a-zA-Z0-9-]+)/,
    /chat\.openai\.com\/conversation\/([a-zA-Z0-9-]+)/,
    /chat\.openai\.com\/chat\/([a-zA-Z0-9-]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Always return false for asynchronous operations
  // This prevents "message channel closed" errors
  
  if (request.action === "analyzeConversation") {
    const tabId = sender.tab.id;
    const manual = request.manual || false;
    
    // Get conversation ID from URL
    chrome.tabs.get(tabId, (tab) => {
      const url = tab.url;
      const conversationId = extractConversationId(url);
      
      if (conversationId) {
        console.log('[ChatGPT Analyst] 🔍 Analyzing conversation:', conversationId);
        captureConversationData(tabId, manual);
      } else {
        console.log('[ChatGPT Analyst] ⚠️ No conversation ID found in URL:', url);
        chrome.tabs.sendMessage(tabId, {
          action: 'debuggerError',
          error: 'No conversation ID found in URL. Please make sure you are on a ChatGPT conversation page.'
        });
      }
    });
  }
  
  // Return false to indicate we're not using sendResponse() synchronously
  return false;
});

function captureConversationData(tabId, manual = false) {
  console.log('[ChatGPT Analyst] 🔍 Setting up debugger for tab:', tabId);
  
  // Get conversation ID from URL
  chrome.tabs.get(tabId, (tab) => {
    const url = tab.url;
    const conversationId = extractConversationId(url);
    
    if (!conversationId) {
      console.log('[ChatGPT Analyst] ⚠️ No conversation ID found in URL:', url);
      chrome.tabs.sendMessage(tabId, {
        action: 'debuggerError',
        error: 'No conversation ID found in URL. Please make sure you are on a ChatGPT conversation page.'
      });
      return;
    }
    
    console.log('[ChatGPT Analyst] Found conversation ID:', conversationId);
    
    // Check if we're already attached to this tab
    chrome.debugger.getTargets((targets) => {
      const alreadyAttached = targets.some(target => 
        target.tabId === tabId && target.attached);
      
      if (alreadyAttached) {
        console.log('[ChatGPT Analyst] Already attached to tab:', tabId);
        // Try to trigger the network request directly
        triggerConversationRequest(tabId, conversationId);
        return;
      }
      
      // Attach debugger to tab
      chrome.debugger.attach({tabId}, '1.3', () => {
        if (chrome.runtime.lastError) {
          console.error('[ChatGPT Analyst] Error attaching debugger:', chrome.runtime.lastError);
          chrome.tabs.sendMessage(tabId, {
            action: 'debuggerError',
            error: `Error attaching debugger: ${chrome.runtime.lastError.message}`
          });
          return;
        }
        
        console.log('[ChatGPT Analyst] Debugger attached to tab:', tabId);
        
        // Enable Network domain
        chrome.debugger.sendCommand({tabId}, 'Network.enable', {}, () => {
          if (chrome.runtime.lastError) {
            console.error('[ChatGPT Analyst] Error enabling Network domain:', chrome.runtime.lastError);
            chrome.debugger.detach({tabId});
            chrome.tabs.sendMessage(tabId, {
              action: 'debuggerError',
              error: `Error enabling Network domain: ${chrome.runtime.lastError.message}`
            });
            return;
          }
          
          console.log('[ChatGPT Analyst] Network domain enabled for tab:', tabId);
          
          // Set up network listener before making the request
          setupNetworkListener(tabId, conversationId);
          
          // Now trigger the conversation request
          setTimeout(() => {
            triggerConversationRequest(tabId, conversationId);
          }, 500);
        });
      });
    });
  });
}

function setupNetworkListener(tabId, conversationId) {
  // Listen for debugger events
  const onDebuggerEvent = (debuggeeId, message, params) => {
    if (debuggeeId.tabId !== tabId) return;
    
    if (message === 'Network.responseReceived') {
      const {requestId, response} = params;
      
      console.log(`[ChatGPT Analyst] 📡 Response received: ${response.url} (${response.status})`);
      
      if (response.url.includes(`/backend-api/conversation/${conversationId}`) && 
          !response.url.includes('/textdocs') && 
          !response.url.includes('/attachments') &&
          response.status === 200) {
        
        console.log('[ChatGPT Analyst] 🎯 Found target conversation response:', response.url);
        
        // Get response body
        chrome.debugger.sendCommand({tabId}, 'Network.getResponseBody', {requestId}, (bodyResult) => {
          if (chrome.runtime.lastError) {
            console.warn('[ChatGPT Analyst] getResponseBody error:', chrome.runtime.lastError.message);
            return;
          }
          
          try {
            let body = bodyResult.body;
            if (bodyResult.base64Encoded) {
              body = atob(body);
            }
            
            const jsonData = JSON.parse(body);
            console.log('[ChatGPT Analyst] ✅ Successfully captured conversation JSON:', {
              url: response.url,
              status: response.status,
              hasMapping: !!jsonData.mapping,
              title: jsonData.title || 'Untitled',
              dataSize: body.length
            });
            
            // Send to content script
            chrome.tabs.sendMessage(tabId, {
              action: 'networkData',
              source: 'debugger_capture',
              url: response.url,
              conversationId: conversationId,
              timestamp: Date.now(),
              data: jsonData
            });
            
            // Clean up
            chrome.debugger.onEvent.removeListener(onDebuggerEvent);
            chrome.debugger.detach({tabId}, () => {
              console.log('[ChatGPT Analyst] 🐞 Debugger detached after successful capture');
            });
            
          } catch (e) {
            console.warn('[ChatGPT Analyst] Error processing response body:', e);
            chrome.tabs.sendMessage(tabId, {
              action: 'debuggerError',
              error: `Error processing response: ${e.message}`
            });
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
        chrome.debugger.detach({tabId});
        
        // Check if we've already sent data before showing error
        chrome.tabs.sendMessage(tabId, {action: 'checkDataReceived'}, (response) => {
          // Only show error if we haven't received data yet
          if (!response || !response.dataReceived) {
            chrome.tabs.sendMessage(tabId, {
              action: 'debuggerError',
              error: 'Timeout waiting for conversation data. Try refreshing the page manually.'
            });
          }
        });
      }
    });
  }, 30000); // Reduced timeout to 30 seconds
}

function triggerConversationRequest(tabId, conversationId) {
  console.log('[ChatGPT Analyst] Triggering conversation request for:', conversationId);
  
  // Send message to content script to make the API request
  chrome.tabs.sendMessage(tabId, {
    action: 'makeApiRequest',
    conversationId: conversationId,
    apiUrl: `https://chatgpt.com/backend-api/conversation/${conversationId}`
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[ChatGPT Analyst] Error sending makeApiRequest message:', chrome.runtime.lastError);
    } else {
      console.log('[ChatGPT Analyst] makeApiRequest message sent successfully:', response);
    }
  });
}

// Listen for tab updates to detach debugger when needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If the tab is loading a new page, detach debugger
  if (changeInfo.status === 'loading') {
    chrome.debugger.getTargets((targets) => {
      const stillAttached = targets.some(target => 
        target.tabId === tabId && target.attached);
      
      if (stillAttached) {
        console.log('[ChatGPT Analyst] Tab navigating - detaching debugger from tab:', tabId);
        chrome.debugger.detach({tabId});
      }
    });
  }
});

// Listen for tab close to detach debugger
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.debugger.getTargets((targets) => {
    const stillAttached = targets.some(target => 
      target.tabId === tabId && target.attached);
    
    if (stillAttached) {
      console.log('[ChatGPT Analyst] Tab closed - detaching debugger from tab:', tabId);
      chrome.debugger.detach({tabId});
    }
  });
}); 