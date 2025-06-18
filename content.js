// ChatGPT SEO Analyst - Content Script
// Analyzes responses and manages overlay display

let overlayVisible = false;
let currentData = null;
let overlayElement = null;

// Configuration
const CONFIG = {
  overlayId: 'chatgpt-seo-overlay',
  contentId: 'chatgpt-seo-content',
  autoShow: true,
  position: 'top-right'
};

// Wait for page to be ready
function waitForPageReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve);
    }
  });
}

// Create overlay structure
function createOverlay() {
  if (overlayElement) return overlayElement;

  const overlay = document.createElement('div');
  overlay.id = CONFIG.overlayId;
  overlay.className = 'chatgpt-seo-overlay';
  
  // Header with title and controls
  const header = document.createElement('div');
  header.className = 'overlay-header';
  
  const title = document.createElement('h3');
  title.textContent = 'ChatGPT SEO Analysis';
  
  const controls = document.createElement('div');
  controls.className = 'overlay-controls';
  
  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'control-btn toggle-btn';
  toggleBtn.innerHTML = '👁️';
  toggleBtn.title = 'Toggle visibility';
  toggleBtn.onclick = () => toggleOverlay();
  
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'control-btn close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close overlay';
  closeBtn.onclick = () => hideOverlay();
  
  controls.appendChild(toggleBtn);
  controls.appendChild(closeBtn);
  
  header.appendChild(title);
  header.appendChild(controls);
  
  // Content area
  const contentDiv = document.createElement('div');
  contentDiv.id = CONFIG.contentId;
  contentDiv.className = 'overlay-content';
  
  // Status indicator
  const statusDiv = document.createElement('div');
  statusDiv.className = 'overlay-status';
  statusDiv.textContent = 'Waiting for ChatGPT responses...';
  
  overlay.appendChild(header);
  overlay.appendChild(contentDiv);
  overlay.appendChild(statusDiv);
  
  document.body.appendChild(overlay);
  overlayElement = overlay;
  
  console.log('[ChatGPT Analyst] Overlay created');
  return overlay;
}

// Update overlay content with extracted data
function updateOverlayContent(data) {
  const contentDiv = document.getElementById(CONFIG.contentId);
  const statusDiv = overlayElement.querySelector('.overlay-status');
  
  if (!contentDiv) return;
  
  contentDiv.innerHTML = '';
  statusDiv.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  
  const relevantNodes = extractRelevantData(data);
  
  if (relevantNodes.length === 0) {
    contentDiv.innerHTML = '<p class="no-data">No search queries or thoughts detected in this response.</p>';
    // Still show promotional content even with no data
    addPromotionalContent(contentDiv);
    return;
  }
  
  // Create sections for different types of data
  relevantNodes.forEach(item => {
    const section = document.createElement('div');
    section.className = 'data-section';
    
    if (item.type === 'search_queries') {
      section.appendChild(createSearchQueriesSection(item.node));
    } else if (item.type === 'thoughts') {
      section.appendChild(createThoughtsSection(item.node));
    }
    
    contentDiv.appendChild(section);
  });
  
  // Add export functionality
  addExportButton(contentDiv, relevantNodes);
  
  // Add promotional content
  addPromotionalContent(contentDiv);
}

// Extract relevant data from ChatGPT response
function extractRelevantData(data) {
  const relevantNodes = [];
  
  if (!data || !data.mapping) return relevantNodes;
  
  for (const nodeId in data.mapping) {
    const node = data.mapping[nodeId];
    
    if (!node.message) continue;
    
    // Check for search queries
    if (node.message.metadata?.search_queries?.length > 0) {
      relevantNodes.push({ type: 'search_queries', node: node });
    }
    
    // Check for thoughts
    if (node.message.content?.content_type === 'thoughts' && 
        node.message.content.thoughts?.length > 0) {
      relevantNodes.push({ type: 'thoughts', node: node });
    }
  }
  
  return relevantNodes;
}

