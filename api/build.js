
import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false,
  },
};

const API_URL = "https://rfweb2apk.rfdevy.com/api/apk/build-api";

const FILE_LIMITS = {
  html: 10 * 1024 * 1024,
  zip: 40 * 1024 * 1024,
  icon: 5 * 1024 * 1024,
  splash: 10 * 1024 * 1024,
  splashHtml: 5 * 1024 * 1024,
  splashVideo: 25 * 1024 * 1024,
};

const ALLOWED_FIELDS = new Set([
  "appName",
  "packageName",
  "url",
  "versionName",
  "versionCode",
  "orientation",
  "splashType",
]);

const ALLOWED_FILES = new Set(Object.keys(FILE_LIMITS));

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;

    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          fields: 20,
          files: 6,
          parts: 26,
          fieldSize: 16 * 1024,
        },
      });
    } catch {
      reject(new Error("Request harus menggunakan multipart/form-data."));
      return;
    }

    const fields = {};
    const files = {};
    let rejected = false;

    const fail = (message) => {
      if (rejected) return;
      rejected = true;
      reject(new Error(message));
    };

    parser.on("field", (name, value) => {
      if (ALLOWED_FIELDS.has(name)) {
        fields[name] = value;
      }
    });

    parser.on("file", (name, stream, info) => {
      if (!ALLOWED_FILES.has(name)) {
        stream.resume();
        fail(`Field file tidak dikenal: ${name}`);
        return;
      }

      const chunks = [];
      let size = 0;
      const maxSize = FILE_LIMITS[name];

      stream.on("limit", () => {
        fail(`File ${name} melebihi batas ukuran.`);
      });

      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size <= maxSize) chunks.push(chunk);
      });

      stream.on("end", () => {
        if (rejected || size === 0) return;

        files[name] = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || `${name}.bin`,
          mimeType: info.mimeType || "application/octet-stream",
          size,
        };
      });
    });

    parser.on("filesLimit", () => fail("Terlalu banyak file."));
    parser.on("fieldsLimit", () => fail("Terlalu banyak field."));
    parser.on("partsLimit", () => fail("Terlalu banyak bagian request."));
    parser.on("error", () => fail("Gagal membaca data upload."));

    parser.on("close", () => {
      if (!rejected) resolve({ fields, files });
    });

    req.on("error", () => fail("Koneksi upload terputus."));
    req.pipe(parser);
  });
}

function sendJson(res, status, data) {
  res.status(status).json(data);
}

function validateRequest(fields, files) {
  if (!fields.appName?.trim()) {
    return "Nama aplikasi wajib diisi.";
  }

  if (fields.appName.trim().length > 50) {
    return "Nama aplikasi maksimal 50 karakter.";
  }

  if (!fields.packageName?.trim()) {
    return "Package name wajib diisi.";
  }

  const packagePattern =
    /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

  if (!packagePattern.test(fields.packageName.trim())) {
    return "Format package name tidak valid.";
  }

  if (!fields.url && !files.html) {
    return "Masukkan URL website atau upload file HTML.";
  }

  if (fields.url && files.html) {
    return "Pilih satu sumber: URL atau file HTML.";
  }

  if (fields.url) {
    try {
      const url = new URL(fields.url);
      if (!["https:", "http:"].includes(url.protocol)) {
        return "URL website tidak valid.";
      }
    } catch {
      return "Format URL website tidak valid.";
    }
  }

  if (files.html && !/\.html?$/i.test(files.html.filename)) {
    return "File website harus berupa HTML.";
  }

  if (files.zip && !/\.zip$/i.test(files.zip.filename)) {
    return "File tambahan harus berupa ZIP.";
  }

  if (fields.versionCode !== undefined) {
    const code = Number(fields.versionCode);
    if (!Number.isInteger(code) || code < 1 || code > 2147483647) {
      return "Version code tidak valid.";
    }
  }

  if (
    fields.orientation &&
    !["portrait", "landscape", "auto"].includes(fields.orientation)
  ) {
    return "Pilihan orientasi tidak valid.";
  }

  if (
    fields.splashType &&
    !["image", "html", "video", "default"].includes(fields.splashType)
  ) {
    return "Tipe splash screen tidak valid.";
  }

  if (files.icon && !/\.png$/i.test(files.icon.filename)) {
    return "Ikon aplikasi harus berupa PNG.";
  }

  if (
    files.splash &&
    !/\.(png|jpe?g)$/i.test(files.splash.filename)
  ) {
    return "Gambar splash harus PNG atau JPG.";
  }

  if (files.splashHtml && !/\.html?$/i.test(files.splashHtml.filename)) {
    return "Splash screen HTML tidak valid.";
  }

  if (files.splashVideo && !/\.mp4$/i.test(files.splashVideo.filename)) {
    return "Video splash harus MP4.";
  }

  if (files.splash && fields.splashType && fields.splashType !== "image") {
    return "Tipe splash tidak cocok dengan file gambar.";
  }

  if (files.splashHtml && fields.splashType && fields.splashType !== "html") {
    return "Tipe splash tidak cocok dengan file HTML.";
  }

  if (files.splashVideo && fields.splashType && fields.splashType !== "video") {
    return "Tipe splash tidak cocok dengan file video.";
  }

  return null;
}

