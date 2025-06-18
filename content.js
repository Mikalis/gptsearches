// ChatGPT Analyst - Minimal Content Script (Popup-controlled mode)
console.log('🔍 ChatGPT Analyst content script loaded - popup-controlled mode');

// No overlay, no automatic analysis
// All functionality is now handled through the popup interface
// Background script still captures conversation data for manual analysis

console.log('✅ Content script ready - use popup to analyze conversations');

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