// Create search queries section
function createSearchQueriesSection(node) {
  const container = document.createElement('div');
  container.className = 'search-queries-section';
  
  const title = document.createElement('h4');
  title.textContent = '🔍 Search Queries Triggered:';
  title.className = 'section-title search-title';
  container.appendChild(title);
  
  const queriesList = document.createElement('ul');
  queriesList.className = 'queries-list';
  
  node.message.metadata.search_queries.forEach((query, index) => {
    const listItem = document.createElement('li');
    listItem.className = 'query-item';
    listItem.innerHTML = `
      <span class="query-number">${index + 1}.</span>
      <span class="query-text">${escapeHtml(query.q || query)}</span>
      <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(query.q || query)}')" title="Copy query">📋</button>
    `;
    queriesList.appendChild(listItem);
  });
  
  container.appendChild(queriesList);
  return container;
}

// Create thoughts section
function createThoughtsSection(node) {
  const container = document.createElement('div');
  container.className = 'thoughts-section';
  
  const title = document.createElement('h4');
  title.textContent = '💭 Internal Thoughts:';
  title.className = 'section-title thoughts-title';
  container.appendChild(title);
  
  node.message.content.thoughts.forEach((thought, index) => {
    const thoughtDiv = document.createElement('div');
    thoughtDiv.className = 'thought-item';
    
    if (thought.summary) {
      const summary = document.createElement('div');
      summary.className = 'thought-summary';
      summary.innerHTML = `<strong>Summary:</strong> ${escapeHtml(thought.summary)}`;
      thoughtDiv.appendChild(summary);
    }
    
    if (thought.content) {
      const content = document.createElement('div');
      content.className = 'thought-content';
      content.innerHTML = `<strong>Content:</strong> ${escapeHtml(thought.content)}`;
      thoughtDiv.appendChild(content);
    }
    
    container.appendChild(thoughtDiv);
  });
  
  return container;
}

// Add export functionality
function addExportButton(contentDiv, relevantNodes) {
  const exportDiv = document.createElement('div');
  exportDiv.className = 'export-section';
  
  const exportBtn = document.createElement('button');
  exportBtn.className = 'export-btn';
  exportBtn.textContent = '📊 Export Data';
  exportBtn.onclick = () => exportData(relevantNodes);
  
  exportDiv.appendChild(exportBtn);
  contentDiv.appendChild(exportDiv);
}

// Add promotional content
function addPromotionalContent(contentDiv) {
  const promoDiv = document.createElement('div');
  promoDiv.className = 'promo-section';
  
  const promoContent = document.createElement('div');
  promoContent.className = 'promo-content';
  promoContent.innerHTML = `
    <div class="promo-header">
      <span class="promo-icon">🚀</span>
      <span class="promo-title">Need Better ChatGPT Visibility?</span>
    </div>
    <div class="promo-text">
      Want your brand to rank higher in AI searches?<br>
      <strong>Talk to our experts!</strong>
    </div>
    <a href="https://www.unic.com" target="_blank" class="promo-link">
      Visit www.unic.com →
    </a>
  `;
  
  promoDiv.appendChild(promoContent);
  contentDiv.appendChild(promoDiv);
}

// Export data functionality
function exportData(relevantNodes) {
  const exportData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    data: {
      search_queries: [],
      thoughts: []
    }
  };
  
  relevantNodes.forEach(item => {
    if (item.type === 'search_queries') {
      exportData.data.search_queries.push(...item.node.message.metadata.search_queries);
    } else if (item.type === 'thoughts') {
      exportData.data.thoughts.push(...item.node.message.content.thoughts);
    }
  });
  
  // Copy to clipboard
  navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
    .then(() => {
      showNotification('Data exported to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy data:', err);
      showNotification('Export failed. Check console for details.', 'error');
    });
}

// Show/hide overlay functions
function showOverlay() {
  if (!overlayElement) createOverlay();
  overlayElement.style.display = 'block';
  overlayVisible = true;
}

function hideOverlay() {
  if (overlayElement) {
    overlayElement.style.display = 'none';
  }
  overlayVisible = false;
}

function toggleOverlay() {
  if (overlayVisible) {
    hideOverlay();
  } else {
    showOverlay();
  }
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}

