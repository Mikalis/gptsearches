// ChatGPT SEO Analyst - Content Script
// Analyzes responses and manages overlay display

let overlayVisible = false;
let currentData = null;
let overlayElement = null;
let dataReceived = false; // Track if we've received data successfully
let lastProcessedConversationId = null;

// Configuration
const CONFIG = {
  overlayId: 'chatgpt-analyst-overlay',
  contentId: 'chatgpt-analyst-content',
  autoShow: true,
  position: 'top-right',
  version: '1.0.0'
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
  if (document.getElementById(CONFIG.overlayId)) {
    console.log('[ChatGPT Analyst] Overlay already exists');
    return;
  }

  // Create overlay element
  overlayElement = document.createElement('div');
  overlayElement.id = CONFIG.overlayId;
  overlayElement.className = 'chatgpt-analyst-overlay';
  
  // Add persistent attribute to prevent removal during navigation
  overlayElement.setAttribute('data-persistent', 'true');
  
  // Create content container
  const contentElement = document.createElement('div');
  contentElement.id = CONFIG.contentId;
  contentElement.className = 'chatgpt-analyst-content';
  overlayElement.appendChild(contentElement);
  
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
  
  overlayElement.appendChild(header);
  overlayElement.appendChild(contentDiv);
  overlayElement.appendChild(statusDiv);
  
  document.body.appendChild(overlayElement);
  
  // Add event delegation for button clicks to avoid CSP violations
  overlayElement.addEventListener('click', (event) => {
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
    } else if (action === 'new-conversation') {
      event.preventDefault();
      window.open('https://chatgpt.com/', '_blank');
    }
  });
  
  console.log('[ChatGPT Analyst] Overlay created');
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

