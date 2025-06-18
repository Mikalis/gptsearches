// ChatGPT Analyst - Enhanced Background Script
console.log("🚀 [ChatGPT Analyst] Enhanced background script loaded");

// Store active debugger sessions
const activeDebuggers = new Set();

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

// Listen for tab updates to start intercepting
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only monitor ChatGPT tabs
  if (!tab.url || !tab.url.includes('chatgpt.com')) return;
  
  // When a ChatGPT tab starts loading, set up network interception
  if (changeInfo.status === 'loading') {
    const conversationId = extractConversationId(tab.url);
    if (conversationId) {
      console.log('[ChatGPT Analyst] 🔄 Tab loading ChatGPT conversation:', conversationId);
      setupNetworkInterception(tabId, conversationId);
    }
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeConversation") {
    const tabId = sender.tab.id;
    const manual = request.manual || false;
    
    // Get conversation ID from URL
    chrome.tabs.get(tabId, (tab) => {
      const url = tab.url;
      const conversationId = extractConversationId(url);
      
      if (conversationId) {
        console.log('[ChatGPT Analyst] 🔍 Manual analysis requested for:', conversationId);
        setupNetworkInterception(tabId, conversationId);
      } else {
        console.log('[ChatGPT Analyst] ⚠️ No conversation ID found in URL:', url);
        chrome.tabs.sendMessage(tabId, {
          action: 'debuggerError',
          error: 'No conversation ID found in URL. Please make sure you are on a ChatGPT conversation page.'
        });
      }
    });
  }
  
  return false;
});

