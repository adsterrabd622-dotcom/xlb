import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

const upload = multer({ dest: 'uploads/' });

function getDbFilePath() {
  return path.join(process.cwd(), 'files_db.json');
}

function getFilesDb() {
  const dbPath = getDbFilePath();
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

function saveToDb(fileMeta: any) {
  const db = getFilesDb();
  db.push(fileMeta);
  fs.writeFileSync(getDbFilePath(), JSON.stringify(db));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const apiRouter = express.Router();

  apiRouter.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const { fileName, senderName, itemCount } = req.body;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN || '8768816712:AAFtiAbXzu_OgfvFE6lICFFxioMMDdII7v8';
      const chatId = process.env.TELEGRAM_CHAT_ID || '7523730461';

      // Save file info for admin box
      const fileMeta = {
        id: Date.now().toString(),
        originalName: fileName || file.originalname,
        date: new Date().toISOString(),
        filename: file.filename,
        size: file.size,
        senderName: senderName || 'Unknown',
        itemCount: itemCount || '0'
      };
      saveToDb(fileMeta);

      // Send to telegram
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', fs.createReadStream(file.path), fileMeta.originalName);
      
      // Escape HTML chars just in case
      const safeName = fileMeta.originalName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeSender = (senderName || 'Unknown').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeCount = (itemCount || '0').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      
      formData.append('caption', `📁 <b>File Received</b>\n\n👤 Sender: <code>${safeSender}</code>\n🔢 Items: <code>${safeCount}</code>\n📄 Name: <code>${safeName}</code>\n📅 Date: ${new Date().toLocaleString()}`);
      formData.append('parse_mode', 'HTML');

      try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, formData, {
          headers: {
            ...formData.getHeaders()
          }
        });
      } catch (tgError: any) {
        console.error("Telegram error:", tgError?.response?.data || tgError.message);
        return res.status(500).json({ 
          error: 'Telegram send failed. Database saved it!', 
          details: tgError?.response?.data || tgError.message 
        });
      }

      res.json({ success: true, message: 'File sent successfully!' });
    } catch (error: any) {
      console.error("Error processing file", error?.response?.data || error);
      res.status(500).json({ error: 'Internal server error while processing the file.' });
    }
  });

  apiRouter.get('/files', (req, res) => {
    res.json(getFilesDb().reverse()); // Newest first
  });

  apiRouter.delete('/files/:id', (req, res) => {
    try {
      const db = getFilesDb();
      const fileIndex = db.findIndex((f: any) => f.id === req.params.id);
      
      if (fileIndex !== -1) {
        const fileMeta = db[fileIndex];
        const filePath = path.join(UPLOADS_DIR, fileMeta.filename);
        
        // Remove from db
        db.splice(fileIndex, 1);
        fs.writeFileSync(getDbFilePath(), JSON.stringify(db));
        
        // Remove from storage
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (error) {
      console.error("Delete error:", error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  apiRouter.get('/files/:filename', (req, res) => {
    const filePath = path.join(UPLOADS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).send("File not found");
    }
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
