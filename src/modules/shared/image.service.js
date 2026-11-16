const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

/**
 * Serviço compartilhado de imagens.
 * Único lugar do sistema que sabe VALIDAR, OTIMIZAR e ARMAZENAR imagens.
 * Quem chama (auth, dishes, ...) só informa o "preset" desejado e recebe o caminho público.
 * Para trocar o armazenamento (ex.: S3) ou o processamento (ex.: função serverless),
 * só este arquivo muda.
 */

// Pasta física onde as imagens ficam (pode ser trocada por variável de ambiente)
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, "../../../uploads"));
// Prefixo da URL pública (servido por express.static no app.js)
const PUBLIC_PREFIX = "/uploads";

const PRESETS = {
  avatar: { folder: "users", width: 400, height: 400, fit: "cover", quality: 80 },
  dish: { folder: "dishes", width: 1024, height: 1024, fit: "inside", quality: 80 }
};

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Valida, otimiza (redimensiona + converte para WebP) e grava a imagem.
 * @param {Buffer} buffer  conteúdo enviado
 * @param {"avatar"|"dish"} presetName
 * @param {string} prefix  prefixo do nome do arquivo (ex.: "user-7")
 * @returns {Promise<string>} caminho público, ex.: /uploads/users/user-7-<uuid>.webp
 */
async function optimizeAndSave(buffer, presetName, prefix) {
  const preset = PRESETS[presetName];
  if (!preset) throw httpError(500, `Preset de imagem desconhecido: ${presetName}`);

  // 1) Não confia no Content-Type: lê o conteúdo real do arquivo
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw httpError(415, "O arquivo enviado não é uma imagem válida");
  }
  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw httpError(415, "Formato não suportado. Use JPEG, PNG ou WebP");
  }

  // 2) O nome do arquivo é gerado aqui — nunca vem do cliente (evita path traversal)
  const dir = path.join(UPLOADS_ROOT, preset.folder);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${prefix}-${crypto.randomUUID()}.webp`;
  const absolutePath = path.join(dir, filename);

  // 3) Otimiza e grava; se falhar, não deixa arquivo parcial
  try {
    await sharp(buffer)
      .rotate() // respeita a orientação EXIF (fotos de celular)
      .resize({ width: preset.width, height: preset.height, fit: preset.fit, withoutEnlargement: true })
      .webp({ quality: preset.quality })
      .toFile(absolutePath);
  } catch {
    await fs.rm(absolutePath, { force: true });
    throw httpError(422, "Não foi possível processar a imagem");
  }

  return `${PUBLIC_PREFIX}/${preset.folder}/${filename}`;
}

/** Remove uma imagem antiga a partir do caminho público. Nunca lança erro. */
async function removeImage(publicPath) {
  if (!publicPath || !publicPath.startsWith(`${PUBLIC_PREFIX}/`)) return;
  const absolutePath = path.resolve(UPLOADS_ROOT, publicPath.slice(PUBLIC_PREFIX.length + 1));
  if (!absolutePath.startsWith(UPLOADS_ROOT + path.sep)) return; // proteção contra path traversal
  await fs.rm(absolutePath, { force: true }).catch(() => {});
}

module.exports = { optimizeAndSave, removeImage, UPLOADS_ROOT, PUBLIC_PREFIX, PRESETS };
