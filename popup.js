document.addEventListener('DOMContentLoaded', function() {
  // 初始化时加载单词列表
  getWordList();

  // 添加查询按钮事件监听
  document.getElementById('searchBtn').addEventListener('click', async () => {
    const word = document.getElementById('wordInput').value.trim();
    if (word) {
      // 获取翻译
      const translation = await translateWord(word);
      if (translation) {
        // 保存单词和翻译
        await saveWord(word, translation);
      }
    }
  });
});

// 翻译单词函数
async function translateWord(word) {
  try {
    // 通过 background.js 发送请求
    const response = await chrome.runtime.sendMessage({
      type: 'LOOKUP_WORD',
      word: word
    });

    if (response.success) {
      const data = response.data;
      return {
        translation: data.data.translation,
        accent: data.data.accent,
        example: data.data.example,
        example_trans: data.data.example_trans,
        source: data.source
      };
    }

    // 本地没有找到，使用 MyMemory API
    return fallbackTranslate(word);
  } catch (error) {
    console.error('翻译失败:', error);
    return fallbackTranslate(word);
  }
}

// 回退翻译方案
async function fallbackTranslate(word) {
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${word}&langpair=en|zh`);
    const data = await response.json();
    if (data.responseStatus === 200) {
      return {
        translation: data.responseData.translatedText,
        accent: '',
        mean_en: '',
        sentence: '',
        sentence_trans: ''
      };
    }
    return null;
  } catch (error) {
    console.error('回退翻译失败:', error);
    return null;
  }
}

// 保存单词到数据库
async function saveWord(word, translation) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_TRANSLATION',
      word,
      translation
    });

    if (response.success) {
      showNotification('单词已保存！');
      getWordList(); // 刷新列表
      document.getElementById('wordInput').value = ''; // 清空输入框
    } else {
      throw new Error(response.error || '保存失败');
    }
  } catch (error) {
    console.error('保存单词失败:', error);
    showNotification('保存失败，请稍后重试');
  }
}

// 获取单词列表
async function getWordList() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_TRANSLATIONS'
    });

    if (response.success) {
      displayWords(response.data);
    } else {
      throw new Error(response.error || '获取列表失败');
    }
  } catch (error) {
    console.error('获取单词列表失败:', error);
    showNotification('获取列表失败，请稍后重试');
  }
}

// 显示单词列表
function displayWords(words) {
  const wordList = document.getElementById('wordList');
  wordList.innerHTML = '';
  words.forEach(word => {
    const div = document.createElement('div');
    div.className = 'word-item';
    div.innerHTML = `
      <span class="word">${word.word}</span>
      <span class="translation">${word.translation}</span>
      <button class="delete-btn" data-id="${word.id}">删除</button>
    `;
    
    // 添加删除功能
    div.querySelector('.delete-btn').addEventListener('click', async () => {
      await deleteWord(word.id);
    });
    
    wordList.appendChild(div);
  });
}

// 删除单词
async function deleteWord(id) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'DELETE_TRANSLATION',
      id
    });

    if (response.success) {
      getWordList(); // 刷新列表
      showNotification('删除成功');
    } else {
      throw new Error(response.error || '删除失败');
    }
  } catch (error) {
    console.error('删除单词失败:', error);
    showNotification('删除失败，请稍后重试');
  }
}

// 显示通知
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
} 