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
  
  // Add event delegation for button clicks to avoid CSP violations
  overlay.addEventListener('click', (event) => {
    const target = event.target;
    const action = target.getAttribute('data-action');
    
    if (action === 'analyze') {
      event.preventDefault();
      analyzeCurrentConversation();
    } else if (action === 'copy') {
      event.preventDefault();
      const text = target.getAttribute('data-text');
      if (text) {
        copyToClipboard(text);
      }
    }
  });
  
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

// Create search queries display section
function createSearchQueriesDisplaySection(searchQueries) {
  const container = document.createElement('div');
  container.className = 'search-queries-section';
  
  const title = document.createElement('h4');
  title.textContent = `🔍 Search Queries Detected (${searchQueries.length}):`;
  title.className = 'section-title search-title';
  container.appendChild(title);
  
  const queriesList = document.createElement('ul');
  queriesList.className = 'queries-list';
  
  searchQueries.forEach((queryData, index) => {
    const listItem = document.createElement('li');
    listItem.className = 'query-item';
    listItem.innerHTML = `
      <span class="query-number">${index + 1}.</span>
      <span class="query-text">${escapeHtml(queryData.query)}</span>
      <button class="copy-btn" data-action="copy" data-text="${escapeHtml(queryData.query)}" title="Copy query">📋</button>
      ${queryData.timestamp ? `<span class="query-time">${new Date(queryData.timestamp).toLocaleTimeString()}</span>` : ''}
    `;
    queriesList.appendChild(listItem);
  });
  
  container.appendChild(queriesList);
  return container;
}

// Create thoughts display section
function createThoughtsDisplaySection(thoughts) {
  const container = document.createElement('div');
  container.className = 'thoughts-section';
  
  const title = document.createElement('h4');
  title.textContent = `💭 Internal Thoughts (${thoughts.length}):`;
  title.className = 'section-title thoughts-title';
  container.appendChild(title);
  
  thoughts.forEach((thought, index) => {
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
    
    if (thought.timestamp) {
      const timestamp = document.createElement('div');
      timestamp.className = 'thought-timestamp';
      timestamp.innerHTML = `<small>Time: ${new Date(thought.timestamp).toLocaleString()}</small>`;
      thoughtDiv.appendChild(timestamp);
    }
    
    container.appendChild(thoughtDiv);
  });
  
  return container;
}

// Create reasoning display section
function createReasoningDisplaySection(reasoning) {
  const container = document.createElement('div');
  container.className = 'reasoning-section';
  
  const title = document.createElement('h4');
  title.textContent = `🧠 Reasoning Patterns (${reasoning.length}):`;
  title.className = 'section-title reasoning-title';
  container.appendChild(title);
  
  reasoning.forEach((reasoningData, index) => {
    const reasoningDiv = document.createElement('div');
    reasoningDiv.className = 'reasoning-item';
    
    const content = document.createElement('div');
    content.className = 'reasoning-content';
    content.innerHTML = `<strong>${reasoningData.type}:</strong> ${escapeHtml(reasoningData.text)}`;
    reasoningDiv.appendChild(content);
    
    if (reasoningData.timestamp) {
      const timestamp = document.createElement('div');
      timestamp.className = 'reasoning-timestamp';
      timestamp.innerHTML = `<small>Time: ${new Date(reasoningData.timestamp).toLocaleString()}</small>`;
      reasoningDiv.appendChild(timestamp);
    }
    
    container.appendChild(reasoningDiv);
  });
  
  return container;
}

// Create metadata section
function createMetadataSection(metadata) {
  const container = document.createElement('div');
  container.className = 'metadata-section';
  
  const title = document.createElement('h4');
  title.textContent = '📊 Conversation Info:';
  title.className = 'section-title metadata-title';
  container.appendChild(title);
  
  const metadataDiv = document.createElement('div');
  metadataDiv.className = 'metadata-content';
  metadataDiv.innerHTML = `
    <div class="metadata-item">
      <strong>Title:</strong> ${escapeHtml(metadata.conversationTitle)}
    </div>
    <div class="metadata-item">
      <strong>Total Messages:</strong> ${metadata.totalMessages}
    </div>
    ${metadata.lastUpdate ? `
      <div class="metadata-item">
        <strong>Last Update:</strong> ${new Date(metadata.lastUpdate).toLocaleString()}
      </div>
    ` : ''}
  `;
  
  container.appendChild(metadataDiv);
  return container;
}

