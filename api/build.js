
import Busboy from "busboy";

export const config = {
  api: { bodyParser: false },
};

const API_URL =
  "https://rfweb2apk.rfdevy.com/api/apk/build-api";

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

function json(res, status, body) {
  return res.status(status).json(body);
}

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;
    let settled = false;
    const fields = {};
    const files = {};

    function fail(message) {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }

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
      fail("Request multipart/form-data tidak valid.");
      return;
    }

    parser.on("field", (name, value) => {
      if (ALLOWED_FIELDS.has(name)) fields[name] = value;
    });

    parser.on("file", (name, stream, info) => {
      if (!ALLOWED_FILES.has(name)) {
        stream.resume();
        fail(`Field upload tidak dikenal: ${name}`);
        return;
      }

      const chunks = [];
      let size = 0;
      let tooLarge = false;

      stream.on("data", (chunk) => {
        size += chunk.length;

        if (size > FILE_LIMITS[name]) {
          tooLarge = true;
        } else {
          chunks.push(chunk);
        }
      });

      stream.on("limit", () => {
        tooLarge = true;
        fail(`File ${name} terlalu besar.`);
      });

      stream.on("end", () => {
        if (settled || tooLarge || size === 0) return;

        files[name] = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || `${name}.bin`,
          mimeType: info.mimeType || "application/octet-stream",
        };
      });
    });

    parser.on("fieldsLimit", () => fail("Terlalu banyak field."));
    parser.on("filesLimit", () => fail("Terlalu banyak file."));
    parser.on("partsLimit", () => fail("Terlalu banyak bagian request."));
    parser.on("error", () => fail("Gagal membaca upload."));

    parser.on("close", () => {
      if (settled) return;
      settled = true;
      resolve({ fields, files });
    });

    req.on("error", () => fail("Koneksi upload terputus."));
    req.pipe(parser);
  });
}

function validate(fields, files) {
  if (!fields.appName?.trim()) {
    return "Nama aplikasi wajib diisi.";
  }

  if (fields.appName.trim().length > 50) {
    return "Nama aplikasi maksimal 50 karakter.";
  }

  const packagePattern =
    /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

  if (!packagePattern.test(fields.packageName || "")) {
    return "Package name tidak valid.";
  }

  if (Boolean(fields.url) === Boolean(files.html)) {
    return "Pilih tepat satu sumber: URL atau file HTML.";
  }

  if (fields.url) {
    try {
      const url = new URL(fields.url);
      if (!["https:", "http:"].includes(url.protocol)) {
        return "URL harus menggunakan HTTP atau HTTPS.";
      }
    } catch {
      return "URL website tidak valid.";
    }
  }

  if (files.html && !/\.html?$/i.test(files.html.filename)) {
    return "File website harus HTML.";
  }

  if (files.zip && !/\.zip$/i.test(files.zip.filename)) {
    return "File tambahan harus ZIP.";
  }

  if (files.icon && !/\.png$/i.test(files.icon.filename)) {
    return "Ikon harus PNG.";
  }

  if (
    files.splash &&
    !/\.(png|jpe?g)$/i.test(files.splash.filename)
  ) {
    return "Splash image harus PNG atau JPG.";
  }

  if (
    files.splashHtml &&
    !/\.html?$/i.test(files.splashHtml.filename)
  ) {
    return "Splash HTML tidak valid.";
  }

  if (
    files.splashVideo &&
    !/\.mp4$/i.test(files.splashVideo.filename)
  ) {
    return "Splash video harus MP4.";
  }

  if (
    fields.orientation &&
    !["portrait", "landscape", "auto"].includes(fields.orientation)
  ) {
    return "Orientasi tidak valid.";
  }

  if (
    fields.splashType &&
    !["default", "image", "html", "video"].includes(fields.splashType)
  ) {
    return "Tipe splash screen tidak valid.";
  }

  if (
    fields.versionCode !== undefined &&
    (!Number.isInteger(Number(fields.versionCode)) ||
      Number(fields.versionCode) < 1 ||
      Number(fields.versionCode) > 2147483647)
  ) {
    return "Version code tidak valid.";
  }

  return null;
}

