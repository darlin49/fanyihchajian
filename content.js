// 存储翻译弹窗的DOM元素引用
let translationPopup = null;
// 标记是否正在进行翻译，防止重复翻译
let isTranslating = false;

/**
 * 初始化函数：在页面加载时设置必要的环境
 */
function initialize() {
  // 创建并注入CSS样式表
  const style = document.createElement('link');
  // 设置为样式表链接
  style.rel = 'stylesheet';
  // 设置文件类型
  style.type = 'text/css';
  // 获取扩展中的样式文件URL
  style.href = chrome.runtime.getURL('styles.css');
  // 将样式表添加到页面头部
  document.head.appendChild(style);
}

/**
 * 验证用户选中的文本是否符合翻译条件
 * @param {string} text - 用户选中的文本
 * @returns {string|null} - 返回验证后的文本，如果无效则返回null
 */
function validateSelectedText(text) {
  // 去除文本前后的空白字符
  text = text.trim();
  
  // 如果文本为空，返回null
  if (!text) return null;
  
  // 检查文本长度是否超过50个字符
  if (text.length > 50) return null;
  
  // 检查是否包含中文字符（如果包含则返回null）
  if (/[\u4e00-\u9fa5]/.test(text)) return null;
  
  // 检查是否只包含英文字母、空格和允许的标点符号（连字符和单引号）
  if (!/^[a-zA-Z\s\-\']+$/.test(text)) return null;
  
  // 检查单词数量是否超过5个
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 5) return null;
  
  // 通过所有验证，返回处理后的文本
  return text;
}

// 为文档添加鼠标抬起事件监听器，使用防抖处理以提高性能
document.addEventListener('mouseup', debounce(handleTextSelection, 300));

/**
 * 防抖函数：限制函数的执行频率
 * @param {Function} func - 需要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} - 返回防抖处理后的函数
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    // 创建一个延迟执行的函数
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    // 清除之前的定时器
    clearTimeout(timeout);
    // 设置新的定时器
    timeout = setTimeout(later, wait);
  };
}

/**
 * 处理文本选择的主要函数
 * @param {Event} e - 鼠标事件对象
 */
async function handleTextSelection(e) {
  // 如果正在翻译中，直接返回
  if (isTranslating) return;

  // 获取用户选中的文本并去除空白
  const selectedText = window.getSelection().toString().trim();
  
  // 验证选中的文本是否符合要求
  const validatedText = validateSelectedText(selectedText);
  
  // 如果文本无效，移除已存在的弹窗并返回
  if (!validatedText) {
    removePopup();
    return;
  }

  // 如果点击的是翻译弹窗内的内容，不进行处理
  if (translationPopup && translationPopup.contains(e.target)) {
    return;
  }

  try {
    // 标记正在翻译中
    isTranslating = true;
    
    // 首先显示加载中状态，不再传递鼠标位置
    showTranslationPopup("正在查询中...");
    
    // 获取翻译结果
    const translation = await getTranslation(validatedText);
    
    // 更新弹窗内容为翻译结果
    if (translation) {
      updatePopupContent(translation);
    }
  } catch (error) {
    console.error('翻译错误:', error);
    updatePopupContent(validatedText);
  } finally {
    isTranslating = false;
  }
}

/**
 * 更新弹窗内容
 * @param {string} content - 要显示的内容
 */
function updatePopupContent(content) {
  if (!translationPopup) return;
  
  const contentDiv = translationPopup.querySelector('.xyz-popup-content');
  if (contentDiv) {
    if (content.startsWith('<div')) {
      // HTML 内容
      contentDiv.innerHTML = content;
    } else {
      // 纯文本内容
      contentDiv.style.whiteSpace = 'pre-line';
      contentDiv.textContent = content;
    }
  }
}

/**
 * 获取文本的翻译
 * @param {string} text - 需要翻译的文本
 * @returns {Promise<string>} - 翻译结果
 */
async function getTranslation(text) {
  try {
    console.log('发送翻译请求:', text);

    const response = await fetch('http://localhost:8080/api/world', {
      method: 'POST',
      headers: {
       'Content-Type': 'application/json',
       'Accept': 'application/json',
       'Origin': window.location.origin
      },
      mode: 'cors',
      credentials: 'include',
      body: JSON.stringify({ word: text })
    });

    console.log('服务器响应状态:', response.status);
    const data = await response.json();
    console.log('服务器返回数据:', data);

    if (data.code === 200 && data.data) {
      return formatTranslation(data.data);
    } else {
      throw new Error(data.message || '翻译服务异常');
    }
  } catch (error) {
    console.error('翻译请求详细错误:', error);
    throw error;
  }
}

/**
 * 格式化翻译结果
 * @param {Object} data - 响应数据
 * @returns {string} - 格式化后的翻译文本
 */
function formatTranslation(data) {
  try {
    if (!data || !Array.isArray(data) || data.length === 0) return '无数据';

    // 多个结果时使用水平布局
    let content = '<div style="display: flex; gap: 20px;">';
    
    // 遍历每个结果创建列
    for (const result of data) {
      if (result.word && result.mean) {
        let meanText = result.mean;
        
        // 定义所有可能的词性标记，按长度降序排列
        const partOfSpeech = [
          'pron.', 'prep.', 'conj.', 'adv.', 'adj.', 'aux.', 'art.', 'int.', 'num.', 
          'vt.', 'vi.', 'v.', 'n.'
        ].sort((a, b) => b.length - a.length);
        
        // 为每个词性标记添加换行
        partOfSpeech.forEach(mark => {
          // 使用正则表达式确保只替换词性标记本身，而不是单词中的部分
          const regex = new RegExp(`(?<!\\w)${mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
          meanText = meanText.replace(regex, `\n${mark}\n`);
        });
        
        // 分割成行并清理
        let lines = meanText.split('\n')
          .map(line => line.trim())
          .filter(line => line)  // 移除空行
          .map(line => {
            // 如果这行不是词性标记，进行额外处理
            if (!partOfSpeech.some(mark => line.startsWith(mark))) {
              return line
                .replace(/[;；]/g, '、')  // 将分号统一为顿号
                .replace(/[,，]/g, '、')  // 将逗号统一为顿号
                .replace(/\s*、\s*/g, '、')  // 规范化顿号前后的空格
                .replace(/\s+/g, ' ')  // 规范化空格
                .replace(/^[、\s]+|[、\s]+$/g, '');  // 移除首尾多余的顿号和空格
            }
            return line;
          });

        content += `
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 16px;">${result.word}</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${lines.map(line => {
                // 判断是否是词性标记
                const isPartOfSpeech = partOfSpeech.some(mark => line.startsWith(mark));
                return `<div style="${isPartOfSpeech ? 'color: #666;' : ''}">${line}</div>`;
              }).join('')}
            </div>
          </div>`;
      }
    }
    
    content += '</div>';
    return content;
  } catch (error) {
    console.error('格式化翻译数据出错:', error);
    return JSON.stringify(data);
  }
}

/**
 * 获取元素的绝对位置
 * @param {Element} element - 目标元素
 * @returns {Object} - 包含 top 和 left 的位置信息
 */
function getAbsolutePosition(element) {
  const rect = element.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // 获取所有父级滚动容器的滚动位置
  let parent = element.parentElement;
  let additionalScrollTop = 0;
  let additionalScrollLeft = 0;
  
  while (parent) {
    if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
      additionalScrollTop += parent.scrollTop;
      additionalScrollLeft += parent.scrollLeft;
    }
    parent = parent.parentElement;
  }
  
  return {
    top: rect.top + scrollTop + additionalScrollTop,
    left: rect.left + scrollLeft + additionalScrollLeft,
    bottom: rect.bottom + scrollTop + additionalScrollTop,
    right: rect.right + scrollLeft + additionalScrollLeft,
    width: rect.width,
    height: rect.height
  };
}

/**
 * 显示翻译结果弹窗
 * @param {string} translation - 翻译结果
 */
function showTranslationPopup(translation) {
  // 移除已存在的弹窗
  removePopup();

  // 创建新的弹窗元素
  translationPopup = document.createElement('div');
  translationPopup.className = 'xyz-popup';
  
  // 创建标题区域
  const titleDiv = document.createElement('div');
  titleDiv.className = 'xyz-popup-title';
  titleDiv.innerHTML = `让我<br>来告诉你什么意思：`;
  
  // 创建翻译内容区域
  const contentDiv = document.createElement('div');
  contentDiv.className = 'xyz-popup-content';
  contentDiv.textContent = translation;

  // 创建关闭按钮
  const closeButton = document.createElement('span');
  closeButton.className = 'xyz-popup-close';
  closeButton.innerHTML = ' ';
  closeButton.onclick = removePopup;

  // 组装弹窗各个部分
  translationPopup.appendChild(titleDiv);
  translationPopup.appendChild(contentDiv);
  translationPopup.appendChild(closeButton);

  // 获取选中文本的位置信息
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  
  // 获取选中文本所在的元素
  const selectedElement = range.startContainer.parentElement;
  
  // 获取选中文本的绝对位置
  const absoluteRect = getAbsolutePosition(selectedElement);
  const rangeRect = range.getBoundingClientRect();
  
  // 先将弹窗添加到页面但隐藏
  document.body.appendChild(translationPopup);
  translationPopup.style.visibility = 'hidden';
  
  // 获取弹窗尺寸
  const popupRect = translationPopup.getBoundingClientRect();
  
  // 计算最佳位置
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  
  // 初始位置设置（相对于选中文本）
  let left = rangeRect.left;
  let top = rangeRect.bottom + 10;
  
  // 考虑父容器的滚动位置
  let scrollContainer = selectedElement.closest('.overflow-auto, .overflow-scroll, [style*="overflow"]');
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    // 确保弹窗不会超出滚动容器的可视区域
    if (top + popupRect.height > containerRect.bottom) {
      top = rangeRect.top - popupRect.height - 10;
    }
    if (left + popupRect.width > containerRect.right) {
      left = containerRect.right - popupRect.width - 10;
    }
  }
  
  // 确保弹窗在视口内
  if (left + popupRect.width > viewportWidth) {
    left = viewportWidth - popupRect.width - 10;
  }
  if (left < 0) {
    left = 10;
  }
  
  if (top + popupRect.height > viewportHeight) {
    top = rangeRect.top - popupRect.height - 10;
    if (top < 0) {
      top = Math.min((viewportHeight - popupRect.height) / 2, rangeRect.top - 10);
    }
  }
  if (top < 0) {
    top = 10;
  }

  // 设置弹窗位置
  translationPopup.style.left = `${left}px`;
  translationPopup.style.top = `${top}px`;
  translationPopup.style.visibility = 'visible';

  // 处理点击页面其他区域时关闭弹窗
  document.addEventListener('mousedown', handleOutsideClick);
}

/**
 * 处理点击弹窗外部区域的事件
 * @param {Event} e - 鼠标事件对象
 */
function handleOutsideClick(e) {
  // 如果点击的不是弹窗内的元素，则关闭弹窗
  if (translationPopup && !translationPopup.contains(e.target)) {
    removePopup();
  }
}

/**
 * 移除翻译弹窗
 */
function removePopup() {
  // 如果弹窗存在，从页面中移除
  if (translationPopup && translationPopup.parentNode) {
    translationPopup.parentNode.removeChild(translationPopup);
    translationPopup = null;
    // 移除点击外部区域的事件监听
    document.removeEventListener('mousedown', handleOutsideClick);
  }
}

/**
 * 显示错误信息
 * @param {string} message - 错误信息
 */
function showError(message) {
  // 创建错误提示元素
  const errorDiv = document.createElement('div');
  errorDiv.className = 'xyz-error';
  errorDiv.textContent = message;
  
  // 添加到页面
  document.body.appendChild(errorDiv);
  
  // 3秒后自动移除错误提示
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.parentNode.removeChild(errorDiv);
    }
  }, 3000);
}

// 初始化扩展
initialize();

// 清理函数
window.addEventListener('unload', () => {
  removePopup();
  document.removeEventListener('mouseup', handleTextSelection);
});