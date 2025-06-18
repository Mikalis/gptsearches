// ChatGPT Analyst - Enhanced Popup Script
console.log('🎉 ChatGPT Analyst popup loading...');

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const analyzeBtn = document.getElementById('analyze-btn');
  const newConversationBtn = document.getElementById('new-conversation-btn');
  const tipsHeader = document.getElementById('tips-header');
  const tipsContent = document.getElementById('tips-content');
  const settingsHeader = document.getElementById('settings-header');
  const settingsContent = document.getElementById('settings-content');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const statusDot = statusIndicator.querySelector('.status-dot');
  const statsGrid = document.getElementById('stats-grid');
  const queriesCount = document.getElementById('queries-count');
  const thoughtsCount = document.getElementById('thoughts-count');
  
  // Settings elements
  const autoAnalyzeToggle = document.getElementById('auto-analyze');
  const showDebugToggle = document.getElementById('show-debug');
  const realtimeUpdatesToggle = document.getElementById('realtime-updates');
  
  // State
  let currentTab = null;
  let analysisData = null;
  
  // Initialize
  init();
  
  async function init() {
    try {
      await loadSettings();
      await loadAnalysisData();
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
        autoAnalyze: true,
        showDebug: false,
        realtimeUpdates: true
      });
      
      autoAnalyzeToggle.checked = settings.autoAnalyze;
      showDebugToggle.checked = settings.showDebug;
      realtimeUpdatesToggle.checked = settings.realtimeUpdates;
      
      console.log('📋 Settings loaded:', settings);
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  }
  
  async function loadAnalysisData() {
    try {
      const result = await chrome.storage.local.get(['analysisData', 'conversationData']);
      analysisData = result.analysisData;
      
      if (analysisData) {
        updateStats(analysisData);
        updateStatus('success', 'Analysis data found');
      } else if (result.conversationData) {
        updateStatus('ready', 'Conversation detected - ready to analyze');
      } else {
        updateStatus('waiting', 'Waiting for conversation data');
      }
      
      console.log('📊 Analysis data loaded:', analysisData);
    } catch (error) {
      console.error('❌ Error loading analysis data:', error);
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
      updateStatus('ready', 'Ready to analyze conversations');
      
    } catch (error) {
      console.error('❌ Error checking tab status:', error);
      updateStatus('error', 'Unable to check tab status');
    }
  }
  
  function setupEventListeners() {
    // Expandable sections
    tipsHeader.addEventListener('click', () => toggleSection(tipsContent, tipsHeader));
    settingsHeader.addEventListener('click', () => toggleSection(settingsContent, settingsHeader));
    
    // Settings toggles
    autoAnalyzeToggle.addEventListener('change', () => updateSetting('autoAnalyze', autoAnalyzeToggle.checked));
    showDebugToggle.addEventListener('change', () => updateSetting('showDebug', showDebugToggle.checked));
    realtimeUpdatesToggle.addEventListener('change', () => updateSetting('realtimeUpdates', realtimeUpdatesToggle.checked));
    
    // Action buttons
    analyzeBtn.addEventListener('click', handleAnalyzeClick);
    newConversationBtn.addEventListener('click', handleNewConversationClick);
    
    // Storage listeners
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    // Auto-refresh every 2 seconds when popup is open
    setInterval(refreshData, 2000);
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
    
    // Add animation class
    contentElement.style.transition = 'max-height 0.3s ease';
  }
  
  async function updateSetting(key, value) {
    try {
      await chrome.storage.sync.set({ [key]: value });
      
      // Send message to content script
      if (currentTab && (currentTab.url.includes('chatgpt.com') || currentTab.url.includes('chat.openai.com'))) {
        chrome.tabs.sendMessage(currentTab.id, {
          action: 'updateSettings',
          settings: { [key]: value }
        }).catch(() => {
          // Content script not ready, ignore
        });
      }
      
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
      updateStatus('analyzing', 'Analyzing conversation...');
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = '<span class="section-icon">⏳</span>Analyzing...';
      
      // Send analyze message to content script
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'analyzeConversation',
        manual: true
      });
      
      setTimeout(async () => {
        await loadAnalysisData();
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<span class="section-icon">🔍</span>Analyze Conversation';
      }, 1500);
      
      showNotification('Analysis started');
      
    } catch (error) {
      console.error('❌ Error during analysis:', error);
      updateStatus('error', 'Analysis failed - try refreshing the page');
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = '<span class="section-icon">🔍</span>Analyze Conversation';
      showNotification('Analysis failed', 'error');
    }
  }
  
  function handleNewConversationClick() {
    chrome.tabs.create({ url: 'https://chatgpt.com/' });
    window.close();
  }
  
  function handleStorageChange(changes, namespace) {
    if (namespace === 'local') {
      if (changes.analysisData) {
        analysisData = changes.analysisData.newValue;
        updateStats(analysisData);
        if (analysisData) {
          updateStatus('success', `Found ${analysisData.searchQueries?.length || 0} queries, ${analysisData.thoughts?.length || 0} thoughts`);
        }
      }
      
      if (changes.conversationData) {
        if (changes.conversationData.newValue && !analysisData) {
          updateStatus('ready', 'New conversation detected');
        }
      }
    }
  }
  
  async function refreshData() {
    try {
      await loadAnalysisData();
    } catch (error) {
      // Silent fail for background refresh
    }
  }
  
  function updateStats(data) {
    if (!data) {
      statsGrid.style.display = 'none';
      return;
    }
    
    const queries = data.searchQueries?.length || 0;
    const thoughts = data.thoughts?.length || 0;
    
    queriesCount.textContent = queries;
    thoughtsCount.textContent = thoughts;
    
    if (queries > 0 || thoughts > 0) {
      statsGrid.style.display = 'grid';
      
      // Add animation to stats
      queriesCount.style.animation = 'none';
      thoughtsCount.style.animation = 'none';
      
      setTimeout(() => {
        queriesCount.style.animation = 'pulse 0.5s ease';
        thoughtsCount.style.animation = 'pulse 0.5s ease';
      }, 10);
    } else {
      statsGrid.style.display = 'none';
    }
  }
  
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