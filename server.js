const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const app = express();

app.use(cors({
  origin: ['chrome-extension://*', 'http://localhost:3366'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: true
}));
app.use(express.json());

const connection = mysql.createConnection({
  host: '74.48.143.17',
  port: 3306,
  user: 'Zuo',
  password: 'Zuo123456!',
  database: 'danci',
  charset: 'utf8mb4'
});

connection.connect(error => {
  if (error) {
    console.error('数据库连接失败:', error.stack);
    return;
  }
  console.log('数据库连接成功');
});

// 添加本地词典缓存
const localDictionary = new Map();

// 加载本地词典
function loadLocalDictionary() {
  console.log('开始加载本地词典...');
  
  // 创建解析器配置
  const csvOptions = {
    headers: ['word', 'translation'],
    skipLines: 0
  };

  // 添加错误处理和日志
  try {
    const filePath = '墨墨六级深度记忆宝典 全部单词.csv';
    if (!fs.existsSync(filePath)) {
      console.error('词典文件不存在:', filePath);
      return;
    }

    fs.createReadStream(filePath, { encoding: 'utf-8' })
      .pipe(csv(csvOptions))
      .on('data', (row) => {
        // 清理数据
        const word = row.word.trim().toLowerCase();
        const translation = row.translation.trim();
        
        if (word && translation) {
          // 存储到词典
          localDictionary.set(word, {
            word: word,
            translation: translation,
            source: 'local_dict'
          });

          // 调试：打印前几个单词
          if (localDictionary.size <= 5) {
            console.log('Sample word:', word, '=', translation);
          }
        }
      })
      .on('end', () => {
        console.log('本地词典加载完成，共加载', localDictionary.size, '个单词');
      })
      .on('error', (error) => {
        console.error('词典加载错误:', error);
      });
  } catch (error) {
    console.error('加载词典时发生错误:', error);
  }
}

// 启动时加载词典
loadLocalDictionary();

app.post('/api/translations', (req, res) => {
  let { word, translation } = req.body;
  
  word = word.substring(0, 255);
  translation = translation ? translation.substring(0, 255) : null;

  const checkQuery = 'SELECT * FROM translations WHERE word = ? COLLATE utf8mb4_bin';
  
  connection.query(checkQuery, [word], (error, results) => {
    if (error) {
      console.error('查询错误:', error);
      res.status(500).json({ error: '查询失败: ' + error.message });
      return;
    }
    
    if (results.length > 0) {
      const updateQuery = `
        UPDATE translations 
        SET count = count + 1,
            translation = ?
        WHERE word = ? COLLATE utf8mb4_bin
      `;
      
      connection.query(updateQuery, [translation, word], (error) => {
        if (error) {
          console.error('更新错误:', error);
          res.status(500).json({ error: '更新失败: ' + error.message });
          return;
        }
        res.json({ success: true });
      });
    } else {
      const insertQuery = `
        INSERT INTO translations (
          word,
          translation,
          count,
          is_chinese_to_chinese,
          chinese_word_type,
          chinese_translation_type,
          chinese_similarity
        ) VALUES (?, ?, 1, 0, NULL, NULL, 0)
      `;
      
      connection.query(insertQuery, [word, translation], (error, result) => {
        if (error) {
          console.error('插入错误:', error);
          res.status(500).json({ error: '插入失败: ' + error.message });
          return;
        }
        res.json({ success: true });
      });
    }
  });
});

app.get('/api/translations', (req, res) => {
  const query = `
    SELECT 
      id,
      word,
      translation,
      count,
      lasttime,
      is_chinese_to_chinese,
      chinese_word_type,
      chinese_translation_type,
      chinese_similarity
    FROM translations 
    ORDER BY lasttime DESC
  `;
  
  connection.query(query, (error, results) => {
    if (error) {
      console.error('查询错误:', error);
      res.status(500).json({ error: '获取列表失败' });
      return;
    }
    res.json(results);
  });
});

app.delete('/api/translations/:id', (req, res) => {
  const query = 'DELETE FROM translations WHERE id = ?';
  
  connection.query(query, [req.params.id], (error) => {
    if (error) {
      console.error('删除错误:', error);
      res.status(500).json({ error: '删除失败' });
      return;
    }
    res.json({ success: true });
  });
});

app.options('*', cors());

const PORT = 3366;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

process.on('SIGINT', () => {
  connection.end(err => {
    if (err) console.error('关闭连接错误:', err);
    process.exit();
  });
});

app.get('/api/lookup/:word', async (req, res) => {
  const word = req.params.word.toLowerCase();
  
  // 先查本地词典
  const localResult = localDictionary.get(word);
  if (localResult) {
    console.log('本地词典命中:', word);
    return res.json({
      source: 'local',
      data: localResult
    });
  }

  // 再查数据库
  try {
    const query = 'SELECT * FROM translations WHERE word = ? COLLATE utf8mb4_bin';
    connection.query(query, [word], async (error, results) => {
      if (error) {
        console.error('数据库查询错误:', error);
        return res.status(500).json({ error: '查询失败' });
      }
      
      if (results.length > 0) {
        console.log('数据库命中:', word);
        return res.json({
          source: 'database',
          data: results[0]
        });
      }
      
      // 都没有找到，返回404
      console.log('未找到单词:', word);
      res.status(404).json({ error: 'Word not found' });
    });
  } catch (error) {
    console.error('服务器错误:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});