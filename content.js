// ChatGPT Analyst - Minimal Content Script (Popup-controlled mode)
console.log('🔍 ChatGPT Analyst content script loaded - popup-controlled mode');

// No overlay, no automatic analysis
// All functionality is now handled through the popup interface
// Background script still captures conversation data for manual analysis

console.log('✅ Content script ready - use popup to analyze conversations');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractPageData') {
    console.log('🔍 Popup requested page data extraction');
    
    try {
      // Try to extract conversation data from page
      const conversationData = extractConversationFromPage();
      
             if (conversationData) {
         const newConversationId = conversationData.conversation_id || 'unknown';
         
         // Check if this is a different conversation and clear old data
         chrome.storage.local.get(['conversationMetadata'], (existingData) => {
           const previousConversationId = existingData.conversationMetadata?.conversationId;
           
           const dataToSet = {
             conversationData: conversationData,
             conversationMetadata: {
               timestamp: new Date().toISOString(),
               source: 'page_extraction',
               conversationId: newConversationId,
               title: conversationData.title || 'Page Extracted Conversation'
             }
           };
           
           if (previousConversationId && previousConversationId !== newConversationId) {
             console.log('🧹 New conversation detected via page extraction, clearing old analysis');
             console.log(`Previous: ${previousConversationId} → Current: ${newConversationId}`);
             
             // Also clear analysis data
             chrome.storage.local.remove(['analysisData'], () => {
               // Save new data after clearing old analysis
               chrome.storage.local.set(dataToSet);
               console.log('✅ Old analysis cleared, new data saved');
             });
           } else {
             // Just save new data
             chrome.storage.local.set(dataToSet);
           }
         });
        
        sendResponse({ 
          success: true, 
          message: 'Data extracted from page',
          hasData: true,
          conversationId: conversationData.conversation_id
        });
      } else {
        sendResponse({ 
          success: false, 
          message: 'No conversation data found on page',
          hasData: false
        });
      }
    } catch (error) {
      console.error('❌ Error extracting page data:', error);
      sendResponse({ 
        success: false, 
        message: 'Error extracting data: ' + error.message,
        hasData: false
      });
    }
    
    return true; // Keep message channel open for async response
  }
});

// Function to extract conversation data directly from the page
function extractConversationFromPage() {
  console.log('🔍 Attempting to extract conversation data from page...');
  
  // Method 1: Try to find conversation data in window.__NEXT_DATA__
  if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props) {
    const pageProps = window.__NEXT_DATA__.props.pageProps;
    if (pageProps && pageProps.serverResponse && pageProps.serverResponse.data) {
      console.log('✅ Found conversation data in __NEXT_DATA__');
      return pageProps.serverResponse.data;
    }
  }
  
  // Method 2: Try to find conversation data in other common locations
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    if (script.textContent && script.textContent.includes('"conversation_id"')) {
      try {
        // Try to extract JSON from script content
        const jsonMatch = script.textContent.match(/\{.*"conversation_id".*\}/s);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          if (data.mapping && data.conversation_id) {
            console.log('✅ Found conversation data in script tag');
            return data;
          }
        }
      } catch (e) {
        // Continue searching
      }
    }
  }
  
  // Method 3: Try to get conversation ID from URL and build minimal structure
  const url = window.location.href;
  const conversationId = extractConversationIdFromUrl(url);
  
  if (conversationId) {
    console.log('⚠️ Only found conversation ID from URL, creating minimal structure');
    return {
      conversation_id: conversationId,
      title: document.title || 'ChatGPT Conversation',
      mapping: {},
      create_time: Date.now() / 1000,
      update_time: Date.now() / 1000
    };
  }
  
  console.log('❌ No conversation data found on page');
  return null;
}

function extractConversationIdFromUrl(url) {
  const patterns = [
    /chatgpt\.com\/c\/([a-zA-Z0-9-]+)/,
    /chatgpt\.com\/conversation\/([a-zA-Z0-9-]+)/,
    /chatgpt\.com\/chat\/([a-zA-Z0-9-]+)/,
    /chat\.openai\.com\/c\/([a-zA-Z0-9-]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Optional: Add keyboard shortcut for quick popup access
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+A (or Cmd+Shift+A on Mac) to remind user to use popup
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
    console.log('🔍 Quick access shortcut pressed - open popup to analyze');
    
    // Show a subtle notification to remind user to use popup
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4fc3f7, #29b6f6);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(79, 195, 247, 0.3);
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = '🔍 Click the ChatGPT Analyst extension icon to analyze this conversation';
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove notification after 4 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }
});

// Debug function for troubleshooting - accessible from console
window.debugChatGPTAnalyst = function() {
  console.log('🔍 ChatGPT Analyst Debug Information:');
  console.log('Mode: Popup-controlled (no overlay)');
  console.log('Current URL:', window.location.href);
  console.log('Background script handles data capture');
  console.log('Use extension popup for analysis');
  
  chrome.storage.local.get(null, (items) => {
    console.log('📦 All storage keys:', Object.keys(items));
    console.log('📊 Conversation data exists:', !!items.conversationData);
    console.log('🔍 Analysis data exists:', !!items.analysisData);
    
    if (items.conversationData) {
      console.log('📊 Conversation data info:', {
        hasMapping: !!items.conversationData.mapping,
        mappingKeys: items.conversationData.mapping ? Object.keys(items.conversationData.mapping).length : 0,
        title: items.conversationData.title || 'No title',
        conversationId: items.conversationData.conversation_id
      });
    }
    
    // List all ChatGPT Analyst related keys
    const analystKeys = Object.keys(items).filter(key => 
      key.includes('chatgpt') || key.includes('conversation') || key.includes('analysis')
    );
    console.log('🔧 ChatGPT Analyst storage keys:', analystKeys);
  });
};

console.log('💡 Tip: Use Ctrl+Shift+A for quick reminder or call debugChatGPTAnalyst() for debug info'); 