// Add export functionality
function addExportButton(contentDiv, analysisData) {
  const exportDiv = document.createElement('div');
  exportDiv.className = 'export-section';
  
  const exportBtn = document.createElement('button');
  exportBtn.className = 'export-btn';
  exportBtn.textContent = '📊 Export Data';
  exportBtn.onclick = () => exportAnalysisData(analysisData);
  
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

// Export analysis data functionality
function exportAnalysisData(analysisData) {
  const exportData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    conversationId: getCurrentConversationId(),
    data: {
      searchQueries: analysisData.searchQueries || [],
      thoughts: analysisData.thoughts || [],
      reasoning: analysisData.reasoning || [],
      metadata: analysisData.metadata || {}
    },
    summary: {
      totalSearchQueries: (analysisData.searchQueries || []).length,
      totalThoughts: (analysisData.thoughts || []).length,
      totalReasoningPatterns: (analysisData.reasoning || []).length,
      hasData: analysisData.hasData
    }
  };
  
  // Copy to clipboard
  navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
    .then(() => {
      showNotification('Analysis data exported to clipboard!');
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

// Listen for intercepted conversation data from main world
window.addEventListener('message', (event) => {
  if (event.source === window) {
    if (event.data.type === 'CHATGPT_CONVERSATION_DATA') {
      console.log('[ChatGPT Analyst] Received intercepted conversation data:', event.data.url);
      
      try {
        const conversationData = event.data.data;
        console.log('[ChatGPT Analyst] Processing intercepted conversation data...');
        
        // Use existing analysis function to process the data
        const analysisData = extractSearchAndReasoning(conversationData);
        
        if (analysisData.hasData) {
          console.log('[ChatGPT Analyst] Found analysis data in intercepted response:', {
            searchQueries: analysisData.searchQueries.length,
            thoughts: analysisData.thoughts.length,
            reasoning: analysisData.reasoning.length
          });
          showAnalysisResult(analysisData);
        } else {
          console.log('[ChatGPT Analyst] No analysis data found in intercepted response');
          showAnalysisResult({
            hasData: false,
            searchQueries: [],
            thoughts: [],
            reasoning: [],
            error: 'No search queries or internal reasoning found in this conversation'
          });
        }
        
      } catch (error) {
        console.error('[ChatGPT Analyst] Error processing intercepted data:', error);
        showAnalysisResult({
          hasData: false,
          searchQueries: [],
          thoughts: [],
          reasoning: [],
          error: `Error processing conversation data: ${error.message}`
        });
      }
    } else if (event.data.type === 'CHATGPT_CONVERSATION_ERROR') {
      console.error('[ChatGPT Analyst] Received conversation error:', event.data.error);
      showAnalysisResult({
        hasData: false,
        searchQueries: [],
        thoughts: [],
        reasoning: [],
        error: `Failed to fetch conversation data: ${event.data.error}`
      });
    }
  }
});

// Message handler for background script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ChatGPT Analyst] Received message:', request);
  
  switch (request.action) {
    case 'analyzeConversation':
      // Manual analysis trigger - try direct API call as fallback
      analyzeCurrentConversation();
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
        hasData: currentData !== null,
        conversationId: getCurrentConversationId()
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
          addPromotionalContent(contentDiv);
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

// Global function removed - using event delegation to avoid CSP violations

// Keyboard shortcut handler
document.addEventListener('keydown', (event) => {
  // Ctrl+Shift+S to toggle overlay
  if (event.ctrlKey && event.shiftKey && event.key === 'S') {
    event.preventDefault();
    toggleOverlay();
  }
  
  // Ctrl+Shift+A to trigger analysis
  if (event.ctrlKey && event.shiftKey && event.key === 'A') {
    event.preventDefault();
    analyzeCurrentConversation();
  }
});

// Auto-trigger analysis when page content changes (new messages)
let lastMessageCount = 0;
function observeForNewMessages() {
  const observer = new MutationObserver((mutations) => {
    // Check if new message elements were added
    const messageElements = document.querySelectorAll('[data-message-author-role]');
    if (messageElements.length > lastMessageCount) {
      lastMessageCount = messageElements.length;
      // Wait a bit for the message to be fully rendered
      setTimeout(() => {
        console.log('[ChatGPT Analyst] New message detected, triggering analysis...');
        analyzeCurrentConversation();
      }, 2000);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Extract conversation ID from current URL
function getCurrentConversationId() {
  const match = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

// Network interception approach - no longer need direct API calls

// Improved function to trigger analysis with fallback methods
function analyzeCurrentConversation() {
  console.log('[ChatGPT Analyst] Manual analysis requested...');
  console.log('[ChatGPT Analyst] Current URL:', window.location.href);
  
  const conversationId = getCurrentConversationId();
  
  if (!conversationId) {
    console.log('[ChatGPT Analyst] No conversation ID found in URL');
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      error: 'Not in a ChatGPT conversation. Please navigate to a ChatGPT conversation first.'
    });
    return;
  }
  
  console.log('[ChatGPT Analyst] Found conversation ID:', conversationId);
  console.log('[ChatGPT Analyst] User workflow: Go to ChatGPT -> Make prompt with search -> Open network tab -> Copy ID -> Refresh page -> Search for ID in network tab');
  
  // Show loading state
  showAnalysisResult({
    hasData: false,
    searchQueries: [],
    thoughts: [],
    reasoning: [],
    isLoading: true
  });
  
  // Request manual analysis from background script
  chrome.runtime.sendMessage({
    action: "manualAnalysis",
    conversationId: conversationId
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[ChatGPT Analyst] Extension communication error:', chrome.runtime.lastError);
      showAnalysisResult({
        hasData: false,
        searchQueries: [],
        thoughts: [],
        reasoning: [],
        error: 'Extension communication error. Please reload the page and try again.'
      });
      return;
    }
    
    if (response && response.error) {
      console.error('[ChatGPT Analyst] Manual analysis error:', response.error);
      showAnalysisResult({
        hasData: false,
        searchQueries: [],
        thoughts: [],
        reasoning: [],
        error: response.error
      });
      return;
    }
    
    console.log('[ChatGPT Analyst] Manual analysis initiated, waiting for response...');
    
    // Set a timeout to show waiting state if no response comes quickly
    setTimeout(() => {
      if (currentData && currentData.isLoading) {
        console.log('[ChatGPT Analyst] Switching to waiting mode...');
        showAnalysisResult({
          hasData: false,
          searchQueries: [],
          thoughts: [],
          reasoning: [],
          isWaiting: true
        });
      }
    }, 3000);
  });
}

// Extract search queries and reasoning from conversation data
function extractSearchAndReasoning(data) {
  const result = {
    hasData: false,
    searchQueries: [],
    thoughts: [],
    reasoning: [],
    metadata: {
      conversationTitle: data.title || 'Untitled Conversation',
      lastUpdate: data.update_time ? new Date(data.update_time * 1000).toISOString() : null,
      totalMessages: 0
    }
  };
  
  if (!data || !data.mapping) {
    return result;
  }
  
  // Count total messages
  result.metadata.totalMessages = Object.keys(data.mapping).filter(
    nodeId => data.mapping[nodeId].message && data.mapping[nodeId].message.author
  ).length;
  
  // Process each node in the conversation mapping
  for (const nodeId in data.mapping) {
    const node = data.mapping[nodeId];
    
    if (!node.message || !node.message.author) continue;
    
    const message = node.message;
    
    // Extract search queries from metadata
    if (message.metadata && message.metadata.search_queries && message.metadata.search_queries.length > 0) {
      message.metadata.search_queries.forEach(query => {
        result.searchQueries.push({
          query: typeof query === 'string' ? query : query.q || query.query || 'Unknown query',
          timestamp: message.create_time ? new Date(message.create_time * 1000).toISOString() : null,
          messageId: nodeId,
          author: message.author.role
        });
      });
      result.hasData = true;
    }
    
    // Extract thoughts from content
    if (message.content && message.content.content_type === 'thoughts' && message.content.thoughts) {
      message.content.thoughts.forEach(thought => {
        result.thoughts.push({
          summary: thought.summary || null,
          content: thought.content || thought.text || 'No content',
          timestamp: message.create_time ? new Date(message.create_time * 1000).toISOString() : null,
          messageId: nodeId,
          author: message.author.role
        });
      });
      result.hasData = true;
    }
    
    // Extract reasoning from assistant messages (look for specific patterns)
    if (message.author.role === 'assistant' && message.content && message.content.parts) {
      message.content.parts.forEach(part => {
        if (typeof part === 'string' && part.length > 0) {
          // Look for reasoning patterns in the text
          const reasoningIndicators = [
            /I need to search for/i,
            /Let me search for/i,
            /I'll look up/i,
            /Based on my search/i,
            /From my research/i,
            /I should find/i
          ];
          
          reasoningIndicators.forEach(pattern => {
            if (pattern.test(part)) {
              result.reasoning.push({
                text: part.substring(0, 500) + (part.length > 500 ? '...' : ''),
                type: 'search_reasoning',
                timestamp: message.create_time ? new Date(message.create_time * 1000).toISOString() : null,
                messageId: nodeId,
                author: message.author.role
              });
              result.hasData = true;
            }
          });
        }
      });
    }
  }
  
  return result;
}

// Show analysis results in overlay
function showAnalysisResult(analysisData) {
  // Create overlay if it doesn't exist
  if (!overlayElement) {
    createOverlay();
  }
  
  const contentDiv = document.getElementById(CONFIG.contentId);
  const statusDiv = overlayElement.querySelector('.overlay-status');
  
  if (!contentDiv) return;
  
  // Clear existing content
  contentDiv.innerHTML = '';
  
  // Update status
  if (analysisData.isLoading) {
    statusDiv.textContent = 'Loading conversation data...';
    contentDiv.innerHTML = `
      <div class="loading-message">
        <h4>🔄 Analyzing Conversation...</h4>
        <p>Fetching conversation data from ChatGPT API...</p>
      </div>
    `;
    addPromotionalContent(contentDiv);
    showOverlay();
    return;
  } else if (analysisData.isWaiting) {
    statusDiv.textContent = 'Waiting for network traffic...';
    contentDiv.innerHTML = `
      <div class="loading-message">
        <h4>🔍 Monitoring Network Traffic...</h4>
        <p>Waiting for ChatGPT to make API requests...</p>
        <div class="user-guidance">
          <p><strong>Try these actions to trigger network activity:</strong></p>
          <ul>
            <li>Ask ChatGPT a new question</li>
            <li>Refresh the conversation (F5)</li>
            <li>Navigate to a different active conversation</li>
            <li>Start a new conversation with a research-oriented question</li>
          </ul>
        </div>
        <p><small><strong>Current conversation ID:</strong> ${getCurrentConversationId()}</small></p>
      </div>
    `;
    addPromotionalContent(contentDiv);
    showOverlay();
    return;
  } else if (analysisData.error) {
    statusDiv.textContent = `Error: ${analysisData.error}`;
    
    let troubleshootingTips = '';
    if (analysisData.error.includes('404')) {
      troubleshootingTips = `
        <div class="troubleshooting">
          <h5>💡 Troubleshooting Tips:</h5>
          <ul>
            <li>This conversation may have expired or been deleted</li>
            <li>Try starting a new conversation</li>
            <li>Navigate to an existing active conversation</li>
            <li>Check if you're still logged into ChatGPT</li>
          </ul>
        </div>
      `;
    } else if (analysisData.error.includes('401') || analysisData.error.includes('403')) {
      troubleshootingTips = `
        <div class="troubleshooting">
          <h5>🔑 Authentication Issue:</h5>
          <ul>
            <li>Please make sure you're logged into ChatGPT</li>
            <li>Try refreshing the page (F5)</li>
            <li>Log out and back into ChatGPT</li>
            <li>Clear browser cache and cookies for chatgpt.com</li>
          </ul>
        </div>
      `;
    } else if (analysisData.error.includes('communication error')) {
      troubleshootingTips = `
        <div class="troubleshooting">
          <h5>🔧 Extension Issue:</h5>
          <ul>
            <li>Reload this page (F5)</li>
            <li>Disable and re-enable the extension</li>
            <li>Check if other extensions are interfering</li>
            <li>Try opening ChatGPT in an incognito window</li>
          </ul>
        </div>
      `;
    }
    
    contentDiv.innerHTML = `
      <div class="error-message">
        <h4>⚠️ Analysis Error</h4>
        <p>${escapeHtml(analysisData.error)}</p>
        ${troubleshootingTips}
        <div class="error-actions">
          <button class="retry-btn" data-action="analyze">🔄 Retry Analysis</button>
          <button class="new-conversation-btn" onclick="window.open('https://chatgpt.com/', '_blank')">💬 New Conversation</button>
        </div>
        <details class="debug-info">
          <summary>🔍 Debug Information</summary>
          <p><small><strong>Current URL:</strong> ${window.location.href}</small></p>
          <p><small><strong>Conversation ID:</strong> ${getCurrentConversationId() || 'Not found'}</small></p>
          <p><small><strong>Timestamp:</strong> ${new Date().toISOString()}</small></p>
        </details>
      </div>
    `;
    addPromotionalContent(contentDiv);
    showOverlay();
    return;
  } else {
    statusDiv.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  }
  
  // Show results
  if (!analysisData.hasData) {
    contentDiv.innerHTML = `
      <div class="no-data">
        <h4>🔍 No Analysis Data Found</h4>
        <p>This conversation doesn't contain detectable search queries or internal reasoning.</p>
        <p><small>Try asking ChatGPT a question that requires research or web searches.</small></p>
      </div>
    `;
    addPromotionalContent(contentDiv);
    showOverlay();
    return;
  }
  
  // Create sections for different types of data
  if (analysisData.searchQueries.length > 0) {
    const section = createSearchQueriesDisplaySection(analysisData.searchQueries);
    contentDiv.appendChild(section);
  }
  
  if (analysisData.thoughts.length > 0) {
    const section = createThoughtsDisplaySection(analysisData.thoughts);
    contentDiv.appendChild(section);
  }
  
  if (analysisData.reasoning.length > 0) {
    const section = createReasoningDisplaySection(analysisData.reasoning);
    contentDiv.appendChild(section);
  }
  
  // Add metadata section
  if (analysisData.metadata) {
    const metadataSection = createMetadataSection(analysisData.metadata);
    contentDiv.appendChild(metadataSection);
  }
  
  // Add export functionality
  addExportButton(contentDiv, analysisData);
  
  // Add promotional content
  addPromotionalContent(contentDiv);
  
  // Store current data
  currentData = analysisData;
  
  // Show overlay automatically if configured
  if (CONFIG.autoShow) {
    showOverlay();
  }
  
  console.log('[ChatGPT Analyst] Analysis complete:', {
    searchQueries: analysisData.searchQueries.length,
    thoughts: analysisData.thoughts.length,
    reasoning: analysisData.reasoning.length
  });
}

// Clean up function - no longer needed with direct API approach

// Initialize the extension
async function initializeChatGPTAnalyst() {
  console.log('[ChatGPT Analyst] Initializing extension...');
  
  // Wait for page to be ready
  await waitForPageReady();
  
  // Start observing for new messages
  observeForNewMessages();
  
  // Create overlay initially hidden
  createOverlay();
  hideOverlay();
  
  // Show initial message
  const contentDiv = document.getElementById(CONFIG.contentId);
  if (contentDiv) {
    contentDiv.innerHTML = `
      <div class="init-message">
        <h4>🔍 ChatGPT SEO Analyst Ready</h4>
        <p>Extension is now monitoring this conversation.</p>
        <p><strong>How to use:</strong></p>
        <ul>
          <li>Ask ChatGPT questions that require research</li>
          <li>Press <kbd>Ctrl+Shift+A</kbd> to analyze current conversation</li>
          <li>Press <kbd>Ctrl+Shift+S</kbd> to toggle this overlay</li>
        </ul>
        <button class="analyze-btn" data-action="analyze">🔍 Analyze Now</button>
      </div>
    `;
    addPromotionalContent(contentDiv);
  }
  
  console.log('[ChatGPT Analyst] Extension initialized successfully');
}

// Initialize when page is ready
initializeChatGPTAnalyst();

// Legacy functions removed - no longer needed with direct API approach
// These functions violated CSP by injecting inline scripts
// Global functions removed - using event delegation to avoid CSP violations 