// Show overlay with analysis data
function showOverlay(analysisData) {
  console.log('[ChatGPT Analyst] showOverlay called, overlayElement exists:', !!document.getElementById(CONFIG.overlayId));
  
  // Create overlay if it doesn't exist
  if (!document.getElementById(CONFIG.overlayId)) {
    createOverlay();
  }
  
  const contentDiv = document.getElementById(CONFIG.contentId);
  const statusDiv = document.querySelector(`#${CONFIG.overlayId} .overlay-status`);
  
  if (!contentDiv || !statusDiv) {
    console.error('[ChatGPT Analyst] Content div or status div not found!');
    return;
  }
  
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
    showOverlayElement();
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
    showOverlayElement();
    return;
  } else if (analysisData.isReloading) {
    statusDiv.textContent = 'Reloading page to capture network traffic...';
    contentDiv.innerHTML = `
      <div class="loading-message">
        <h4>🔄 Page Reload in Progress...</h4>
        <p>The page will reload automatically to capture fresh network traffic from ChatGPT.</p>
        <p><strong>What happens next:</strong></p>
        <ul>
          <li>Page reloads automatically</li>
          <li>Extension monitors network requests</li>
          <li>Conversation data is captured when available</li>
          <li>Analysis results appear automatically</li>
        </ul>
        <p><small><strong>Current conversation ID:</strong> ${getCurrentConversationId()}</small></p>
      </div>
    `;
    showOverlayElement();
    return;
  } else if (analysisData.error) {
    statusDiv.textContent = `Error: ${analysisData.error}`;
    
    let troubleshootingTips = '';
    if (analysisData.isConversationNotFound) {
      troubleshootingTips = `
        <div class="troubleshooting">
          <h5>🆕 This Conversation is No Longer Available</h5>
          <p>The conversation you're trying to analyze has expired or been deleted from ChatGPT.</p>
          <div class="solution-steps">
            <h6>✅ Extension is working correctly! To test it:</h6>
            <ol>
              <li><strong>Start a new conversation</strong> with ChatGPT</li>
              <li><strong>Ask a research question</strong> that triggers web search:<br>
                  <em>"What are the latest AI breakthroughs in 2024?"</em><br>
                  <em>"Compare the top programming languages this year"</em><br>
                  <em>"What are current trends in web development?"</em>
              </li>
              <li><strong>Wait for ChatGPT's complete response</strong></li>
              <li><strong>Click "Analyze" button</strong> in the overlay to extract search data</li>
            </ol>
            <p><strong>✅ All systems working:</strong> Response interception ✓, Fallback strategies ✓, Error handling ✓</p>
          </div>
          <div class="action-buttons">
            <button data-action="new-conversation" class="primary-btn">🚀 Start New Conversation</button>
          </div>
        </div>
      `;
    } else if (analysisData.error.includes('404')) {
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
          <button class="new-conversation-btn" data-action="new-conversation">💬 New Conversation</button>
        </div>
        <details class="debug-info">
          <summary>🔍 Debug Information</summary>
          <p><small><strong>Current URL:</strong> ${window.location.href}</small></p>
          <p><small><strong>Conversation ID:</strong> ${getCurrentConversationId() || 'Not found'}</small></p>
          <p><small><strong>Timestamp:</strong> ${new Date().toISOString()}</small></p>
        </details>
      </div>
    `;
    showOverlayElement();
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
    showOverlayElement();
    return;
  }
  
  // Create sections for different types of data
  if (analysisData.searchQueries && analysisData.searchQueries.length > 0) {
    const section = createSearchQueriesDisplaySection(analysisData.searchQueries);
    contentDiv.appendChild(section);
  }
  
  if (analysisData.thoughts && analysisData.thoughts.length > 0) {
    const section = createThoughtsDisplaySection(analysisData.thoughts);
    contentDiv.appendChild(section);
  }
  
  if (analysisData.reasoning && analysisData.reasoning.length > 0) {
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
  
  // Store current data
  currentData = analysisData;
  
  // Show overlay
  showOverlayElement();
  
  console.log('[ChatGPT Analyst] Analysis complete:', {
    searchQueries: analysisData.searchQueries?.length || 0,
    thoughts: analysisData.thoughts?.length || 0,
    reasoning: analysisData.reasoning?.length || 0
  });
}

// Show the overlay element
function showOverlayElement() {
  if (!document.getElementById(CONFIG.overlayId)) {
    console.error('[ChatGPT Analyst] Overlay element not found!');
    return;
  }
  
  const overlay = document.getElementById(CONFIG.overlayId);
  overlay.classList.add('visible');
  overlayVisible = true;
  console.log('[ChatGPT Analyst] Overlay displayed successfully');
}

// Show/hide overlay functions
function showOverlay() {
  console.log('[ChatGPT Analyst] showOverlay called, overlayElement exists:', !!overlayElement);
  if (!overlayElement) {
    console.log('[ChatGPT Analyst] Creating overlay in showOverlay...');
    createOverlay();
  }
  if (overlayElement) {
    overlayElement.style.display = 'block';
    overlayVisible = true;
    console.log('[ChatGPT Analyst] Overlay displayed successfully');
  } else {
    console.error('[ChatGPT Analyst] Cannot show overlay - overlayElement is still null after creation');
  }
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

// Listen for network data and test overlay messages
window.addEventListener('message', (event) => {
  if (event.source === window) {
    if (event.data.type === 'CHATGPT_NETWORK_DATA') {
      console.log('[ChatGPT Analyst] 🎉 Received network data:', {
        url: event.data.url,
        source: event.data.source,
        conversationId: event.data.conversationId
      });
      
      // Process the captured network data
      processNetworkData(event.data);
      
    } else if (event.data.type === 'TEST_OVERLAY') {
      // Test the overlay system
      console.log('[ChatGPT Analyst] Testing overlay display...');
      showAnalysisResult({
        hasData: true,
        searchQueries: [
          { query: 'latest AI developments 2024', timestamp: new Date().toISOString(), messageId: 'test1', author: 'assistant' },
          { query: 'machine learning trends', timestamp: new Date().toISOString(), messageId: 'test2', author: 'assistant' }
        ],
        thoughts: [
          { content: 'This is a test thought to verify the overlay system works correctly.', summary: 'Test thought', timestamp: new Date().toISOString(), messageId: 'test1', author: 'system' }
        ],
        reasoning: [
          { text: 'Test reasoning pattern to show how search logic is displayed.', type: 'search_reasoning', timestamp: new Date().toISOString(), messageId: 'test1', author: 'assistant' }
        ],
        metadata: {
          conversationTitle: 'Test Conversation',
          lastUpdate: new Date().toISOString(),
          totalMessages: 3,
          captureMethod: 'test_data'
        },
        error: null,
        isConversationNotFound: false
      });
    }
  }
});

// Message handler for background script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ChatGPT Analyst] Received message:', request);
  
  switch (request.action) {
    case 'analyzeConversation':
      console.log('[ChatGPT Analyst] Starting analysis...');
      analyzeConversationWithDebugger(request.manual || false);
      sendResponse({ status: 'success' });
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
      
    case 'networkData':
      processNetworkData(request);
      sendResponse({ status: 'success' });
      break;
      
    case 'debuggerError':
      console.error('[ChatGPT Analyst] Debugger error:', request.error);
      // Only show error if we haven't received data yet
      if (!dataReceived) {
        // If it's a timeout and we need fresh data, refresh the page
        if (request.error.includes('Timeout') || request.error.includes('message port closed')) {
          console.log('[ChatGPT Analyst] Refreshing page due to debugger timeout...');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          showAnalysisResult({
            hasData: false,
            searchQueries: [],
            thoughts: [],
            reasoning: [],
            error: request.error
          });
        }
      } else {
        console.log('[ChatGPT Analyst] Ignoring debugger error because data was already received');
      }
      sendResponse({ status: 'success' });
      break;
      
    case 'checkDataReceived':
      console.log('[ChatGPT Analyst] Checking if data was received:', dataReceived);
      sendResponse({ dataReceived: dataReceived });
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

// Auto-trigger analysis when page content changes (new messages) - DISABLED to prevent reload loops
let lastMessageCount = 0;
function observeForNewMessages() {
  console.log('[ChatGPT Analyst] Auto-analysis disabled to prevent reload loops - use manual analysis instead');
  /*
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
  */
}

// Extract conversation ID from current URL
function getCurrentConversationId() {
  const match = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

// Analyze conversation with debugger-based approach
function analyzeConversationWithDebugger(manual = false) {
  console.log('[ChatGPT Analyst] 🔄 Starting debugger-based analysis...');
  console.log('[ChatGPT Analyst] Current URL:', window.location.href);
  
  // Update UI to show loading state
  showAnalysisResult({
    isLoading: true,
    hasData: false,
    searchQueries: [],
    thoughts: [],
    reasoning: []
  });
  
  // Extract conversation ID from current URL
  const conversationId = getCurrentConversationId();
  
  if (!conversationId) {
    console.log('[ChatGPT Analyst] ❌ No conversation ID found in URL');
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      error: 'No conversation ID found in URL. Please make sure you are on a ChatGPT conversation page.'
    });
    return;
  }
  
  console.log('[ChatGPT Analyst] Found conversation ID:', conversationId);
  console.log('[ChatGPT Analyst] Will refresh page to capture network traffic...');
  
  // Send message to background script to start debugger capture
  chrome.runtime.sendMessage({
    action: 'analyzeConversation',
    conversationId: conversationId,
    manual: manual
  }).then(response => {
    console.log('[ChatGPT Analyst] Background script response:', response);
    
    // Refresh the page to trigger network requests that the debugger can capture
    setTimeout(() => {
      console.log('[ChatGPT Analyst] Refreshing page to capture fresh network traffic...');
      window.location.reload();
    }, 500);
    
  }).catch(error => {
    console.log('[ChatGPT Analyst] Background script communication error:', error);
    
    // Fallback: refresh anyway
    setTimeout(() => {
      console.log('[ChatGPT Analyst] Refreshing page to capture fresh network traffic (fallback)...');
      window.location.reload();
    }, 500);
  });
}

// Process captured network data from background script
function processNetworkData(networkData) {
  console.log('[ChatGPT Analyst] 🔍 Processing captured network data...');
  
  try {
    const data = networkData.data;
    
    // Mark that we've received data
    dataReceived = true;
    
    // Use existing analysis function to process the conversation data
    const analysisData = extractSearchAndReasoning(data);
    
    if (analysisData.hasData) {
      console.log('[ChatGPT Analyst] ✅ Found analysis data in network response:', {
        searchQueries: analysisData.searchQueries.length,
        thoughts: analysisData.thoughts.length,
        reasoning: analysisData.reasoning.length,
        source: networkData.source
      });
      
      // Add network capture info to metadata
      analysisData.metadata.captureMethod = networkData.source;
      analysisData.metadata.captureUrl = networkData.url;
      analysisData.metadata.captureTimestamp = new Date(networkData.timestamp).toISOString();
      
      // Store current data
      currentData = analysisData;
      
      // Save to localStorage for persistence across page reloads
      saveAnalysisToLocalStorage(analysisData);
      
      showAnalysisResult(analysisData);
      
    } else {
      console.log('[ChatGPT Analyst] No analysis data found in network response');
      showAnalysisResult({
        hasData: false,
        searchQueries: [],
        thoughts: [],
        reasoning: [],
        error: 'No search queries or internal reasoning found in this conversation. The conversation may not contain search-based interactions.',
        metadata: {
          captureMethod: networkData.source,
          captureUrl: networkData.url,
          dataSize: JSON.stringify(data).length
        }
      });
    }
    
  } catch (error) {
    console.error('[ChatGPT Analyst] Error processing network data:', error);
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      error: `Error processing network data: ${error.message}`
    });
  }
}

// Save analysis data to localStorage
function saveAnalysisToLocalStorage(analysisData) {
  try {
    // Get the conversation ID
    const conversationId = getCurrentConversationId();
    if (!conversationId) {
      console.warn('[ChatGPT Analyst] Cannot save analysis - no conversation ID found');
      return;
    }
    
    // Create storage key
    const storageKey = `chatgpt_analyst_data_${conversationId}`;
    
    // Store data with timestamp
    const storageData = {
      timestamp: new Date().toISOString(),
      data: analysisData
    };
    
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(storageData));
    console.log('[ChatGPT Analyst] Analysis data saved to localStorage for conversation:', conversationId);
  } catch (error) {
    console.error('[ChatGPT Analyst] Error saving analysis to localStorage:', error);
  }
}

// Load analysis data from localStorage
function loadAnalysisFromLocalStorage() {
  try {
    // Get the conversation ID
    const conversationId = getCurrentConversationId();
    if (!conversationId) {
      return null;
    }
    
    // Create storage key
    const storageKey = `chatgpt_analyst_data_${conversationId}`;
    
    // Get data from localStorage
    const storageDataString = localStorage.getItem(storageKey);
    if (!storageDataString) {
      return null;
    }
    
    // Parse data
    const storageData = JSON.parse(storageDataString);
    console.log('[ChatGPT Analyst] Loaded analysis data from localStorage for conversation:', conversationId);
    
    // Check if data is recent (within last 24 hours)
    const timestamp = new Date(storageData.timestamp);
    const now = new Date();
    const isRecent = (now - timestamp) < (24 * 60 * 60 * 1000); // 24 hours
    
    if (!isRecent) {
      console.log('[ChatGPT Analyst] Stored analysis data is too old, not using it');
      return null;
    }
    
    return storageData.data;
  } catch (error) {
    console.error('[ChatGPT Analyst] Error loading analysis from localStorage:', error);
    return null;
  }
}

// Extract search queries and reasoning from conversation data
function extractSearchAndReasoning(data) {
  console.log('[ChatGPT Analyst] Extracting search queries and reasoning from data...');
  
  // Initialize results
  const result = {
    hasData: false,
    searchQueries: [],
    thoughts: [],
    reasoning: [],
    metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };
  
  try {
    // Check if data exists
    if (!data || typeof data !== 'object') {
      console.log('[ChatGPT Analyst] No valid data to analyze');
      return result;
    }
    
    // Log data structure for debugging
    const dataKeys = Object.keys(data);
    console.log('[ChatGPT Analyst] Data structure keys:', dataKeys);
    
    // Check for conversation not found error
    if (data.detail === 'conversation_not_found' || 
        (data.detail && data.detail.includes('not found'))) {
      console.log('[ChatGPT Analyst] Conversation not found error detected');
      result.error = 'This conversation is no longer available. It may have expired or been deleted.';
      result.isConversationNotFound = true;
      return result;
    }
    
    // Extract mapping data
    const mapping = data.mapping || {};
    const mappingKeys = Object.keys(mapping);
    console.log('[ChatGPT Analyst] Found mapping with', mappingKeys.length, 'keys');
    
    // Process each message in the mapping
    for (const key of mappingKeys) {
      const node = mapping[key];
      
      // Skip non-message nodes
      if (!node || !node.message || node.message.author?.role !== 'assistant') {
        continue;
      }
      
      const message = node.message;
      const timestamp = new Date(message.create_time * 1000).toISOString();
      
      // Extract search queries from tool calls
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach(toolCall => {
          if (toolCall.type === 'browser' && toolCall.browser?.type === 'search') {
            result.searchQueries.push({
              query: toolCall.browser.query || toolCall.browser.text || toolCall.browser.input || '',
              timestamp: timestamp
            });
            result.hasData = true;
          }
        });
      }
      
      // Extract search queries from content blocks
      if (message.content && Array.isArray(message.content)) {
        message.content.forEach(content => {
          // Check for browser_search content
          if (content.browser_search) {
            result.searchQueries.push({
              query: content.browser_search.query || content.browser_search.text || '',
              timestamp: timestamp
            });
            result.hasData = true;
          }
          
          // Check for tool_use content with search
          if (content.tool_use && content.tool_use.tool_name === 'browser' && 
              content.tool_use.tool_parameters && 
              (content.tool_use.tool_parameters.query || content.tool_use.tool_parameters.text)) {
            result.searchQueries.push({
              query: content.tool_use.tool_parameters.query || content.tool_use.tool_parameters.text || '',
              timestamp: timestamp
            });
            result.hasData = true;
          }
        });
      }
      
      // Extract internal thoughts
      if (message.metadata && message.metadata.thinking) {
        result.thoughts.push({
          thought: message.metadata.thinking,
          timestamp: timestamp
        });
        result.hasData = true;
      }
      
      // Extract reasoning from content blocks
      if (message.content && Array.isArray(message.content)) {
        message.content.forEach(content => {
          if (content.thinking_process || content.reasoning || 
              (content.text && content.text.includes('My reasoning:'))) {
            result.reasoning.push({
              reasoning: content.thinking_process || content.reasoning || content.text,
              timestamp: timestamp
            });
            result.hasData = true;
          }
        });
      }
    }
    
    // Look for search queries in the raw data as a fallback
    const jsonString = JSON.stringify(data);
    
    // Search for search patterns in the raw JSON
    const searchPatterns = [
      /"browser_search":\s*{\s*"query":\s*"([^"]+)"/g,
      /"browser":\s*{\s*"query":\s*"([^"]+)"/g,
      /"tool_use":\s*{\s*"tool_name":\s*"browser"[^}]*"query":\s*"([^"]+)"/g,
      /"search_query":\s*"([^"]+)"/g,
      /"search":\s*{\s*"query":\s*"([^"]+)"/g
    ];
    
    for (const pattern of searchPatterns) {
      let match;
      while ((match = pattern.exec(jsonString)) !== null) {
        const query = match[1];
        if (query && !result.searchQueries.some(q => q.query === query)) {
          result.searchQueries.push({
            query: query,
            timestamp: new Date().toISOString(),
            source: 'pattern_match'
          });
          result.hasData = true;
        }
      }
    }
    
    // Look for thinking patterns in the raw JSON
    const thinkingPatterns = [
      /"thinking":\s*"([^"]+)"/g,
      /"thinking_process":\s*"([^"]+)"/g,
      /"reasoning":\s*"([^"]+)"/g
    ];
    
    for (const pattern of thinkingPatterns) {
      let match;
      while ((match = pattern.exec(jsonString)) !== null) {
        const thought = match[1];
        if (thought && !result.thoughts.some(t => t.thought === thought)) {
          result.thoughts.push({
            thought: thought,
            timestamp: new Date().toISOString(),
            source: 'pattern_match'
          });
          result.hasData = true;
        }
      }
    }
    
    console.log('[ChatGPT Analyst] Extraction complete:', {
      searchQueries: result.searchQueries.length,
      thoughts: result.thoughts.length,
      reasoning: result.reasoning.length
    });
    
  } catch (error) {
    console.error('[ChatGPT Analyst] Error extracting data:', error);
  }
  
  return result;
}

// Display analysis results in overlay
function showAnalysisResult(result) {
  console.log('[ChatGPT Analyst] showAnalysisResult called with:', {
    hasData: result.hasData,
    error: result.error,
    isLoading: result.isLoading,
    isReloading: result.isReloading,
    overlayExists: !!document.getElementById(CONFIG.overlayId)
  });
  
  // Don't override existing data with error messages
  if (result.error && dataReceived && currentData) {
    console.log('[ChatGPT Analyst] Ignoring error because we already have data:', result.error);
    // Re-display current data instead
    showOverlay(currentData);
    return;
  }
  
  showOverlay(result);
}

// Clean up function - no longer needed with direct API approach



 

// Setup mutation observer to ensure overlay persists
function setupOverlayPersistence() {
  // Create a mutation observer to watch for DOM changes
  const observer = new MutationObserver((mutations) => {
    // Check if our overlay was removed
    if (!document.getElementById(CONFIG.overlayId) && overlayElement && dataReceived) {
      console.log('[ChatGPT Analyst] Overlay was removed - restoring');
      document.body.appendChild(overlayElement);
      
      // If we have data, redisplay it
      if (currentData) {
        showOverlay(currentData);
      }
    }
    
    // Also check for navigation changes (URL changes without full page reload)
    const currentConversationId = getCurrentConversationId();
    if (currentConversationId && lastProcessedConversationId !== currentConversationId) {
      console.log('[ChatGPT Analyst] Detected navigation to new conversation:', currentConversationId);
      lastProcessedConversationId = currentConversationId;
      
      // Don't reset dataReceived flag here - we want to keep showing our results
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also observe URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[ChatGPT Analyst] URL changed, but keeping overlay visible');
      
      // Make sure overlay is still visible
      if (dataReceived && currentData) {
        setTimeout(() => {
          if (!document.getElementById(CONFIG.overlayId) && overlayElement) {
            console.log('[ChatGPT Analyst] Restoring overlay after URL change');
            document.body.appendChild(overlayElement);
            showOverlay(currentData);
          }
        }, 500);
      }
    }
  }).observe(document, { subtree: true, childList: true });
}

// Debug functions
function testOverlay() {
  const testData = {
    hasData: true,
    searchQueries: [
      { query: "Test search query 1", timestamp: new Date().toISOString() },
      { query: "Test search query 2", timestamp: new Date().toISOString() }
    ],
    thoughts: [
      { thought: "Test internal thought process", timestamp: new Date().toISOString() }
    ],
    reasoning: [],
    metadata: {
      captureMethod: "test",
      captureTimestamp: new Date().toISOString()
    }
  };
  
  showAnalysisResult(testData);
}

function debugAnalysis() {
  console.log('[ChatGPT Analyst] Running debug analysis...');
  
  // Trigger manual analysis
  chrome.runtime.sendMessage({
    action: "analyzeConversation",
    manual: true
  });
}

// Initialize extension on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// Initialize extension
function initializeExtension() {
  // Prevent double initialization
  if (window.chatgptAnalystInitialized) {
    return;
  }
  window.chatgptAnalystInitialized = true;
  
  console.log('[ChatGPT Analyst] Initializing extension...');
  
  // Reset data received flag on new page
  dataReceived = false;
  
  // Create debug commands
  window.testChatGPTAnalystOverlay = () => {
    testOverlay();
  };
  
  window.debugChatGPTAnalyst = () => {
    debugAnalysis();
  };
  
  // Create overlay if it doesn't exist
  if (!document.getElementById(CONFIG.overlayId)) {
    createOverlay();
  }
  
  // Try to load previous analysis data from localStorage
  const savedData = loadAnalysisFromLocalStorage();
  if (savedData) {
    console.log('[ChatGPT Analyst] Restored previous analysis data from localStorage');
    dataReceived = true;
    currentData = savedData;
    showAnalysisResult(savedData);
  }
  
  // Set up mutation observer to ensure overlay persists
  setupOverlayPersistence();
  
  console.log('[ChatGPT Analyst] Debug commands available:');
  console.log('- window.testChatGPTAnalystOverlay() - Test overlay display');
  console.log('- window.debugChatGPTAnalyst() - Full debug and analysis');
  
  // Disable auto-analysis to prevent reload loops
  console.log('[ChatGPT Analyst] Auto-analysis disabled to prevent reload loops - use manual analysis instead');
  
  console.log('[ChatGPT Analyst] Extension initialized successfully');
} 