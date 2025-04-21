/**
 * popup.js
 * 扩展弹出窗口的主要功能实现
 */

/**
 * 当DOM加载完成后初始化弹出窗口
 */
document.addEventListener('DOMContentLoaded', function() {
  // 为查询按钮添加点击事件监听器
  document.getElementById('searchBtn').addEventListener('click', async () => {
    const word = document.getElementById('wordInput').value.trim();
    if (word) {
      const translation = await translateWord(word);
      if (translation) {
        showNotification('查询成功！');
        document.getElementById('wordInput').value = ''; // 清空输入框
      }
    }
  });
});

/**
 * 翻译单词的主要函数
 * @param {string} word - 需要翻译的单词
 * @returns {Promise<Object|null>} 翻译结果对象
 */
async function translateWord(word) {
  try {
    // 直接发送请求到后端服务器
    const response = await fetch('http://localhost:8080/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ word: word })
    });

    const result = await response.json();
    
    if (result.code === 200 && result.data) {
      displayTranslation(result.data);
      return result.data;
    } else {
      throw new Error(result.message || '查询失败');
    }
  } catch (error) {
    console.error('翻译失败:', error);
    showNotification('查询失败，请稍后重试');
    return null;
  }
}

/**
 * 显示翻译结果
 * @param {Object} data - 翻译数据
 */
function displayTranslation(data) {
  const wordList = document.getElementById('wordList');
  wordList.innerHTML = ''; // 清空现有内容
  
  const div = document.createElement('div');
  div.className = 'word-item';
  
  // 格式化显示内容
  const content = `
    <div class="word-header">
      <span class="word">${data.word}</span>
      <span class="symbols">[${data.symbols}]</span>
    </div>
    <div class="word-meaning">
      <span class="part">${data.part}</span>
      <span class="mean">${data.mean}</span>
    </div>
    <div class="word-example">
      <div class="example">${data.ex}</div>
      <div class="translation">${data.tran}</div>
    </div>
  `;
  
  div.innerHTML = content;
  wordList.appendChild(div);
}

/**
 * 显示临时通知消息
 * @param {string} message - 要显示的消息内容
 */
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
} 