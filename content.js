// ChatGPT Analyst - Enhanced Content Script
console.log('🔍 ChatGPT Analyst content script loaded');

// Overlay state
let overlay = null;
let overlayVisible = false;

// Initialize the overlay when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOverlay);
} else {
  initializeOverlay();
}

function initializeOverlay() {
  createOverlay();
  displayAnalysisData();
  
  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.conversationData) {
      console.log('📊 Conversation data updated, refreshing display');
      displayAnalysisData();
    }
  });
}

function createOverlay() {
  // Remove existing overlay if present
  if (overlay) {
    overlay.remove();
  }

  // Create main overlay container
  overlay = document.createElement('div');
  overlay.className = 'chatgpt-analyst-overlay';
  
  // Header
  const header = document.createElement('div');
  header.className = 'overlay-header';
  
  const title = document.createElement('h3');
  title.textContent = 'ChatGPT Analyst';
  
  const controls = document.createElement('div');
  controls.className = 'overlay-controls';
  
  // Minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'control-btn minimize-btn';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.addEventListener('click', toggleOverlay);
  
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'control-btn close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', hideOverlay);
  
  controls.appendChild(minimizeBtn);
  controls.appendChild(closeBtn);
  
  header.appendChild(title);
  header.appendChild(controls);
  
  // Content area
  const content = document.createElement('div');
  content.className = 'overlay-content';
  content.id = 'overlay-content';
  
  // Status bar
  const status = document.createElement('div');
  status.className = 'overlay-status';
  status.textContent = 'Ready to analyze conversations';
  
  overlay.appendChild(header);
  overlay.appendChild(content);
  overlay.appendChild(status);
  
  document.body.appendChild(overlay);
  overlayVisible = true;
  
  console.log('✅ Enhanced overlay created successfully');
}

function extractSearchAndReasoning(conversationData) {
  console.log('🔍 Extracting comprehensive data from conversation...');
  
  const result = {
    searchQueries: new Set(),
    thoughts: [],
    sources: [],
    reasoning: [],
    userContext: {},
    metadata: {
      conversationId: null,
      totalMessages: 0,
      analysisTime: new Date().toISOString()
    }
  };

  if (!conversationData || !conversationData.mapping) {
    console.warn('⚠️ No valid conversation data found');
    return result;
  }

  const mapping = conversationData.mapping;
  result.metadata.conversationId = conversationData.conversation_id;
  result.metadata.totalMessages = Object.keys(mapping).length;

  // Process each message in the conversation
  Object.values(mapping).forEach((node, index) => {
    if (!node.message) return;

    const message = node.message;
    const content = message.content;
    const metadata = message.metadata || {};

    // Extract search queries from various sources
    extractSearchQueries(content, metadata, result.searchQueries);
    
    // Extract thoughts
    extractThoughts(content, result.thoughts);
    
    // Extract search results/sources
    extractSources(metadata, result.sources);
    
    // Extract reasoning
    extractReasoning(content, result.reasoning);
    
    // Extract user context
    extractUserContext(content, result.userContext);
  });

  // Convert Set to Array for searchQueries
  result.searchQueries = Array.from(result.searchQueries);

  console.log('📊 Extraction complete:', {
    searchQueries: result.searchQueries.length,
    thoughts: result.thoughts.length,
    sources: result.sources.length,
    reasoning: result.reasoning.length,
    userContext: Object.keys(result.userContext).length
  });

  return result;
}

