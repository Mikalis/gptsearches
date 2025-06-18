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
    console.log('[ChatGPT Analyst] 📊 Received intercepted network data');
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
    } else if (action === 'refresh-page') {
      event.preventDefault();
      window.location.reload();
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
  
  if (data.showWelcome) {
    contentDiv.innerHTML = `
      <div class="welcome-message">
        <h4>🔍 ChatGPT Search Query Analyzer</h4>
        <p>✅ <strong>Plugin is working!</strong> Ready to analyze ChatGPT conversations.</p>
        <div class="user-guidance">
          <p><strong>How to use:</strong></p>
          <ol>
            <li>Click <strong>"Analyze Conversation"</strong> button above or in the popup</li>
            <li>The plugin will extract search queries and internal reasoning</li>
            <li>Results will appear here in this overlay</li>
          </ol>
        </div>
        <div class="solution-steps">
          <h6>💡 For best results:</h6>
          <ul>
            <li>Ask ChatGPT questions that require web research</li>
            <li>Wait for ChatGPT to finish its complete response</li>
            <li>Then click "Analyze" to see what searches were made</li>
          </ul>
        </div>
        <div class="action-buttons">
          <button data-action="analyze" class="primary-btn">🔍 Analyze This Conversation</button>
        </div>
      </div>
    `;
    return;
  }
  
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
  
  if (data.awaitingRefresh) {
    contentDiv.innerHTML = `
      <div class="loading-message">
        <h4>🔍 Network Interception Active</h4>
        <p>✅ The plugin is now intercepting network requests.</p>
        <div class="user-guidance">
          <p><strong>To capture conversation data:</strong></p>
          <ol>
            <li><strong>Refresh this page</strong> (F5 or Ctrl+R)</li>
            <li>The plugin will automatically intercept the conversation request</li>
            <li>Results will appear here instantly</li>
          </ol>
        </div>
        <div class="solution-steps">
          <h6>🎯 How it works:</h6>
          <ul>
            <li>When you refresh, ChatGPT loads the conversation data</li>
            <li>The plugin intercepts the JSON response</li>
            <li>It extracts search queries and internal reasoning</li>
          </ul>
        </div>
        <div class="action-buttons">
          <button data-action="refresh-page" class="primary-btn">🔄 Refresh Page Now</button>
        </div>
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
    overlay.classList.add('visible');
    overlayVisible = true;
    console.log('[ChatGPT Analyst] Overlay made visible');
  } else {
    console.log('[ChatGPT Analyst] Could not find overlay element to show');
  }
}

// Hide overlay
function hideOverlay() {
  const overlay = document.getElementById(CONFIG.overlayId);
  if (overlay) {
    overlay.classList.remove('visible'); // Remove the visible class
    overlayVisible = false;
    // Use setTimeout to allow the CSS transition to complete before hiding
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300); // Match the CSS transition duration
    console.log('[ChatGPT Analyst] Overlay hidden');
  }
}

// Toggle overlay visibility
function toggleOverlay() {
  const overlay = document.getElementById(CONFIG.overlayId);
  if (!overlay) return;
  
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
  console.log('[ChatGPT Analyst] 🔄 Starting network interception analysis...');
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
  
  // Try to load existing data from localStorage first
  const existingData = loadAnalysisFromLocalStorage();
  if (existingData && existingData.hasData && !manual) {
    console.log('[ChatGPT Analyst] Using cached analysis data');
    showAnalysisResult(existingData);
    return;
  }
  
  // Send message to background script to start network interception
  console.log('[ChatGPT Analyst] Requesting network interception from background script...');
  chrome.runtime.sendMessage({
    action: 'analyzeConversation',
    conversationId: conversationId,
    manual: manual
  }).then(response => {
    console.log('[ChatGPT Analyst] Background script response:', response);
    
    // Show instructions to user
    showAnalysisResult({
      isLoading: false,
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      awaitingRefresh: true
    });
    
  }).catch(error => {
    console.log('[ChatGPT Analyst] Background script communication error:', error);
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      error: `Communication error with background script: ${error.message}`
    });
  });
}

// Process captured network data from background script
function processNetworkData(networkData) {
  console.log('[ChatGPT Analyst] 🔍 Processing captured network data...', {
    source: networkData.source,
    url: networkData.url,
    timestamp: networkData.timestamp,
    dataKeys: networkData.data ? Object.keys(networkData.data) : []
  });
  
  try {
    const data = networkData.data;
    
    // Log the structure of the received data
    console.log('[ChatGPT Analyst] 📊 Data structure analysis:', {
      hasMapping: !!data.mapping,
      mappingKeys: data.mapping ? Object.keys(data.mapping).length : 0,
      hasSafe: !!data.safe,
      hasBlocked: !!data.blocked,
      mainKeys: Object.keys(data),
      dataType: typeof data
    });
    
    // Use existing analysis function to process the conversation data
    const analysisData = extractSearchAndReasoning(data);
    
    console.log('[ChatGPT Analyst] 📊 Final extraction results:', {
      hasData: analysisData.hasData,
      searchQueries: analysisData.searchQueries.length,
      thoughts: analysisData.thoughts.length,
      reasoning: analysisData.reasoning.length,
      queries: analysisData.searchQueries.map(q => q.query),
      thoughtSummaries: analysisData.thoughts.map(t => t.thought)
    });
    
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
      analysisData.metadata.conversationId = networkData.conversationId;
      
      // Mark that we've received data
      dataReceived = true;
      
      // Store current data
      currentData = analysisData;
      
      // FIRST: Save to localStorage for persistence
      console.log('[ChatGPT Analyst] 💾 Saving analysis data to localStorage...');
      saveAnalysisToLocalStorage(analysisData);
      
      // THEN: Display the results
      console.log('[ChatGPT Analyst] 🖥️ Displaying analysis results in overlay...');
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
          dataSize: JSON.stringify(data).length,
          dataStructure: Object.keys(data),
          conversationId: networkData.conversationId
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
    
    // Log first few mapping entries for debugging
    console.log('[ChatGPT Analyst] 🔍 Mapping structure debug:', {
      mappingKeys: mappingKeys.slice(0, 5),
      firstEntry: mapping[mappingKeys[0]],
      hasMessages: mappingKeys.filter(key => mapping[key]?.message).length
    });
    
    // Process each message in the mapping
    for (const key of mappingKeys) {
      const node = mapping[key];
      
      // Skip non-message nodes
      if (!node || !node.message) {
        continue;
      }
      
      const message = node.message;
      const timestamp = new Date(message.create_time * 1000).toISOString();
      const authorRole = message.author?.role;
      
      console.log('[ChatGPT Analyst] 🔍 Processing message:', {
        key: key,
        authorRole: authorRole,
        hasContent: !!message.content,
        contentLength: Array.isArray(message.content) ? message.content.length : 0,
        hasMetadata: !!message.metadata,
        hasToolCalls: !!message.tool_calls
      });
      
      // Look for search queries in different places
      
      // 1. Check tool_calls for browser/search tools
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall, index) => {
          console.log('[ChatGPT Analyst] 🛠️ Tool call:', {
            index: index,
            type: toolCall.type,
            function: toolCall.function?.name,
            browser: toolCall.browser,
            allKeys: Object.keys(toolCall)
          });
          
          if (toolCall.type === 'browser' && toolCall.browser?.type === 'search') {
            result.searchQueries.push({
              query: toolCall.browser.query || toolCall.browser.text || toolCall.browser.input || '',
              timestamp: timestamp,
              source: 'tool_calls_browser'
            });
            result.hasData = true;
          }
          
          // Check for function calls with search
          if (toolCall.function && toolCall.function.name && 
              (toolCall.function.name.includes('search') || toolCall.function.name.includes('browser'))) {
            const args = toolCall.function.arguments || {};
            if (args.query || args.search_query || args.q) {
              result.searchQueries.push({
                query: args.query || args.search_query || args.q,
                timestamp: timestamp,
                source: 'function_call_' + toolCall.function.name
              });
              result.hasData = true;
            }
          }
        });
      }
      
      // 2. Check content blocks for search-related content
      if (message.content && Array.isArray(message.content)) {
        message.content.forEach((content, index) => {
          console.log('[ChatGPT Analyst] 📄 Content block:', {
            index: index,
            type: content.type,
            contentType: content.content_type,
            hasText: !!content.text,
            text: content.text ? content.text.substring(0, 100) + '...' : null,
            hasBrowserSearch: !!content.browser_search,
            hasToolUse: !!content.tool_use,
            hasThoughts: !!content.thoughts,
            allKeys: Object.keys(content)
          });
          
          // Browser search content
          if (content.browser_search) {
            result.searchQueries.push({
              query: content.browser_search.query || content.browser_search.text || '',
              timestamp: timestamp,
              source: 'content_browser_search'
            });
            result.hasData = true;
          }
          
          // Tool use content with search
          if (content.tool_use && content.tool_use.tool_name === 'browser' && 
              content.tool_use.tool_parameters && 
              (content.tool_use.tool_parameters.query || content.tool_use.tool_parameters.text)) {
            result.searchQueries.push({
              query: content.tool_use.tool_parameters.query || content.tool_use.tool_parameters.text || '',
              timestamp: timestamp,
              source: 'content_tool_use'
            });
            result.hasData = true;
          }
          
          // Check for code content with search() function calls
          if (content.content_type === 'code' && content.text) {
            const searchMatch = content.text.match(/search\s*\(\s*["']([^"']+)["']\s*\)/);
            if (searchMatch) {
              result.searchQueries.push({
                query: searchMatch[1],
                timestamp: timestamp,
                source: 'code_search_function'
              });
              result.hasData = true;
              console.log('[ChatGPT Analyst] 🎯 Found search() function call:', searchMatch[1]);
            }
          }
          
          // Check for thoughts content
          if (content.content_type === 'thoughts' && content.thoughts && Array.isArray(content.thoughts)) {
            content.thoughts.forEach(thought => {
              if (thought.summary) {
                result.thoughts.push({
                  thought: thought.summary,
                  detail: thought.content,
                  timestamp: timestamp,
                  source: 'thoughts_summary'
                });
                result.hasData = true;
                console.log('[ChatGPT Analyst] 🧠 Found thought summary:', thought.summary);
              }
              if (thought.content) {
                result.reasoning.push({
                  reasoning: thought.content,
                  timestamp: timestamp,
                  source: 'thoughts_content'
                });
                result.hasData = true;
                console.log('[ChatGPT Analyst] 🧠 Found thought content:', thought.content.substring(0, 100) + '...');
              }
            });
          }
          
          // Check for web search results
          if (content.type === 'execution_output' && content.text && 
              (content.text.includes('search') || content.text.includes('web'))) {
            // Try to extract search query from execution output
            const queryMatch = content.text.match(/search(?:ing|ed)?\s+for:?\s*["']?([^"'\n]+)["']?/i);
            if (queryMatch) {
              result.searchQueries.push({
                query: queryMatch[1].trim(),
                timestamp: timestamp,
                source: 'execution_output'
              });
              result.hasData = true;
            }
          }
        });
      } else if (message.content && message.content.content_type === 'text' && message.content.parts && Array.isArray(message.content.parts)) {
        // Handle the parts array format
        message.content.parts.forEach(part => {
          if (typeof part === 'string' && part.includes('search')) {
            console.log('[ChatGPT Analyst] 📄 Found text part with search:', part.substring(0, 100) + '...');
          }
        });
      }
      
      // 3. Extract search queries from metadata.search_queries
      if (message.metadata && message.metadata.search_queries && Array.isArray(message.metadata.search_queries)) {
        message.metadata.search_queries.forEach(searchQuery => {
          if (searchQuery.q) {
            result.searchQueries.push({
              query: searchQuery.q,
              timestamp: timestamp,
              source: 'metadata_search_queries'
            });
            result.hasData = true;
            console.log('[ChatGPT Analyst] 🎯 Found metadata search query:', searchQuery.q);
          }
        });
      }
      
      // 4. Extract internal thoughts from metadata
      if (message.metadata && message.metadata.thinking) {
        result.thoughts.push({
          thought: message.metadata.thinking,
          timestamp: timestamp,
          source: 'metadata_thinking'
        });
        result.hasData = true;
      }
      
      // 5. Look for reasoning in various content blocks
      if (message.content && Array.isArray(message.content)) {
        message.content.forEach(content => {
          if (content.thinking_process || content.reasoning || 
              (content.text && content.text.includes('My reasoning:'))) {
            result.reasoning.push({
              reasoning: content.thinking_process || content.reasoning || content.text,
              timestamp: timestamp,
              source: 'content_reasoning'
            });
            result.hasData = true;
          }
        });
      }
    }
    
    // Enhanced fallback: Search for patterns in the raw JSON string
    const jsonString = JSON.stringify(data);
    console.log('[ChatGPT Analyst] 🔍 Running enhanced pattern search on JSON...');
    
    // More comprehensive search patterns
    const searchPatterns = [
      /"browser_search":\s*{\s*"query":\s*"([^"]+)"/g,
      /"browser":\s*{\s*"query":\s*"([^"]+)"/g,
      /"tool_use":\s*{\s*"tool_name":\s*"browser"[^}]*"query":\s*"([^"]+)"/g,
      /"search_query":\s*"([^"]+)"/g,
      /"search":\s*{\s*"query":\s*"([^"]+)"/g,
      /"function":\s*{\s*"name":\s*"[^"]*search[^"]*"[^}]*"arguments":\s*"[^"]*query[^"]*:\s*[^"]*"([^"]+)"/g,
      /"query":\s*"([^"]+)"[^}]*"type":\s*"search"/g,
      /searching\s+for:?\s*["']?([^"'\n\r]+)["']?/gi,
      /web\s+search:?\s*["']?([^"'\n\r]+)["']?/gi
    ];
    
    let patternMatches = 0;
    for (const pattern of searchPatterns) {
      let match;
      while ((match = pattern.exec(jsonString)) !== null) {
        const query = match[1];
        if (query && query.trim() && !result.searchQueries.some(q => q.query === query.trim())) {
          result.searchQueries.push({
            query: query.trim(),
            timestamp: new Date().toISOString(),
            source: 'pattern_match_' + patternMatches
          });
          result.hasData = true;
          patternMatches++;
        }
      }
    }
    
    console.log('[ChatGPT Analyst] Pattern search results:', {
      patternsMatched: patternMatches,
      totalQueries: result.searchQueries.length
    });
    
    console.log('[ChatGPT Analyst] Extraction complete:', {
      searchQueries: result.searchQueries.length,
      thoughts: result.thoughts.length,
      reasoning: result.reasoning.length,
      hasData: result.hasData
    });
    
    // If we found queries, log them for debugging
    if (result.searchQueries.length > 0) {
      console.log('[ChatGPT Analyst] 🎉 Found search queries:', result.searchQueries);
    }
    
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
  
  window.showChatGPTAnalystOverlay = () => {
    console.log('[ChatGPT Analyst] Forcing overlay to show...');
    createOverlay();
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      showWelcome: true
    });
  };
  
  // Create overlay immediately
  createOverlay();
  
  // Check for intercepted data from background script
  checkForInterceptedData();
  
  // Set up overlay persistence
  setupOverlayPersistence();
  
  console.log('[ChatGPT Analyst] Extension initialized successfully');
}

// Check for intercepted data from background script
function checkForInterceptedData() {
  const conversationId = getCurrentConversationId();
  if (!conversationId) {
    // Show welcome message if no conversation ID
    setTimeout(() => {
      showAnalysisResult({
        hasData: false,
        searchQueries: [],
        thoughts: [],
        reasoning: [],
        isLoading: false,
        showWelcome: true
      });
    }, 1000);
    return;
  }
  
  console.log('[ChatGPT Analyst] Checking for intercepted data for conversation:', conversationId);
  
  // Check chrome.storage.local for intercepted data
  const storageKey = `chatgpt_analyst_data_${conversationId}`;
  chrome.storage.local.get([storageKey], (result) => {
    if (chrome.runtime.lastError) {
      console.error('[ChatGPT Analyst] Error accessing storage:', chrome.runtime.lastError);
      showWelcomeMessage();
      return;
    }
    
    const storageData = result[storageKey];
    if (storageData && storageData.data) {
      console.log('[ChatGPT Analyst] 🎉 Found intercepted data in storage!');
      
      // Process the intercepted data
      processNetworkData({
        action: 'networkData',
        source: storageData.source || 'storage_retrieval',
        url: storageData.url,
        conversationId: storageData.conversationId,
        timestamp: Date.now(),
        data: storageData.data
      });
      
      // Clear the storage data after processing
      chrome.storage.local.remove([storageKey], () => {
        console.log('[ChatGPT Analyst] Cleared processed data from storage');
      });
      
    } else {
      // Try localStorage as fallback
      const existingData = loadAnalysisFromLocalStorage();
      if (existingData && existingData.hasData) {
        console.log('[ChatGPT Analyst] Found existing analysis data in localStorage');
        showAnalysisResult(existingData);
      } else {
        showWelcomeMessage();
      }
    }
  });
}

// Show welcome message
function showWelcomeMessage() {
  setTimeout(() => {
    showAnalysisResult({
      hasData: false,
      searchQueries: [],
      thoughts: [],
      reasoning: [],
      isLoading: false,
      showWelcome: true
    });
  }, 1000);
} 