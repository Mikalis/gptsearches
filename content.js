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

// Add message handler for background script communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ChatGPT Analyst] Received message:', message.action);
  
  if (message.action === 'networkData') {
    // Process network data captured by debugger
    console.log('[ChatGPT Analyst] 📊 Received network data from debugger');
    processNetworkData(message);
    sendResponse({ success: true });
  } else if (message.action === 'debuggerError') {
    console.log('[ChatGPT Analyst] ❌ Debugger error:', message.error);
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      error: message.error,
      isConversationNotFound: message.error.includes('not found') || message.error.includes('404')
    });
    sendResponse({ success: true });
  } else if (message.action === 'checkDataReceived') {
    sendResponse({ dataReceived: dataReceived });
  } else if (message.action === 'analyzeConversation') {
    // Handle manual analysis request from popup
    console.log('[ChatGPT Analyst] Manual analysis requested from popup');
    analyzeConversationWithDebugger(true);
    sendResponse({ success: true });
  }
  
  return false; // Don't keep the response channel open
});

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
  
  // Header with title and controls
  const header = document.createElement('div');
  header.className = 'overlay-header';
  
  const title = document.createElement('h3');
  title.textContent = 'ChatGPT Analysis Results';
  
  const controls = document.createElement('div');
  controls.className = 'overlay-controls';
  
  // Analyze button
  const analyzeBtn = document.createElement('button');
  analyzeBtn.className = 'control-btn analyze-btn';
  analyzeBtn.innerHTML = '🔍 Analyze';
  analyzeBtn.title = 'Analyze current conversation';
  analyzeBtn.onclick = () => analyzeConversationWithDebugger(true);
  
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
  
  controls.appendChild(analyzeBtn);
  controls.appendChild(toggleBtn);
  controls.appendChild(closeBtn);
  
  header.appendChild(title);
  header.appendChild(controls);
  
  // Content area
  const contentDiv = document.createElement('div');
  contentDiv.id = CONFIG.contentId;
  contentDiv.className = 'overlay-content';
  contentDiv.innerHTML = `
    <div class="welcome-message">
      <h4>🔍 ChatGPT Search Query Analyzer</h4>
      <p>Click "Analyze" to extract search queries and internal reasoning from this conversation.</p>
      <p><strong>How it works:</strong></p>
      <ul>
        <li>Uses Chrome Debugger API to capture network responses</li>
        <li>Extracts search queries used by ChatGPT</li>
        <li>Shows internal reasoning and thoughts</li>
        <li>Works with any ChatGPT conversation</li>
      </ul>
    </div>
  `;
  
  // Status indicator
  const statusDiv = document.createElement('div');
  statusDiv.className = 'overlay-status';
  statusDiv.textContent = 'Ready to analyze conversation';
  
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
      analyzeConversationWithDebugger(true);
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
  
  if (data.error) {
    contentDiv.innerHTML = `
      <div class="error-message">
        <h4>❌ Analysis Error</h4>
        <p>${data.error}</p>
        ${data.isConversationNotFound ? `
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
                <li><strong>Click "Analyze" button</strong> to extract search data</li>
              </ol>
            </div>
            <div class="action-buttons">
              <button data-action="new-conversation" class="primary-btn">🚀 Start New Conversation</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    return;
  }
  
  if (data.isLoading) {
    contentDiv.innerHTML = `
      <div class="loading-message">
        <h4>🔄 Analyzing Conversation...</h4>
        <p>Setting up Chrome Debugger to capture network responses...</p>
      </div>
    `;
    return;
  }
  
  if (data.isReloading) {
    contentDiv.innerHTML = `
      <div class="loading-message">
        <h4>🔄 Page Reload in Progress...</h4>
        <p>The page will reload automatically to capture fresh network traffic from ChatGPT.</p>
      </div>
    `;
    return;
  }
  
  if (!data.hasData) {
    contentDiv.innerHTML = `
      <div class="no-data">
        <h4>🔍 No Search Data Found</h4>
        <p>No search queries or internal reasoning detected in this conversation.</p>
        <p><strong>Tips to get search data:</strong></p>
        <ul>
          <li>Ask questions that require web research</li>
          <li>Request current information about recent events</li>
          <li>Ask for comparisons or analysis of current topics</li>
        </ul>
      </div>
    `;
    return;
  }
  
  // Show search queries
  if (data.searchQueries && data.searchQueries.length > 0) {
    const searchSection = createSearchQueriesDisplaySection(data.searchQueries);
    contentDiv.appendChild(searchSection);
  }
  
  // Show thoughts
  if (data.thoughts && data.thoughts.length > 0) {
    const thoughtsSection = createThoughtsDisplaySection(data.thoughts);
    contentDiv.appendChild(thoughtsSection);
  }
  
  // Show reasoning
  if (data.reasoning && data.reasoning.length > 0) {
    const reasoningSection = createReasoningDisplaySection(data.reasoning);
    contentDiv.appendChild(reasoningSection);
  }
  
  // Add export functionality
  addExportButton(contentDiv, data);
  
  // Add promotional content
  addPromotionalContent(contentDiv);
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
    
    const content = document.createElement('div');
    content.className = 'thought-content';
    content.innerHTML = `<strong>Thought ${index + 1}:</strong> ${escapeHtml(thought.thought || thought.summary || thought.content)}`;
    thoughtDiv.appendChild(content);
    
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
    content.innerHTML = `<strong>Reasoning ${index + 1}:</strong> ${escapeHtml(reasoningData.reasoning || reasoningData.text)}`;
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
  
  // Update content
  updateOverlayContent(analysisData);
  
  // Make sure overlay is visible
  showOverlayElement();
  
  console.log('[ChatGPT Analyst] Overlay displayed successfully');
}

// Show overlay element
function showOverlayElement() {
  const overlay = document.getElementById(CONFIG.overlayId);
  if (overlay) {
    overlay.style.display = 'block';
    overlayVisible = true;
  }
}

// Hide overlay
function hideOverlay() {
  const overlay = document.getElementById(CONFIG.overlayId);
  if (overlay) {
    overlay.style.display = 'none';
    overlayVisible = false;
  }
}

// Toggle overlay visibility
function toggleOverlay() {
  if (overlayVisible) {
    hideOverlay();
  } else {
    showOverlayElement();
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Copy to clipboard functionality
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

// Show notification
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#f56565' : '#48bb78'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10001;
    font-size: 14px;
    max-width: 300px;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 3000);
}

// Get current conversation ID from URL
function getCurrentConversationId() {
  const url = window.location.href;
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
  
  // Show reloading state
  showAnalysisResult({
    isReloading: true,
    hasData: false,
    searchQueries: [],
    thoughts: [],
    reasoning: []
  });
  
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
  analyzeConversationWithDebugger(true);
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
    console.log('[ChatGPT Analyst] Extension already initialized, skipping...');
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
  
  console.log('[ChatGPT Analyst] Extension initialized successfully');
} 