// Message handler for background script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ChatGPT Analyst] Received message:', request);
  
  switch (request.action) {
    case 'requestCompleted':
      handleRequestCompleted(request);
      sendResponse({ status: 'success', timestamp: Date.now() });
      break;
      
    case 'toggleOverlay':
      toggleOverlay();
      sendResponse({ status: 'success', visible: overlayVisible });
      break;
      
    case 'getOverlayStatus':
      sendResponse({ 
        status: 'success', 
        visible: overlayVisible,
        hasData: currentData !== null 
      });
      break;
      
    case 'updateSettings':
      if (request.settings) {
        CONFIG.autoShow = request.settings.autoShow;
        console.log('[ChatGPT Analyst] Settings updated:', request.settings);
      }
      sendResponse({ status: 'success' });
      break;
      
    case 'clearData':
      currentData = null;
      if (overlayElement) {
        const contentDiv = document.getElementById(CONFIG.contentId);
        if (contentDiv) {
          contentDiv.innerHTML = '<p class="no-data">Analysis data cleared.</p>';
        }
      }
      sendResponse({ status: 'success' });
      break;
      
    default:
      console.warn('[ChatGPT Analyst] Unknown action:', request.action);
      sendResponse({ status: 'error', message: 'Unknown action' });
  }
  
  return true; // Keep message channel open for async response
});

// Handle request completed notification (legacy - analysis now happens via GET request interception)
async function handleRequestCompleted(request) {
  console.log('[ChatGPT Analyst] Request completed:', request.url);
  
  // The actual analysis now happens automatically when GET requests are intercepted
  // This function just logs the completion for debugging purposes
  
  // If we haven't seen any conversation data yet, show a waiting message
  if (!currentData) {
    console.log('[ChatGPT Analyst] Waiting for conversation data to be loaded...');
    
    // Create overlay to show we're monitoring
    if (!overlayElement) {
      createOverlay();
    }
    
    const contentDiv = document.getElementById(CONFIG.contentId);
    if (contentDiv && !contentDiv.querySelector('.waiting-message')) {
      contentDiv.innerHTML = `
        <div class="waiting-message">
          <h4>🔍 Monitoring ChatGPT...</h4>
          <p>Ask a question to ChatGPT to see search queries and thoughts!</p>
          <p><small>The extension will automatically analyze responses when available.</small></p>
        </div>
      `;
      // Add promotional content
      addPromotionalContent(contentDiv);
    }
    
    if (CONFIG.autoShow) {
      showOverlay();
    }
  }
}

// Store intercepted response data
let interceptedResponses = new Map();

// Listen for intercepted responses from the injected script
window.addEventListener('message', (event) => {
  if (event.source === window && event.data.type === 'CHATGPT_RESPONSE_INTERCEPTED') {
    console.log('[ChatGPT Analyst] Received intercepted response:', event.data.url);
    
    try {
      // Parse the response data
      const responseText = event.data.data;
      let parsedData = null;
      
      // Handle GET requests to conversation endpoints (full conversation data)
      if (event.data.method === 'GET' && responseText.trim()) {
        parsedData = JSON.parse(responseText);
        console.log('[ChatGPT Analyst] Parsed conversation data:', parsedData);
        
        // Store the conversation data and trigger analysis
        if (parsedData && parsedData.mapping) {
          interceptedResponses.set(event.data.url, parsedData);
          console.log('[ChatGPT Analyst] Stored conversation data for:', event.data.url);
          
          // Trigger immediate analysis since this is the full conversation data
          setTimeout(() => {
            handleConversationData(parsedData, event.data.url);
          }, 500);
        }
      } else {
        // Handle streaming responses (multiple JSON objects) from POST requests
        if (responseText.includes('\n')) {
          const lines = responseText.split('\n').filter(line => line.trim());
          const lastLine = lines[lines.length - 1];
          if (lastLine.startsWith('data: ') && lastLine !== 'data: [DONE]') {
            const jsonStr = lastLine.substring(6);
            parsedData = JSON.parse(jsonStr);
          }
        } else if (responseText.trim()) {
          parsedData = JSON.parse(responseText);
        }
        
        if (parsedData) {
          interceptedResponses.set(event.data.url, parsedData);
          console.log('[ChatGPT Analyst] Stored intercepted response data for:', event.data.url);
        }
      }
    } catch (error) {
      console.warn('[ChatGPT Analyst] Error parsing intercepted response:', error);
    }
  }
});

