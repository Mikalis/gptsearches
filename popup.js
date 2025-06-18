// ChatGPT Analyst - Popup Script
document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const analyzeBtn = document.getElementById('analyze-btn');
  const newConversationBtn = document.getElementById('new-conversation-btn');
  const tipsHeader = document.getElementById('tips-header');
  const tipsContent = document.getElementById('tips-content');
  const settingsToggle = document.getElementById('settings-toggle');
  const settingsContainer = document.getElementById('settings-container');
  const autoAnalyzeToggle = document.getElementById('auto-analyze');
  const showDebugToggle = document.getElementById('show-debug');
  
  // Load settings from storage
  chrome.storage.sync.get({
    autoAnalyze: false,
    showDebug: false
  }, (items) => {
    autoAnalyzeToggle.checked = items.autoAnalyze;
    showDebugToggle.checked = items.showDebug;
  });
  
  // Toggle tips visibility
  tipsHeader.addEventListener('click', () => {
    tipsContent.classList.toggle('visible');
    tipsHeader.querySelector('.toggle-icon').textContent = 
      tipsContent.classList.contains('visible') ? '▲' : '▼';
  });
  
  // Toggle settings visibility
  settingsToggle.addEventListener('click', () => {
    settingsContainer.classList.toggle('visible');
    settingsToggle.querySelector('.toggle-icon').textContent = 
      settingsContainer.classList.contains('visible') ? '▲' : '▼';
  });
  
  // Save settings when changed
  autoAnalyzeToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoAnalyze: autoAnalyzeToggle.checked });
    
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url.includes('chatgpt.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'updateSettings', 
          settings: { autoAnalyze: autoAnalyzeToggle.checked } 
        });
      }
    });
  });
  
  showDebugToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ showDebug: showDebugToggle.checked });
    
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url.includes('chatgpt.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'updateSettings', 
          settings: { showDebug: showDebugToggle.checked } 
        });
      }
    });
  });
  
  // Analyze conversation button
  analyzeBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url.includes('chatgpt.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzeConversation', manual: true });
      } else {
        showMessage('Please navigate to ChatGPT first');
      }
    });
  });
  
  // New conversation button
  newConversationBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chat.openai.com/chat' });
  });
  
  // Show tips by default
  tipsContent.classList.add('visible');
  
  // Helper function to show a message
  function showMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      right: 10px;
      background: #10a37f;
      color: white;
      padding: 8px;
      border-radius: 4px;
      text-align: center;
      font-size: 14px;
      z-index: 1000;
    `;
    document.body.appendChild(messageEl);
    setTimeout(() => {
      document.body.removeChild(messageEl);
    }, 3000);
  }
}); 