// ChatGPT SEO Analyst - Popup Script
// Handles the popup interface and coordinates with background/content scripts

let currentTab = null;
let extensionSettings = {
  autoShow: true,
  monitoring: true
};

// DOM elements
const elements = {
  extensionStatus: document.getElementById('extension-status'),
  pageStatus: document.getElementById('page-status'),
  requestCount: document.getElementById('request-count'),
  overlayStatus: document.getElementById('overlay-status'),
  autoShowToggle: document.getElementById('auto-show-toggle'),
  monitorToggle: document.getElementById('monitor-toggle'),
  toggleOverlayBtn: document.getElementById('toggle-overlay'),
  clearDataBtn: document.getElementById('clear-data')
};

// Initialize popup when loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[ChatGPT Analyst Popup] Initializing...');
  initializePopup();
  setupEventListeners();
  updateStatus();
  
  // Update status every 2 seconds
  setInterval(updateStatus, 2000);
});

// Initialize popup state
async function initializePopup() {
  try {
    // Get current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];
    
    // Load saved settings
    const result = await chrome.storage.local.get(['autoShow', 'monitoring']);
    extensionSettings.autoShow = result.autoShow !== false; // Default to true
    extensionSettings.monitoring = result.monitoring !== false; // Default to true
    
    // Update toggle switches
    updateToggleSwitch(elements.autoShowToggle, extensionSettings.autoShow);
    updateToggleSwitch(elements.monitorToggle, extensionSettings.monitoring);
    
    console.log('[ChatGPT Analyst Popup] Initialized with settings:', extensionSettings);
    
  } catch (error) {
    console.error('[ChatGPT Analyst Popup] Initialization error:', error);
    updateStatusElement(elements.extensionStatus, 'Error', false);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Toggle switches
  elements.autoShowToggle.addEventListener('click', () => {
    extensionSettings.autoShow = !extensionSettings.autoShow;
    updateToggleSwitch(elements.autoShowToggle, extensionSettings.autoShow);
    saveSettings();
    sendMessageToContentScript({ action: 'updateSettings', settings: extensionSettings });
  });
  
  elements.monitorToggle.addEventListener('click', () => {
    extensionSettings.monitoring = !extensionSettings.monitoring;
    updateToggleSwitch(elements.monitorToggle, extensionSettings.monitoring);
    saveSettings();
    // Note: This would require reloading the page to take effect for webRequest listeners
    if (!extensionSettings.monitoring) {
      showTemporaryMessage('Monitoring disabled. Reload page to take effect.');
    }
  });
  
  // Action buttons
  elements.toggleOverlayBtn.addEventListener('click', () => {
    if (isChatGPTPage()) {
      sendMessageToContentScript({ action: 'toggleOverlay' });
    } else {
      showTemporaryMessage('Please navigate to ChatGPT first.');
    }
  });
  
  elements.clearDataBtn.addEventListener('click', () => {
    if (isChatGPTPage()) {
      sendMessageToContentScript({ action: 'clearData' });
      showTemporaryMessage('Analysis data cleared.');
    } else {
      showTemporaryMessage('Please navigate to ChatGPT first.');
    }
  });
}

// Update overall status
async function updateStatus() {
  try {
    // Check extension status
    updateStatusElement(elements.extensionStatus, 'Active', true);
    
    // Check current page
    if (currentTab) {
      const isChatGPT = isChatGPTPage();
      updateStatusElement(elements.pageStatus, isChatGPT ? 'ChatGPT' : 'Other Page', isChatGPT);
      
      // Update button states
      elements.toggleOverlayBtn.disabled = !isChatGPT;
      elements.clearDataBtn.disabled = !isChatGPT;
      
      if (isChatGPT) {
        await updateChatGPTSpecificStatus();
      } else {
        updateStatusElement(elements.requestCount, '0', false);
        updateStatusElement(elements.overlayStatus, 'N/A', false);
      }
    }
    
  } catch (error) {
    console.error('[ChatGPT Analyst Popup] Status update error:', error);
    updateStatusElement(elements.extensionStatus, 'Error', false);
  }
}

// Update ChatGPT-specific status
async function updateChatGPTSpecificStatus() {
  try {
    // Get badge text (request count)
    const badgeText = await chrome.action.getBadgeText({ tabId: currentTab.id });
    const requestCount = badgeText || '0';
    updateStatusElement(elements.requestCount, requestCount, parseInt(requestCount) > 0);
    
    // Check overlay status by sending message to content script
    const response = await sendMessageToContentScript({ action: 'getOverlayStatus' });
    if (response && response.status === 'success') {
      updateStatusElement(elements.overlayStatus, response.visible ? 'Visible' : 'Hidden', response.visible);
    } else {
      updateStatusElement(elements.overlayStatus, 'Unknown', false);
    }
    
  } catch (error) {
    console.warn('[ChatGPT Analyst Popup] Could not get ChatGPT status:', error);
    updateStatusElement(elements.requestCount, 'Unknown', false);
    updateStatusElement(elements.overlayStatus, 'Unknown', false);
  }
}

// Send message to content script
function sendMessageToContentScript(message) {
  return new Promise((resolve) => {
    if (!currentTab || !isChatGPTPage()) {
      resolve({ status: 'error', message: 'Not on ChatGPT page' });
      return;
    }
    
    chrome.tabs.sendMessage(currentTab.id, message)
      .then(resolve)
      .catch(error => {
        console.warn('[ChatGPT Analyst Popup] Message sending failed:', error);
        resolve({ status: 'error', message: error.message });
      });
  });
}

// Utility functions
function isChatGPTPage() {
  return currentTab && currentTab.url && currentTab.url.includes('chatgpt.com');
}

function updateStatusElement(element, text, isActive) {
  if (!element) return;
  
  element.textContent = text;
  element.className = 'status-value' + (isActive ? '' : ' inactive');
}

function updateToggleSwitch(element, isActive) {
  if (!element) return;
  
  if (isActive) {
    element.classList.add('active');
  } else {
    element.classList.remove('active');
  }
}

function saveSettings() {
  chrome.storage.local.set(extensionSettings)
    .then(() => {
      console.log('[ChatGPT Analyst Popup] Settings saved:', extensionSettings);
    })
    .catch(error => {
      console.error('[ChatGPT Analyst Popup] Failed to save settings:', error);
    });
}

function showTemporaryMessage(message, duration = 3000) {
  // Create a temporary notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(76, 175, 80, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    animation: slideDown 0.3s ease-out;
  `;
  notification.textContent = message;
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideDown 0.3s ease-out reverse';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 300);
  }, duration);
}

// Handle tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId)
    .then(tab => {
      currentTab = tab;
      updateStatus();
    })
    .catch(console.error);
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (currentTab && tabId === currentTab.id && changeInfo.url) {
    currentTab = tab;
    updateStatus();
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'statusUpdate') {
    updateStatus();
    sendResponse({ status: 'success' });
  }
  return true;
});

console.log('[ChatGPT Analyst Popup] Script loaded and ready'); 