function extractSearchQueries(content, metadata, queriesSet) {
  // Method 1: Extract from search() function calls in code blocks
  if (content.content_type === 'code' && content.text) {
    const searchMatches = content.text.match(/search\(['"](.*?)['"]\)/g);
    if (searchMatches) {
      searchMatches.forEach(match => {
        const query = match.match(/search\(['"](.*?)['"]\)/)[1];
        if (query.trim()) {
          queriesSet.add(query.trim());
        }
      });
    }
  }

  // Method 2: Extract from metadata search_queries
  if (metadata.search_queries && Array.isArray(metadata.search_queries)) {
    metadata.search_queries.forEach(searchQuery => {
      if (searchQuery.q && searchQuery.q.trim()) {
        queriesSet.add(searchQuery.q.trim());
      }
    });
  }

  // Method 3: Extract from JSON content in code blocks
  if (content.content_type === 'code' && content.text) {
    try {
      const jsonMatch = content.text.match(/\{.*"search_query".*\}/s);
      if (jsonMatch) {
        const jsonData = JSON.parse(jsonMatch[0]);
        if (jsonData.search_query && Array.isArray(jsonData.search_query)) {
          jsonData.search_query.forEach(item => {
            if (item.q && item.q.trim()) {
              queriesSet.add(item.q.trim());
            }
          });
        }
      }
    } catch (e) {
      // JSON parsing failed, ignore
    }
  }
}

function extractThoughts(content, thoughtsArray) {
  if (content.content_type === 'thoughts' && content.thoughts) {
    content.thoughts.forEach(thought => {
      thoughtsArray.push({
        summary: thought.summary || 'Thought',
        content: thought.content || '',
        timestamp: new Date().toISOString()
      });
    });
  }
}

function extractSources(metadata, sourcesArray) {
  if (metadata.search_result_groups && Array.isArray(metadata.search_result_groups)) {
    metadata.search_result_groups.forEach(group => {
      if (group.entries && Array.isArray(group.entries)) {
        group.entries.forEach(entry => {
          sourcesArray.push({
            title: entry.title || 'Untitled',
            url: entry.url || '#',
            snippet: entry.snippet || '',
            domain: group.domain || 'Unknown',
            attribution: entry.attribution || group.domain || 'Unknown'
          });
        });
      }
    });
  }
}

function extractReasoning(content, reasoningArray) {
  if (content.content_type === 'reasoning_recap') {
    reasoningArray.push({
      type: 'recap',
      content: content.content || '',
      timestamp: new Date().toISOString()
    });
  }
}

function extractUserContext(content, userContextObj) {
  if (content.content_type === 'user_editable_context') {
    if (content.user_profile) {
      userContextObj.profile = content.user_profile;
    }
    if (content.user_instructions) {
      userContextObj.instructions = content.user_instructions;
    }
  }
}

async function displayAnalysisData() {
  try {
    const result = await chrome.storage.local.get(['conversationData']);
    const conversationData = result.conversationData;

    const contentDiv = document.getElementById('overlay-content');
    if (!contentDiv) return;

    if (!conversationData) {
      contentDiv.innerHTML = createWelcomeMessage();
      return;
    }

    const analysis = extractSearchAndReasoning(conversationData);
    
    // Save analysis to storage for export
    await chrome.storage.local.set({ analysisData: analysis });

    let html = '';

    // Search Queries Section
    if (analysis.searchQueries.length > 0) {
      html += createSearchQueriesSection(analysis.searchQueries);
    }

    // Thoughts Section
    if (analysis.thoughts.length > 0) {
      html += createThoughtsSection(analysis.thoughts);
    }

    // Sources Section
    if (analysis.sources.length > 0) {
      html += createSourcesSection(analysis.sources);
    }

    // Reasoning Section
    if (analysis.reasoning.length > 0) {
      html += createReasoningSection(analysis.reasoning);
    }

    // User Context Section
    if (Object.keys(analysis.userContext).length > 0) {
      html += createUserContextSection(analysis.userContext);
    }

    // Export Section
    html += createExportSection();

    // Promotional Section
    html += createPromoSection();

    if (html) {
      contentDiv.innerHTML = html;
      setupEventListeners();
    } else {
      contentDiv.innerHTML = createNoDataMessage();
    }

  } catch (error) {
    console.error('❌ Error displaying analysis data:', error);
    const contentDiv = document.getElementById('overlay-content');
    if (contentDiv) {
      contentDiv.innerHTML = createErrorMessage(error.message);
    }
  }
}

function createWelcomeMessage() {
  return `
    <div class="welcome-message">
      <h4>🔍 ChatGPT Analyst Ready</h4>
      <div class="user-guidance">
        <h6>📋 How to Use:</h6>
        <ol>
          <li>Start or continue a ChatGPT conversation</li>
          <li>The plugin automatically captures search queries and reasoning</li>
          <li>Analysis appears here in real-time</li>
          <li>Export data when ready</li>
        </ol>
      </div>
      <div class="action-buttons">
        <button class="primary-btn" onclick="window.location.reload()">
          🔄 Refresh Page
        </button>
      </div>
    </div>
  `;
}

function createSearchQueriesSection(queries) {
  let html = `
    <div class="section search-queries-section">
      <h4 class="section-title">Search Queries Found</h4>
      <ul class="queries-list">
  `;
  
  queries.forEach((query, index) => {
    html += `
      <li class="query-item">
        <span class="query-number">${index + 1}</span>
        <span class="query-text">${escapeHtml(query)}</span>
        <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(query)}')">📋</button>
      </li>
    `;
  });
  
  html += `
      </ul>
    </div>
  `;
  
  return html;
}

function createThoughtsSection(thoughts) {
  let html = `
    <div class="section thoughts-section">
      <h4 class="section-title">ChatGPT Thoughts</h4>
  `;
  
  thoughts.forEach((thought, index) => {
    html += `
      <div class="thought-item">
        <div class="thought-summary">${escapeHtml(thought.summary)}</div>
        <div class="thought-content">${escapeHtml(thought.content)}</div>
      </div>
    `;
  });
  
  html += `</div>`;
  return html;
}

function createSourcesSection(sources) {
  let html = `
    <div class="section sources-section">
      <h4 class="section-title">Sources & Research</h4>
  `;
  
  sources.slice(0, 10).forEach((source, index) => { // Limit to first 10 sources
    html += `
      <div class="source-item">
        <div class="source-title">${escapeHtml(source.title)}</div>
        <a href="${escapeHtml(source.url)}" target="_blank" class="source-url" rel="noopener">
          ${escapeHtml(source.domain)}
        </a>
        ${source.snippet ? `<div class="source-snippet">${escapeHtml(source.snippet.substring(0, 150))}...</div>` : ''}
      </div>
    `;
  });
  
  if (sources.length > 10) {
    html += `<div class="source-item">
      <div class="source-title">... and ${sources.length - 10} more sources</div>
    </div>`;
  }
  
  html += `</div>`;
  return html;
}

function createReasoningSection(reasoning) {
  let html = `
    <div class="section reasoning-section">
      <h4 class="section-title">Reasoning Process</h4>
  `;
  
  reasoning.forEach((item, index) => {
    html += `
      <div class="reasoning-item">
        <div class="reasoning-content">${escapeHtml(item.content)}</div>
      </div>
    `;
  });
  
  html += `</div>`;
  return html;
}

function createUserContextSection(userContext) {
  let html = `
    <div class="section user-context-section">
      <h4 class="section-title">User Context</h4>
  `;
  
  if (userContext.profile) {
    html += `
      <div class="user-profile">
        <h6>👤 User Profile</h6>
        <p>${escapeHtml(userContext.profile.substring(0, 200))}${userContext.profile.length > 200 ? '...' : ''}</p>
      </div>
    `;
  }
  
  if (userContext.instructions) {
    html += `
      <div class="user-instructions">
        <h6>⚙️ User Instructions</h6>
        <p>${escapeHtml(userContext.instructions.substring(0, 200))}${userContext.instructions.length > 200 ? '...' : ''}</p>
      </div>
    `;
  }
  
  html += `</div>`;
  return html;
}

function createExportSection() {
  return `
    <div class="export-section">
      <button class="export-btn" onclick="exportAnalysisData()">
        📥 Export Analysis Data
      </button>
    </div>
  `;
}

function createPromoSection() {
  return `
    <div class="promo-section">
      <div class="promo-content">
        <div class="promo-header">
          <span class="promo-title">ChatGPT Analyst</span>
        </div>
        <p>Developed for analyzing ChatGPT conversations</p>
        <a href="https://github.com" class="promo-link" target="_blank" rel="noopener">
          Learn More
        </a>
      </div>
    </div>
  `;
}

function createNoDataMessage() {
  return `
    <div class="no-data">
      <h4>📊 No Analysis Data</h4>
      <div class="user-guidance">
        <h6>💡 To see analysis data:</h6>
        <ul>
          <li>Start a new ChatGPT conversation</li>
          <li>Ask questions that trigger web search</li>
          <li>The plugin will automatically capture data</li>
        </ul>
      </div>
    </div>
  `;
}

function createErrorMessage(error) {
  return `
    <div class="error-message">
      <h4>⚠️ Analysis Error</h4>
      <p>Error: ${escapeHtml(error)}</p>
      <div class="error-actions">
        <button class="retry-btn" onclick="displayAnalysisData()">🔄 Retry</button>
        <button class="new-conversation-btn" onclick="window.location.reload()">🆕 Refresh</button>
      </div>
    </div>
  `;
}

function setupEventListeners() {
  // Copy button listeners are handled inline with onclick
  console.log('✅ Event listeners setup complete');
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('📋 Copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
    showNotification('❌ Copy failed');
  }
}

async function exportAnalysisData() {
  try {
    const result = await chrome.storage.local.get(['analysisData']);
    const data = result.analysisData;
    
    if (!data) {
      showNotification('❌ No data to export');
      return;
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      analysis: data
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatgpt-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('📥 Analysis data exported!');
  } catch (error) {
    console.error('❌ Export failed:', error);
    showNotification('❌ Export failed');
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification show';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 400px;
    background: linear-gradient(135deg, #4fc3f7, #29b6f6);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(79, 195, 247, 0.4);
    z-index: 10001;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideInNotification 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

function toggleOverlay() {
  if (!overlay) return;
  
  if (overlayVisible) {
    overlay.style.transform = 'translateX(100%)';
    overlayVisible = false;
  } else {
    overlay.style.transform = 'translateX(0)';
    overlayVisible = true;
  }
}

function hideOverlay() {
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      overlay = null;
      overlayVisible = false;
    }, 300);
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Shift + A to toggle overlay
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    if (overlay) {
      toggleOverlay();
    } else {
      initializeOverlay();
    }
  }
});

console.log('✅ ChatGPT Analyst enhanced content script initialized'); 