function getUpstreamMessage(payload, raw, status) {
  if (payload && typeof payload.error === "string") {
    return payload.error.slice(0, 300);
  }

  if (payload && typeof payload.message === "string") {
    return payload.message.slice(0, 300);
  }

  if (raw && !raw.trim().startsWith("<")) {
    return raw.trim().slice(0, 250);
  }

  return `API builder membalas HTTP ${status} tanpa pesan error yang terbaca.`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, {
      success: false,
      error: "Gunakan metode POST.",
    });
  }

  const apiKey = process.env.APIKEYYRF;

  if (!apiKey) {
    console.error("[Web2APK] APIKEYYRF belum dikonfigurasi.");

    return json(res, 500, {
      success: false,
      error: "APIKEYYRF belum diatur di Vercel Environment Variables.",
    });
  }

  if (
    !(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("multipart/form-data")
  ) {
    return json(res, 400, {
      success: false,
      error: "Request harus multipart/form-data.",
    });
  }

  let fields;
  let files;

  try {
    ({ fields, files } = await readMultipart(req));
  } catch (error) {
    return json(res, 400, {
      success: false,
      error: error.message || "Gagal membaca upload.",
    });
  }

  const validationError = validate(fields, files);

  if (validationError) {
    return json(res, 400, {
      success: false,
      error: validationError,
    });
  }

  try {
    const upstreamForm = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      upstreamForm.append(key, value);
    }

    for (const [key, file] of Object.entries(files)) {
      upstreamForm.append(
        key,
        new Blob([file.buffer], { type: file.mimeType }),
        file.filename
      );
    }

    console.log("[Web2APK] Menghubungi API builder.");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: upstreamForm,
      signal: AbortSignal.timeout(240000),
    });

    const raw = await response.text();

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Respons bukan JSON; tangani di bawah.
    }

    console.log("[Web2APK] Status API builder:", response.status);

    if (!response.ok) {
      console.error(
        "[Web2APK] API builder menolak request:",
        response.status,
        getUpstreamMessage(payload, raw, response.status)
      );

      return json(res, 502, {
        success: false,
        error: getUpstreamMessage(payload, raw, response.status),
        upstreamStatus: response.status,
        ...(payload?.limitReached === true
          ? { limitReached: true }
          : {}),
      });
    }

    if (!payload || typeof payload !== "object") {
      console.error("[Web2APK] Respons API bukan JSON.");

      return json(res, 502, {
        success: false,
        error: "API builder mengirim respons yang bukan JSON.",
      });
    }

    if (payload.success !== true) {
      return json(res, 502, {
        success: false,
        error: getUpstreamMessage(payload, raw, response.status),
        ...(payload.limitReached === true
          ? { limitReached: true }
          : {}),
      });
    }

    if (
      typeof payload.downloadUrl !== "string" ||
      !payload.downloadUrl.trim()
    ) {
      return json(res, 502, {
        success: false,
        error: "Build merespons sukses, tetapi URL download tidak tersedia.",
      });
    }

    return json(res, 200, {
      success: true,
      fileName: payload.fileName || "app.apk",
      size: payload.size ?? null,
      downloadUrl: payload.downloadUrl,
      buildId: payload.buildId || null,
    });
  } catch (error) {
    // Detail lengkap hanya masuk log server, bukan membocorkan rahasia ke browser.
    console.error("[Web2APK] Koneksi API gagal:", {
      name: error.name,
      message: error.message,
      cause: error.cause?.message,
      code: error.cause?.code,
    });

    let message =
      "Koneksi ke API builder gagal. Periksa Vercel Runtime Logs.";

    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError"
    ) {
      message = "API builder timeout. Coba lagi nanti.";
    } else if (
      error.cause?.code === "ENOTFOUND" ||
      error.cause?.code === "EAI_AGAIN"
    ) {
      message = "Domain API builder tidak dapat ditemukan (DNS).";
    } else if (
      error.cause?.code === "ECONNREFUSED"
    ) {
      message = "Koneksi ditolak oleh server API builder.";
    } else if (
      error.cause?.code === "ECONNRESET"
    ) {
      message = "Koneksi API builder terputus sebelum selesai.";
    } else if (
      error.cause?.code === "CERT_HAS_EXPIRED" ||
      error.cause?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    ) {
      message = "Sertifikat HTTPS API builder bermasalah.";
    }

    return json(res, 502, {
      success: false,
      error: message,
    });
  }
}