// Handle conversation data directly from GET requests
function handleConversationData(data, url) {
  try {
    console.log('[ChatGPT Analyst] Analyzing conversation data from:', url);
    
    currentData = data;
    
    // Create overlay if it doesn't exist
    if (!overlayElement) {
      createOverlay();
    }
    
    // Update content
    updateOverlayContent(data);
    
    // Show overlay automatically if configured and there's relevant data
    const relevantNodes = extractRelevantData(data);
    if (CONFIG.autoShow && relevantNodes.length > 0) {
      showOverlay();
      console.log('[ChatGPT Analyst] Auto-showing overlay with', relevantNodes.length, 'relevant data points');
    }
    
    console.log('[ChatGPT Analyst] Conversation analysis complete, found', relevantNodes.length, 'relevant data points');
    
  } catch (error) {
    console.error('[ChatGPT Analyst] Error analyzing conversation data:', error);
    
    if (!overlayElement) {
      createOverlay();
    }
    
    const contentDiv = document.getElementById(CONFIG.contentId);
    if (contentDiv) {
      contentDiv.innerHTML = `
        <div class="error-message">
          <h4>⚠️ Analysis Error</h4>
          <p>Failed to analyze conversation data:</p>
          <code>${escapeHtml(error.message)}</code>
          <p><small>Conversation data was intercepted but could not be processed.</small></p>
        </div>
      `;
      // Add promotional content even in error cases
      addPromotionalContent(contentDiv);
    }
    
    if (CONFIG.autoShow) {
      showOverlay();
    }
  }
}

// Wait for intercepted response data (legacy for POST requests)
function waitForInterceptedResponse(url) {
  return new Promise((resolve) => {
    // Check if we already have the data
    if (interceptedResponses.has(url)) {
      const data = interceptedResponses.get(url);
      interceptedResponses.delete(url); // Clean up
      resolve(data);
      return;
    }
    
    // Wait up to 10 seconds for the data to arrive
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds with 200ms intervals
    
    const checkForData = () => {
      attempts++;
      
      if (interceptedResponses.has(url)) {
        const data = interceptedResponses.get(url);
        interceptedResponses.delete(url); // Clean up
        resolve(data);
      } else if (attempts >= maxAttempts) {
        resolve(null); // Timeout
      } else {
        setTimeout(checkForData, 200);
      }
    };
    
    checkForData();
  });
}

// Initialize when page is ready
waitForPageReady().then(() => {
  console.log('[ChatGPT Analyst] Content script loaded and ready');
  
  // Create initial overlay (hidden)
  createOverlay();
  hideOverlay();
});

// Try to get data from page JavaScript context
async function tryGetDataFromPageContext(url) {
  try {
    // Wait a bit for the data to be available in the page
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to access global variables or cached data that ChatGPT might use
    const pageData = await new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          // Try to find conversation data in common global variables
          let data = null;
          
          // Check for React state or Redux store
          if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            try {
              const reactInstances = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
              // This is a simplified approach - in practice, accessing React state is complex
            } catch (e) {}
          }
          
          // Check for any global conversation data
          if (window.conversation || window.conversationData) {
            data = window.conversation || window.conversationData;
          }
          
          // Post message back to content script
          window.postMessage({ type: 'CHATGPT_DATA', data: data }, '*');
        })();
      `;
      
      const messageHandler = (event) => {
        if (event.source === window && event.data.type === 'CHATGPT_DATA') {
          window.removeEventListener('message', messageHandler);
          document.head.removeChild(script);
          resolve(event.data.data);
        }
      };
      
      window.addEventListener('message', messageHandler);
      document.head.appendChild(script);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(null);
      }, 5000);
    });
    
    return pageData;
  } catch (error) {
    console.warn('[ChatGPT Analyst] Could not access page context:', error);
    return null;
  }
}

// Try to get data from DOM elements
async function tryGetDataFromDOM() {
  try {
    // Look for conversation data in DOM attributes or text content
    // ChatGPT might store data in hidden elements or data attributes
    
    const dataElements = document.querySelectorAll('[data-conversation], [data-message], script[type="application/json"]');
    
    for (const element of dataElements) {
      try {
        let content = element.textContent || element.getAttribute('data-conversation') || element.getAttribute('data-message');
        if (content) {
          const parsedData = JSON.parse(content);
          if (parsedData && parsedData.mapping) {
            return parsedData;
          }
        }
      } catch (e) {
        // Continue to next element
      }
    }
    
    // Try to find data in localStorage or sessionStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('conversation')) {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && data.mapping) {
            return data;
          }
        }
      }
    } catch (e) {}
    
    return null;
  } catch (error) {
    console.warn('[ChatGPT Analyst] Could not access DOM data:', error);
    return null;
  }
}

// Global functions for inline event handlers
window.copyToClipboard = copyToClipboard; 