function setupNetworkInterception(tabId, conversationId) {
  // Avoid duplicate debugger attachments
  const debuggerKey = `${tabId}-${conversationId}`;
  if (activeDebuggers.has(debuggerKey)) {
    console.log('[ChatGPT Analyst] Already intercepting for tab:', tabId);
    return;
  }
  
  console.log('[ChatGPT Analyst] 🕳️ Setting up network interception for:', conversationId);
  
  // Check if debugger is already attached
  chrome.debugger.getTargets((targets) => {
    const alreadyAttached = targets.some(target => 
      target.tabId === tabId && target.attached);
    
    if (alreadyAttached) {
      console.log('[ChatGPT Analyst] Debugger already attached to tab:', tabId);
      return;
    }
    
    // Attach debugger
    chrome.debugger.attach({tabId}, '1.3', () => {
      if (chrome.runtime.lastError) {
        console.error('[ChatGPT Analyst] Error attaching debugger:', chrome.runtime.lastError);
        return;
      }
      
      console.log('[ChatGPT Analyst] ✅ Debugger attached to tab:', tabId);
      activeDebuggers.add(debuggerKey);
      
      // Enable Network domain
      chrome.debugger.sendCommand({tabId}, 'Network.enable', {}, () => {
        if (chrome.runtime.lastError) {
          console.error('[ChatGPT Analyst] Error enabling Network domain:', chrome.runtime.lastError);
          chrome.debugger.detach({tabId});
          activeDebuggers.delete(debuggerKey);
          return;
        }
        
        console.log('[ChatGPT Analyst] 🌐 Network domain enabled, intercepting requests...');
        
                 // Set up the network listener
         const onNetworkEvent = (debuggeeId, message, params) => {
           if (debuggeeId.tabId !== tabId) return;
           
           if (message === 'Network.responseReceived') {
             const {requestId, response} = params;
             const url = response.url;
             
             // Log all conversation API responses for debugging
             if (url.includes('/backend-api/conversation/')) {
               console.log('[ChatGPT Analyst] 🔍 Found conversation API response:', {
                 url: url,
                 status: response.status,
                 mimeType: response.mimeType,
                 headers: response.headers
               });
             }
             
             // Check if this is the main conversation API request we want
             if (url.includes(`/backend-api/conversation/${conversationId}`) && 
                 !url.includes('/textdocs') && 
                 !url.includes('/attachments') &&
                 !url.includes('/moderations') &&
                 !url.includes('/files') &&
                 response.status === 200 &&
                 response.mimeType && response.mimeType.includes('application/json')) {
               
               console.log('[ChatGPT Analyst] 🎯 INTERCEPTED main conversation API request:', url);
               
               // Get the response body
               chrome.debugger.sendCommand({tabId}, 'Network.getResponseBody', {requestId}, (bodyResult) => {
                 if (chrome.runtime.lastError) {
                   console.warn('[ChatGPT Analyst] Error getting response body:', chrome.runtime.lastError.message);
                   
                   // Fallback: Signal that we detected a conversation but couldn't read the body
                   console.log('[ChatGPT Analyst] 🔄 Fallback: Detected conversation, user needs to refresh or manually trigger');
                   chrome.storage.local.set({
                     'conversationDetected': {
                       timestamp: new Date().toISOString(),
                       conversationId: conversationId,
                       url: url,
                       needsRefresh: true
                     }
                   });
                   return;
                 }
                 
                 try {
                   let body = bodyResult.body;
                   if (bodyResult.base64Encoded) {
                     body = atob(body);
                   }
                   
                   console.log('[ChatGPT Analyst] 📄 Raw response body preview:', body.substring(0, 200) + '...');
                   
                   const jsonData = JSON.parse(body);
                   console.log('[ChatGPT Analyst] ✅ Successfully intercepted and parsed JSON:', {
                     url: url,
                     status: response.status,
                     hasMapping: !!jsonData.mapping,
                     hasSafe: !!jsonData.safe,
                     hasBlocked: !!jsonData.blocked,
                     keys: Object.keys(jsonData),
                     title: jsonData.title || 'Untitled',
                     dataSize: body.length
                   });
                   
                   // Only process if this looks like a real conversation (has mapping)
                   if (jsonData.mapping && Object.keys(jsonData.mapping).length > 0) {
                     // Clear old analysis data when we detect a new conversation
                     chrome.storage.local.get(['conversationMetadata'], (existingData) => {
                       const previousConversationId = existingData.conversationMetadata?.conversationId;
                       
                       if (previousConversationId && previousConversationId !== conversationId) {
                         console.log('[ChatGPT Analyst] 🧹 New conversation detected, clearing old analysis data');
                         console.log(`[ChatGPT Analyst] Previous: ${previousConversationId} → Current: ${conversationId}`);
                         
                         // Clear analysis data from previous conversation
                         chrome.storage.local.remove(['analysisData'], () => {
                           console.log('[ChatGPT Analyst] ✅ Old analysis data cleared');
                         });
                       }
                       
                       // Save the conversation data with the key the content script expects
                       const storageData = {
                         timestamp: new Date().toISOString(),
                         conversationId: conversationId,
                         source: 'network_interception',
                         url: url,
                         title: jsonData.title || 'Untitled Conversation',
                         dataSize: body.length
                       };
                       
                       try {
                         // Save both the raw conversation data and metadata
                         chrome.storage.local.set({
                           'conversationData': jsonData,  // The key content script looks for
                           'conversationMetadata': storageData,
                           [`chatgpt_analyst_data_${conversationId}`]: storageData  // Keep backup
                         }, () => {
                           console.log('[ChatGPT Analyst] 💾 Saved intercepted data to storage for:', conversationId);
                           console.log('[ChatGPT Analyst] 📊 Data keys saved: conversationData, conversationMetadata');
                         });
                       } catch (storageError) {
                         console.error('[ChatGPT Analyst] Error saving to storage:', storageError);
                       }
                     });
                     
                     // Try to send to content script (might fail if page reloaded)
                     chrome.tabs.sendMessage(tabId, {
                       action: 'networkData',
                       source: 'network_interception',
                       url: url,
                       conversationId: conversationId,
                       timestamp: Date.now(),
                       data: jsonData
                     }, (response) => {
                       if (chrome.runtime.lastError) {
                         console.log('[ChatGPT Analyst] Content script not available (page reload?), data saved to storage');
                       } else {
                         console.log('[ChatGPT Analyst] Successfully sent data to content script');
                       }
                     });
                     
                     // Clean up after successful interception
                     chrome.debugger.onEvent.removeListener(onNetworkEvent);
                     chrome.debugger.detach({tabId}, () => {
                       activeDebuggers.delete(debuggerKey);
                       console.log('[ChatGPT Analyst] 🎉 Network interception successful, debugger detached');
                     });
                   } else {
                     console.log('[ChatGPT Analyst] ⚠️ Skipping response - no valid mapping found, keys:', Object.keys(jsonData));
                   }
                   
                 } catch (e) {
                   console.error('[ChatGPT Analyst] Error parsing intercepted JSON:', e);
                   chrome.tabs.sendMessage(tabId, {
                     action: 'debuggerError',
                     error: `Error parsing response: ${e.message}`
                   });
                 }
               });
             }
           }
         };
        
        // Start listening for network events
        chrome.debugger.onEvent.addListener(onNetworkEvent);
        
        // Auto-cleanup after timeout
        setTimeout(() => {
          if (activeDebuggers.has(debuggerKey)) {
            console.log('[ChatGPT Analyst] ⏰ Network interception timeout, cleaning up...');
            chrome.debugger.onEvent.removeListener(onNetworkEvent);
            chrome.debugger.detach({tabId}, () => {
              activeDebuggers.delete(debuggerKey);
            });
          }
        }, 60000); // 60 second timeout
      });
    });
  });
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove any active debuggers for this tab
  for (const debuggerKey of activeDebuggers) {
    if (debuggerKey.startsWith(`${tabId}-`)) {
      activeDebuggers.delete(debuggerKey);
      chrome.debugger.detach({tabId}, () => {
        console.log('[ChatGPT Analyst] Cleaned up debugger for closed tab:', tabId);
      });
    }
  }
});

// Clean up when extension is disabled/updated
chrome.runtime.onSuspend.addListener(() => {
  console.log('[ChatGPT Analyst] Extension suspending, cleaning up debuggers...');
  for (const debuggerKey of activeDebuggers) {
    const tabId = parseInt(debuggerKey.split('-')[0]);
    chrome.debugger.detach({tabId});
  }
  activeDebuggers.clear();
}); 