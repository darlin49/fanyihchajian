// background.js
console.log('Background script loaded'); // 用于调试

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log('Received message:', request); // 用于调试

    if (request.type === 'TRANSLATE') {
      fetch('http://localhost:8080/api/world/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ word: request.word })
      })
      .then(response => {
        if (!response.ok) {
          console.error('HTTP错误:', response.status);
          throw new Error(`HTTP错误: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Translation response:', data); // 用于调试
        sendResponse(data);
      })
      .catch(error => {
        console.error('Translation error:', error); // 用于调试
        sendResponse({ error: error.message });
      });

      return true; // 保持消息通道打开，这一行很重要
    }
  }
);