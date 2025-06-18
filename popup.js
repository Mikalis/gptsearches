// ChatGPT Analyst - Popup with Manual Analysis
console.log('🎉 ChatGPT Analyst popup loading...');

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const analyzeBtn = document.getElementById('analyze-btn');
  const extractBtn = document.getElementById('extract-btn');
  const clearDataBtn = document.getElementById('clear-data-btn');
  const newConversationBtn = document.getElementById('new-conversation-btn');
  const tipsHeader = document.getElementById('tips-header');
  const tipsContent = document.getElementById('tips-content');
  const settingsHeader = document.getElementById('settings-header');
  const settingsContent = document.getElementById('settings-content');
  const resultsSection = document.getElementById('results-section');
  const resultsHeader = document.getElementById('results-header');
  const resultsContent = document.getElementById('results-content');
  const resultsInner = document.getElementById('results-inner');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const statusDot = statusIndicator.querySelector('.status-dot');
  
  // Settings elements
  const showDebugToggle = document.getElementById('show-debug');
  const clearOnNewToggle = document.getElementById('clear-on-new');
  
  // State
  let currentTab = null;
  let currentAnalysis = null;
  
  // Initialize
  init();
  
  async function init() {
    try {
      await loadSettings();
      await checkTabStatus();
      setupEventListeners();
      updateUI();
      
      console.log('✅ Popup initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing popup:', error);
      updateStatus('error', 'Initialization failed');
    }
  }
  
  async function loadSettings() {
    try {
      const settings = await chrome.storage.sync.get({
        showDebug: false,
        clearOnNew: true
      });
      
      showDebugToggle.checked = settings.showDebug;
      clearOnNewToggle.checked = settings.clearOnNew;
      
      console.log('📋 Settings loaded:', settings);
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  }
  
  async function checkTabStatus() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tabs[0];
      
      if (!currentTab) {
        updateStatus('error', 'No active tab found');
        return;
      }
      
      const isChatGPTTab = currentTab.url.includes('chatgpt.com') || currentTab.url.includes('chat.openai.com');
      
      if (!isChatGPTTab) {
        updateStatus('inactive', 'Navigate to ChatGPT to use this extension');
        analyzeBtn.disabled = true;
        return;
      }
      
      analyzeBtn.disabled = false;
      updateStatus('ready', 'Ready to analyze conversation');
      
    } catch (error) {
      console.error('❌ Error checking tab status:', error);
      updateStatus('error', 'Unable to check tab status');
    }
  }
  
  function setupEventListeners() {
    // Expandable sections
    tipsHeader.addEventListener('click', () => toggleSection(tipsContent, tipsHeader));
    settingsHeader.addEventListener('click', () => toggleSection(settingsContent, settingsHeader));
    resultsHeader.addEventListener('click', () => toggleSection(resultsContent, resultsHeader));
    
    // Settings toggles
    showDebugToggle.addEventListener('change', () => updateSetting('showDebug', showDebugToggle.checked));
    clearOnNewToggle.addEventListener('change', () => updateSetting('clearOnNew', clearOnNewToggle.checked));
    
    // Action buttons
    analyzeBtn.addEventListener('click', handleAnalyzeClick);
    extractBtn.addEventListener('click', handleExtractClick);
    clearDataBtn.addEventListener('click', handleClearDataClick);
    newConversationBtn.addEventListener('click', handleNewConversationClick);
  }
  
  function toggleSection(contentElement, headerElement) {
    const isExpanded = contentElement.classList.contains('expanded');
    const expandIcon = headerElement.querySelector('.expand-icon');
    
    if (isExpanded) {
      contentElement.classList.remove('expanded');
      expandIcon.textContent = '▼';
      expandIcon.style.transform = 'rotate(0deg)';
    } else {
      contentElement.classList.add('expanded');
      expandIcon.textContent = '▲';
      expandIcon.style.transform = 'rotate(180deg)';
    }
  }
  
  async function updateSetting(key, value) {
    try {
      await chrome.storage.sync.set({ [key]: value });
      showNotification(`Setting updated: ${key}`);
      console.log(`⚙️ Setting updated: ${key} = ${value}`);
    } catch (error) {
      console.error('❌ Error updating setting:', error);
      showNotification('Error updating setting', 'error');
    }
  }
  
  async function handleAnalyzeClick() {
    if (!currentTab || analyzeBtn.disabled) return;
    
    try {
      updateStatus('analyzing', 'Refreshing page to capture fresh data...');
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = '<span class="section-icon">⏳</span>Refreshing & Analyzing...';
      
      // Always refresh to get the latest conversation data
      console.log('🔄 Starting refresh + analyze (always refresh mode)...');
      await refreshAndAnalyze();
      
    } catch (error) {
      console.error('❌ Error during refresh + analysis:', error);
      updateStatus('error', 'Analysis failed - try again');
      showNotification('Analysis failed: ' + error.message, 'error');
      resetAnalyzeButton();
    }
  }
  
  function resetAnalyzeButton() {
    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = '<span class="section-icon">🔍</span>Analyze Conversation';
  }
  
  async function refreshAndAnalyze() {
    return new Promise((resolve, reject) => {
      console.log('🔄 Starting automatic refresh and analyze process...');
      
      // Set up tab update listener to detect when refresh is complete
      const onTabUpdated = (tabId, changeInfo, tab) => {
        if (tabId === currentTab.id && changeInfo.status === 'complete') {
          console.log('✅ Page refresh completed, starting analysis in 3 seconds...');
          
          // Remove the listener
          chrome.tabs.onUpdated.removeListener(onTabUpdated);
          
          // Wait a bit more for background script to capture data
          setTimeout(async () => {
            try {
              updateStatus('analyzing', 'Page refreshed, analyzing conversation...');
              
              // Try to get conversation data after refresh
              const result = await chrome.storage.local.get(['conversationData']);
              
              if (result.conversationData) {
                console.log('🎉 Found conversation data after refresh!');
                
                // Extract and analyze data
                const analysis = extractSearchAndReasoning(result.conversationData);
                
                if (analysis.searchQueries.length > 0 || analysis.thoughts.length > 0 || 
                    analysis.sources.length > 0 || analysis.reasoning.length > 0) {
                  
                  // Store analysis and display results
                  currentAnalysis = analysis;
                  await chrome.storage.local.set({ analysisData: analysis });
                  
                  displayResults(analysis);
                  updateStatus('success', `Found ${analysis.searchQueries.length} queries, ${analysis.thoughts.length} thoughts`);
                  showNotification(`✅ Refresh + Analysis complete! Found ${analysis.searchQueries.length} queries, ${analysis.thoughts.length} thoughts`);
                  
                  extractBtn.style.display = 'none';
                  resetAnalyzeButton();
                  resolve(true);
                } else {
                  throw new Error('No analysis data found after refresh');
                }
              } else {
                throw new Error('No conversation data found after refresh');
              }
            } catch (error) {
              console.error('❌ Analysis failed after refresh:', error);
              updateStatus('error', 'Analysis failed after refresh');
              resetAnalyzeButton();
              reject(error);
            }
          }, 3000); // Wait 3 seconds for background script
        }
      };
      
      // Add the listener
      chrome.tabs.onUpdated.addListener(onTabUpdated);
      
      // Set timeout to prevent infinite waiting
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        reject(new Error('Refresh timeout'));
      }, 15000); // 15 second timeout
      
      // Trigger the refresh
      console.log('🔄 Triggering page refresh...');
      chrome.tabs.reload(currentTab.id);
    });
  }
  
  async function handleExtractClick() {
    if (!currentTab) return;
    
    try {
      updateStatus('analyzing', 'Extracting data from page...');
      extractBtn.disabled = true;
      extractBtn.innerHTML = '<span class="section-icon">⏳</span>Extracting...';
      
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'extractPageData'
      });
      
      if (response && response.success && response.hasData) {
        showNotification('Successfully extracted data from page!');
        updateStatus('success', 'Data extracted from page');
        
        // Hide extract button and retry analysis
        extractBtn.style.display = 'none';
        setTimeout(() => {
          handleAnalyzeClick();
        }, 500);
      } else {
        showNotification('No conversation data found on page. Try refreshing the ChatGPT page.', 'error');
        updateStatus('error', 'No data found on page');
      }
    } catch (error) {
      console.error('❌ Extract error:', error);
      showNotification('Failed to extract data from page: ' + error.message, 'error');
      updateStatus('error', 'Extraction failed');
    } finally {
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<span class="section-icon">📄</span>Try Page Extraction';
    }
  }
  
  async function handleClearDataClick() {
    try {
      updateStatus('analyzing', 'Clearing old data...');
      clearDataBtn.disabled = true;
      clearDataBtn.innerHTML = '<span class="section-icon">⏳</span>Clearing...';
      
      // Get all storage data to see what we're clearing
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      
      // Identify all ChatGPT Analyst related keys
      Object.keys(allData).forEach(key => {
        if (key.includes('chatgpt') || 
            key.includes('conversation') || 
            key.includes('analysis') ||
            key === 'conversationData' ||
            key === 'conversationMetadata' ||
            key === 'analysisData') {
          keysToRemove.push(key);
        }
      });
      
      if (keysToRemove.length > 0) {
        console.log('🧹 Clearing storage keys:', keysToRemove);
        
        // Remove all identified keys
        await chrome.storage.local.remove(keysToRemove);
        
                 // Clear UI
         currentAnalysis = null;
         resultsSection.style.display = 'none';
        
        showNotification(`Cleared ${keysToRemove.length} data items successfully!`);
        updateStatus('ready', 'All old data cleared - ready for new analysis');
        
        console.log('✅ Successfully cleared all old data');
      } else {
        showNotification('No old data found to clear');
        updateStatus('ready', 'No old data found');
      }
      
    } catch (error) {
      console.error('❌ Error clearing data:', error);
      showNotification('Failed to clear data: ' + error.message, 'error');
      updateStatus('error', 'Failed to clear data');
    } finally {
      clearDataBtn.disabled = false;
      clearDataBtn.innerHTML = '<span class="section-icon">🧹</span>Clear Old Data';
    }
  }
  
  function handleNewConversationClick() {
    chrome.tabs.create({ url: 'https://chatgpt.com/' });
    window.close();
  }
  
  // Analysis extraction logic (copied from content script)
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

    // Process only recent messages (last 10) to show current session data
    const allNodes = Object.values(mapping).filter(node => node.message);
    const recentNodes = allNodes.slice(-10); // Only last 10 messages
    
    console.log(`📊 Processing ${recentNodes.length} recent messages (from ${allNodes.length} total)`);
    
    recentNodes.forEach((node, index) => {
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
  
  function displayResults(analysis) {
    if (!analysis) {
      resultsInner.innerHTML = '<div class="no-results">No analysis data available</div>';
      return;
    }
    
    let html = '';
    
    // Search Queries
    if (analysis.searchQueries.length > 0) {
      html += createResultSection('🔍', 'Search Queries', analysis.searchQueries, 'query');
    }
    
    // Thoughts
    if (analysis.thoughts.length > 0) {
      const thoughtTexts = analysis.thoughts.map(t => `${t.summary}: ${t.content}`);
      html += createResultSection('🧠', 'ChatGPT Thoughts', thoughtTexts, 'thought');
    }
    
    // Sources
    if (analysis.sources.length > 0) {
      const sourceTexts = analysis.sources.slice(0, 5).map(s => `${s.title} (${s.domain})`);
      html += createResultSection('📚', 'Sources & Research', sourceTexts, 'source');
    }
    
    // Reasoning
    if (analysis.reasoning.length > 0) {
      const reasoningTexts = analysis.reasoning.map(r => r.content);
      html += createResultSection('⚡', 'Reasoning Process', reasoningTexts, 'reasoning');
    }
    
    // Export button
    html += '<button class="export-btn" id="export-btn">📥 Export Analysis Data</button>';
    
    resultsInner.innerHTML = html || '<div class="no-results">No results found in current conversation</div>';
    
    // Show results section
    resultsSection.style.display = 'block';
    if (!resultsContent.classList.contains('expanded')) {
      toggleSection(resultsContent, resultsHeader);
    }
    
    // Setup export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => exportAnalysisData(analysis));
    }
    
    // Setup copy buttons
    document.querySelectorAll('.result-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const text = e.target.getAttribute('data-text');
        copyToClipboard(text);
      });
    });
  }
  
  function createResultSection(icon, title, items, type) {
    if (!items || items.length === 0) return '';
    
    let html = `<div class="result-category">${icon} ${title}</div>`;
    html += '<div class="results-list">';
    
    items.forEach(item => {
      html += `
        <div class="result-item">
          ${escapeHtml(item)}
          <button class="result-copy-btn" data-text="${escapeHtml(item)}" title="Copy">📋</button>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }
  
  async function exportAnalysisData(analysis) {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        conversationId: analysis.metadata?.conversationId || 'unknown',
        searchQueries: analysis.searchQueries,
        thoughts: analysis.thoughts,
        sources: analysis.sources,
        reasoning: analysis.reasoning,
        userContext: analysis.userContext,
        metadata: analysis.metadata
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      await chrome.downloads.download({
        url: url,
        filename: `chatgpt-analysis-${new Date().toISOString().split('T')[0]}.json`,
        saveAs: true
      });
      
      showNotification('Analysis data exported successfully!');
      
    } catch (error) {
      console.error('❌ Error exporting data:', error);
      showNotification('Failed to export data', 'error');
    }
  }
  
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Copied to clipboard!');
    } catch (error) {
      console.error('❌ Error copying to clipboard:', error);
      showNotification('Failed to copy to clipboard', 'error');
    }
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // updateStats function removed - status text shows counts instead
  
  function updateStatus(type, message) {
    statusText.textContent = message;
    
    // Update status dot color based on type
    statusDot.className = 'status-dot';
    
    switch (type) {
      case 'success':
        statusDot.style.background = '#81c784';
        statusDot.style.animation = 'pulse 2s infinite';
        break;
      case 'analyzing':
        statusDot.style.background = '#ffb74d';
        statusDot.style.animation = 'pulse 1s infinite';
        break;
      case 'error':
        statusDot.style.background = '#ff6b6b';
        statusDot.style.animation = 'pulse 1s infinite';
        break;
      case 'inactive':
        statusDot.style.background = 'rgba(232, 234, 237, 0.5)';
        statusDot.style.animation = 'none';
        break;
      case 'waiting':
      case 'ready':
      default:
        statusDot.style.background = '#4fc3f7';
        statusDot.style.animation = 'pulse 2s infinite';
        break;
    }
  }
  
  function updateUI() {
    // Show tips by default on first open
    const isFirstOpen = !localStorage.getItem('chatgpt-analyst-opened');
    if (isFirstOpen) {
      toggleSection(tipsContent, tipsHeader);
      localStorage.setItem('chatgpt-analyst-opened', 'true');
    }
  }
  
  function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const bgColor = type === 'error' ? 
      'linear-gradient(135deg, #ff6b6b, #ff5252)' : 
      'linear-gradient(135deg, #4fc3f7, #29b6f6)';
    
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transform: translateY(100%);
      transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateY(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
  
  console.log('✅ ChatGPT Analyst popup loaded successfully');
}); 