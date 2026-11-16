const multer = require("multer");

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// Memória (buffer): o arquivo original não é salvo; só a versão otimizada pelo image.service.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    const error = new Error("Formato não suportado. Use JPEG, PNG ou WebP");
    error.statusCode = 415;
    cb(error);
  }
});

/**
 * Middleware que recebe UM arquivo no campo indicado e traduz os erros do multer
 * para respostas HTTP adequadas (413, 415, 400).
 */
function uploadSingleImage(field = "image") {
  const handler = upload.single(field);

  return (req, res, next) => {
    handler(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: `Arquivo maior que ${MAX_BYTES / 1024 / 1024} MB` });
        }
        return res.status(400).json({ error: `Envie um único arquivo no campo "${field}"` });
      }
      if (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({ error: status === 500 ? "Erro interno no servidor" : error.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: `Nenhum arquivo enviado. Use o campo "${field}"` });
      }
      next();
    });
  };
}

module.exports = { uploadSingleImage, MAX_BYTES, ALLOWED_MIME };
