// 数据库同步配置
const DB_CONFIG = {
  url: 'http://localhost:3366/api/translations',
  enabled: true,  // 可以通过这个开关控制是否同步到数据库
  autoSync: true, // 自动同步开关
  syncInterval:  20 * 1000  // 同步间隔，默认1分钟
};

// 批量同步到数据库
async function batchSyncToDatabase() {
  if (!DB_CONFIG.enabled || !DB_CONFIG.autoSync) return;

  try {
    const result = await chrome.storage.local.get('translations');
    const translations = result.translations || [];
    
    // 获取上次同步时间
    const lastSync = await chrome.storage.local.get('lastSyncTime');
    const lastSyncTime = lastSync.lastSyncTime || 0;
    
    // 筛选出需要同步的数据（新增或修改的）
    const needSync = translations.filter(item => 
      new Date(item.lasttime).getTime() > lastSyncTime
    );

    if (needSync.length === 0) return;

    // 批量同步
    const response = await fetch(DB_CONFIG.url + '/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ translations: needSync })
    });

    if (!response.ok) {
      throw new Error('批量同步失败');
    }

    // 更新最后同步时间
    await chrome.storage.local.set({ 
      lastSyncTime: new Date().getTime() 
    });

    console.log(`成功同步 ${needSync.length} 条记录`);
  } catch (error) {
    console.error('Auto sync error:', error);
  }
}

// 启动自动同步
function startAutoSync() {
  if (!DB_CONFIG.enabled || !DB_CONFIG.autoSync) return;

  // 初次启动时执行一次同步
  batchSyncToDatabase();

  // 设置定时同步
  setInterval(batchSyncToDatabase, DB_CONFIG.syncInterval);
}

// 同步到数据库
async function syncToDatabase(word, translation) {
  if (!DB_CONFIG.enabled) return;
  
  try {
    const response = await fetch(DB_CONFIG.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ word, translation })
    });
    
    if (!response.ok) {
      throw new Error('数据库同步失败');
    }
  } catch (error) {
    console.error('Database sync error:', error);
    // 失败不影响本地存储
  }
}

// 处理翻译保存请求
async function handleSaveTranslation(word, translation) {
  try {
    // 获取现有数据
    const result = await chrome.storage.local.get('translations');
    let translations = result.translations || [];
    
    // 检查是否已存在
    const index = translations.findIndex(t => t.word.toLowerCase() === word.toLowerCase());
    const now = new Date().toISOString();
    
    if (index !== -1) {
      // 更新已存在的记录
      translations[index] = {
        ...translations[index],
        translation,
        count: (translations[index].count || 1) + 1,
        lasttime: now
      };
    } else {
      // 添加新记录
      translations.unshift({
        id: Date.now(),
        word,
        translation,
        count: 1,
        lasttime: now
      });
    }
    
    // 限制存储数量，最多保存1000条
    if (translations.length > 1000) {
      translations = translations.slice(0, 1000);
    }
    
    // 保存更新后的数据
    await chrome.storage.local.set({ translations });
    
    // 同步到数据库
    await syncToDatabase(word, translation);
    
    return { success: true };
  } catch (error) {
    console.error('Save error:', error);
    return { success: false, error: error.message };
  }
}

// 获取翻译列表
async function getTranslations() {
  try {
    // 优先从本地获取
    const result = await chrome.storage.local.get('translations');
    
    // 如果启用了数据库同步，尝试从数据库获取更新
    if (DB_CONFIG.enabled) {
      try {
        const response = await fetch(DB_CONFIG.url);
        if (response.ok) {
          const dbData = await response.json();
          // 合并数据库数据和本地数据
          await mergeTranslations(dbData);
          // 重新获取合后的数据
          const updated = await chrome.storage.local.get('translations');
          return updated.translations || [];
        }
      } catch (error) {
        console.error('Database fetch error:', error);
      }
    }
    
    return result.translations || [];
  } catch (error) {
    console.error('Get translations error:', error);
    throw error;
  }
}

// 合并本地和数据库数据
async function mergeTranslations(dbData) {
  const result = await chrome.storage.local.get('translations');
  let localData = result.translations || [];
  
  // 使用 Map 来合并数据，以单词为键
  const mergedMap = new Map();
  
  // 先添加本地数据
  localData.forEach(item => {
    mergedMap.set(item.word.toLowerCase(), item);
  });
  
  // 合并数据库数据，如果时间更新则覆盖
  dbData.forEach(item => {
    const existing = mergedMap.get(item.word.toLowerCase());
    if (!existing || new Date(item.lasttime) > new Date(existing.lasttime)) {
      mergedMap.set(item.word.toLowerCase(), item);
    }
  });
  
  // 转换回数组并按时间排序
  const merged = Array.from(mergedMap.values())
    .sort((a, b) => new Date(b.lasttime) - new Date(a.lasttime));
  
  // 更新本地存储
  await chrome.storage.local.set({ translations: merged });
}

// 删除翻译
async function deleteTranslation(id) {
  try {
    const result = await chrome.storage.local.get('translations');
    let translations = result.translations || [];
    
    // 获取要删除的记录
    const toDelete = translations.find(t => t.id === id);
    
    // 从本地存储中删除
    translations = translations.filter(t => t.id !== id);
    await chrome.storage.local.set({ translations });
    
    // 如果启用了数据库同步，同步删除操作
    if (DB_CONFIG.enabled && toDelete) {
      try {
        await fetch(`${DB_CONFIG.url}/${id}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.error('Database delete error:', error);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Delete error:', error);
    return { success: false, error: error.message };
  }
}

// 处理端口连接
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'translation-port') {
    port.onMessage.addListener(async function(request) {
      try {
        let response;
        
        switch (request.type) {
          case 'SAVE_TRANSLATION':
            response = await handleSaveTranslation(request.word, request.translation);
            break;
          case 'GET_TRANSLATIONS':
            response = { success: true, data: await getTranslations() };
            break;
          case 'DELETE_TRANSLATION':
            response = await deleteTranslation(request.id);
            break;
          case 'LOOKUP_WORD':
            try {
              const lookupResponse = await fetch(
                `http://localhost:3366/api/lookup/${encodeURIComponent(request.word)}`
              );
              if (!lookupResponse.ok) {
                throw new Error('查询失败');
              }
              const data = await lookupResponse.json();
              response = { success: true, data };
            } catch (error) {
              console.error('Lookup error:', error);
              response = { success: false, error: error.message };
            }
            break;
          default:
            response = { success: false, error: '未知的请求类型' };
        }
        
        port.postMessage(response);
      } catch (error) {
        port.postMessage({ success: false, error: error.message });
      }
    });
  }
});

// 保持 service worker 活跃的其他方法
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {
  console.log('Service worker kept alive');
});

// 在文件末尾启动自动同步
startAutoSync();

// 监听浏览器启动事件
chrome.runtime.onStartup.addListener(() => {
  startAutoSync();
});

// 监听安装/更新事件
chrome.runtime.onInstalled.addListener(() => {
  startAutoSync();
}); 