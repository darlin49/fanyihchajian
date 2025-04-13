let translationPopup = null;
let isTranslating = false;

// 初始化
function initialize() {
  // 注入样式表
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.type = 'text/css';
  style.href = chrome.runtime.getURL('styles.css');
  document.head.appendChild(style);
}

// 验证选中的文本
function validateSelectedText(text) {
  // 移除首尾空格
  text = text.trim();
  
  // 检查是否为空
  if (!text) return null;
  
  // 检查长度限制 (1-50个字符)
  if (text.length > 50) return null;
  
  // 检查是否包含中文字符
  if (/[\u4e00-\u9fa5]/.test(text)) return null;
  
  // 检查是否只包含英文字母、空格和有限的标点
  if (!/^[a-zA-Z\s\-\']+$/.test(text)) return null;
  
  // 检查单词数量 (最多5个单词)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 5) return null;
  
  return text;
}

// 监听选中文本事件
document.addEventListener('mouseup', debounce(handleTextSelection, 300));

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 处理文本选择
async function handleTextSelection(e) {
  if (isTranslating) return;

  const selectedText = window.getSelection().toString().trim();
  
  // 验证选中的文本
  const validatedText = validateSelectedText(selectedText);
  
  // 如果文本无效，不进行翻译和保存
  if (!validatedText) {
    removePopup();
    return;
  }

  // 忽略对弹窗内容的选择
  if (translationPopup && translationPopup.contains(e.target)) {
    return;
  }

  try {
    isTranslating = true;
    // 获取翻译
    const translation = await getTranslation(validatedText);
    if (translation) {
      // 显示翻译气泡
      showTranslationPopup(translation, e.pageX, e.pageY);
      // 保存到数据库
      try {
        await saveToDatabase(validatedText, translation);
      } catch (error) {
        console.error('Save failed but translation continues:', error);
      }
    }
  } catch (error) {
    console.error('Translation error:', error);
    showError('翻译失败，请稍后重试');
  } finally {
    isTranslating = false;
  }
}

// 获取翻译
async function getTranslation(text) {
  try {
    // 创建一个持久连接
    const port = chrome.runtime.connect({ name: 'translation-port' });
    
    const response = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        port.disconnect();
        reject(new Error('查询超时'));
      }, 5000);
      
      port.onMessage.addListener(function(response) {
        clearTimeout(timeoutId);
        port.disconnect();
        resolve(response);
      });
      
      port.postMessage({
        type: 'LOOKUP_WORD',
        word: text
      });
    });

    if (response.success) {
      const data = response.data;
      // 根据来源构建不同的显示格式
      if (data.source === 'local') {
        return `${data.data.translation}\n(来源: 本地词典)`;
      } else {
        return `
          ${data.data.translation}
          ${data.data.accent ? `\n音标: ${data.data.accent}` : ''}
          ${data.data.example ? `\n例句: ${data.data.example}` : ''}
          ${data.data.example_trans ? `\n例句翻译: ${data.data.example_trans}` : ''}
        `.trim();
      }
    }

    // 本地没有找到，使用 MyMemory API
    return fallbackTranslate(text);
  } catch (error) {
    console.error('Translation error:', error);
    return fallbackTranslate(text);
  }
}

// 回退翻译方案
async function fallbackTranslate(text) {
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.responseStatus === 200) {
      return data.responseData.translatedText;
    }
    throw new Error(data.responseDetails || '翻译服务异常');
  } catch (error) {
    console.error('Fallback translation error:', error);
    throw error;
  }
}

// 保存到数据库
async function saveToDatabase(word, translation) {
  try {
    // 创建一个持久连接
    const port = chrome.runtime.connect({ name: 'translation-port' });
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        port.disconnect();
        reject(new Error('保存超时'));
      }, 5000); // 5秒超时
      
      port.onMessage.addListener(function(response) {
        clearTimeout(timeoutId);
        port.disconnect();
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || '保存失败'));
        }
      });
      
      // 发送消息
      port.postMessage({
        type: 'SAVE_TRANSLATION',
        word,
        translation
      });
    });
  } catch (error) {
    console.error('Database save error:', error);
    // 即使保存失败也不影响显示
    return { success: false };
  }
}

// 显示翻译气泡
function showTranslationPopup(translation, mouseX, mouseY) {
  removePopup();

  translationPopup = document.createElement('div');
  translationPopup.className = 'xyz-popup';
  
  // 创建标题
  const titleDiv = document.createElement('div');
  titleDiv.className = 'xyz-popup-title';
  titleDiv.innerHTML = `小燕子（已过四级）<br>来告诉你什么意思：`;
  
  // 创建翻译内容
  const contentDiv = document.createElement('div');
  contentDiv.className = 'xyz-popup-content';
  contentDiv.textContent = translation;

  // 添加关闭按钮
  const closeButton = document.createElement('span');
  closeButton.className = 'xyz-popup-close';
  closeButton.innerHTML = ' ';
  closeButton.onclick = removePopup;

  // 组装弹窗
  translationPopup.appendChild(titleDiv);
  translationPopup.appendChild(contentDiv);
  translationPopup.appendChild(closeButton);

  document.body.appendChild(translationPopup);

  // 获取选中文本的位置信息
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // 计算弹窗位置
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  const popupRect = translationPopup.getBoundingClientRect();
  
  // 默认显示在选中文本的下方
  let left = rect.left + scrollX;
  let top = rect.bottom + scrollY + 10; // 在选中文本下方10px的位置

  // 确保弹窗不超出右边界
  if (left + popupRect.width > viewportWidth + scrollX) {
    left = viewportWidth + scrollX - popupRect.width - 10;
  }
  
  // 确保弹窗不超出左边界
  if (left < scrollX) {
    left = scrollX + 10;
  }

  // 如果弹窗超出底部，则显示在选中文本的上方
  if (top + popupRect.height > viewportHeight + scrollY) {
    top = rect.top + scrollY - popupRect.height - 10;
  }

  translationPopup.style.left = `${Math.max(0, left)}px`;
  translationPopup.style.top = `${Math.max(0, top)}px`;

  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('mousedown', handleOutsideClick);
  }, 100);
}

// 处理外部点击
function handleOutsideClick(e) {
  if (translationPopup && !translationPopup.contains(e.target)) {
    removePopup();
  }
}

// 移除弹窗
function removePopup() {
  if (translationPopup) {
    document.removeEventListener('mousedown', handleOutsideClick);
    translationPopup.remove();
    translationPopup = null;
  }
}

// 显示错误信息
function showError(message) {
  const errorPopup = document.createElement('div');
  errorPopup.className = 'xyz-error';
  errorPopup.textContent = message;
  document.body.appendChild(errorPopup);

  setTimeout(() => {
    errorPopup.remove();
  }, 3000);
}

// 初始化扩展
initialize();

// 清理函数
window.addEventListener('unload', () => {
  removePopup();
  document.removeEventListener('mouseup', handleTextSelection);
});