function safeUpstreamError(payload, status) {
  const message =
    typeof payload?.error === "string"
      ? payload.error
      : `API builder gagal (HTTP ${status}).`;

  return message.slice(0, 500);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, {
      success: false,
      error: "Method tidak diizinkan.",
    });
  }

  const apiKey = process.env.APIKEYYRF;

  if (!apiKey) {
    console.error("Environment variable APIKEYYRF belum dikonfigurasi.");
    return sendJson(res, 500, {
      success: false,
      error: "API builder belum dikonfigurasi di server.",
    });
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return sendJson(res, 400, {
      success: false,
      error: "Content-Type harus multipart/form-data.",
    });
  }

  let fields;
  let files;

  try {
    ({ fields, files } = await readMultipart(req));
  } catch (error) {
    return sendJson(res, 400, {
      success: false,
      error: error.message || "Upload tidak valid.",
    });
  }

  const validationError = validateRequest(fields, files);
  if (validationError) {
    return sendJson(res, 400, {
      success: false,
      error: validationError,
    });
  }

  try {
    const upstreamForm = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      upstreamForm.append(name, value);
    }

    for (const [name, file] of Object.entries(files)) {
      const blob = new Blob([file.buffer], {
        type: file.mimeType,
      });

      upstreamForm.append(name, blob, file.filename);
    }

    const upstreamResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: upstreamForm,
      signal: AbortSignal.timeout(240000),
    });

    const payload = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok || payload?.success !== true) {
      return sendJson(
        res,
        upstreamResponse.status >= 400 && upstreamResponse.status < 600
          ? upstreamResponse.status
          : 502,
        {
          success: false,
          error: safeUpstreamError(payload, upstreamResponse.status),
          ...(payload?.limitReached === true
            ? { limitReached: true }
            : {}),
        }
      );
    }

    if (typeof payload.downloadUrl !== "string" || !payload.downloadUrl) {
      return sendJson(res, 502, {
        success: false,
        error: "API builder tidak mengembalikan URL download APK.",
      });
    }

    return sendJson(res, 200, {
      success: true,
      fileName: payload.fileName || "app.apk",
      size: payload.size ?? null,
      downloadUrl: payload.downloadUrl,
      buildId: payload.buildId || null,
    });
  } catch (error) {
    console.error("Build API request failed:", error.message);

    return sendJson(res, 502, {
      success: false,
      error:
        error.name === "TimeoutError"
          ? "Proses build melewati batas waktu tunggu. Coba lagi nanti."
          : "Gagal menghubungi API builder. Coba lagi nanti.",
    });
  }
}
