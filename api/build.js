
import Busboy from "busboy";

export const config = {
  api: {
    bodyParser: false,
  },
};

const API_URL =
  "https://rfweb2apk.rfdevv.com/api/apk/build-api";

const MAX_FILE_SIZE = 4 * 1024 * 1024;

function sendJson(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let busboy;

    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: 10,
          fields: 40,
          fileSize: MAX_FILE_SIZE,
        },
      });
    } catch (error) {
      reject(new Error(`Request multipart tidak valid: ${error.message}`));
      return;
    }

    const fields = {};
    const files = [];
    let settled = false;
    let limitReached = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    busboy.on("field", (name, value, info) => {
      if (info?.nameTruncated || info?.valueTruncated) {
        fail(new Error(`Field "${name}" terlalu panjang.`));
        return;
      }

      fields[name] = value;
    });

    busboy.on("file", (fieldName, stream, info) => {
      const chunks = [];
      let size = 0;
      let fileTooLarge = false;

      stream.on("data", (chunk) => {
        size += chunk.length;

        if (size > MAX_FILE_SIZE) {
          fileTooLarge = true;
          limitReached = true;
          return;
        }

        chunks.push(chunk);
      });

      stream.on("limit", () => {
        fileTooLarge = true;
        limitReached = true;
      });

      stream.on("error", (error) => {
        fail(error);
      });

      stream.on("end", () => {
        if (fileTooLarge || !info.filename) return;

        files.push({
          fieldName,
          filename: info.filename,
          mimeType: info.mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks),
        });
      });
    });

    busboy.on("filesLimit", () => {
      limitReached = true;
    });

    busboy.on("fieldsLimit", () => {
      fail(new Error("Jumlah field form terlalu banyak."));
    });

    busboy.on("error", (error) => {
      fail(error);
    });

    busboy.on("close", () => {
      if (settled) return;

      if (limitReached) {
        fail(
          new Error(
            "Upload melebihi batas. Maksimal 4 MB per file pada konfigurasi ini."
          )
        );
        return;
      }

      settled = true;
      resolve({ fields, files });
    });

    req.on("error", (error) => {
      fail(error);
    });

    req.pipe(busboy);
  });
}

function normalizeDownloadUrl(payload) {
  if (
    payload &&
    typeof payload.downloadUrl === "string"
  ) {
    try {
      const download = new URL(payload.downloadUrl);

      // Dokumentasi menampilkan hostname lama "rfdevy".
      // Gunakan hostname yang benar jika respons API masih memakai yang lama.
      if (download.hostname === "rfweb2apk.rfdevy.com") {
        download.hostname = "rfweb2apk.rfdevv.com";
        payload.downloadUrl = download.toString();
      }
    } catch {
      // Biarkan URL asli jika formatnya tidak valid.
    }
  }

  return payload;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendJson(res, 405, {
      success: false,
      error: "Gunakan metode POST.",
    });
  }

  const apiKey = process.env.APIKEYYRF;

  if (!apiKey) {
    console.error("Environment variable APIKEYYRF belum diatur.");

    return sendJson(res, 500, {
      success: false,
      error:
        "API key server belum dikonfigurasi. Periksa environment variable APIKEYYRF di Vercel.",
    });
  }

  let parsed;

  try {
    parsed = await parseMultipart(req);
  } catch (error) {
    console.error("Multipart parsing error:", error);

    return sendJson(res, 400, {
      success: false,
      error: error.message || "Gagal membaca file upload.",
    });
  }

  const { fields, files } = parsed;

  const appName = String(fields.appName || "").trim();
  const packageName = String(fields.packageName || "").trim();
  const url = String(fields.url || "").trim();

  const htmlFile = files.find((file) => file.fieldName === "html");

  if (!appName || !packageName) {
    return sendJson(res, 400, {
      success: false,
      error: "Nama aplikasi dan package name wajib diisi.",
    });
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) {
    return sendJson(res, 400, {
      success: false,
      error:
        "Package name tidak valid. Contoh: com.fortech.aplikasi",
    });
  }

  if (Boolean(url) === Boolean(htmlFile)) {
    return sendJson(res, 400, {
      success: false,
      error:
        "Isi URL website atau unggah file HTML. Pilih salah satu sumber.",
    });
  }

  if (url) {
    try {
      const parsedUrl = new URL(url);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Protokol URL tidak didukung.");
      }
    } catch {
      return sendJson(res, 400, {
        success: false,
        error: "URL website tidak valid.",
      });
    }
  }

  const form = new FormData();

  // Field wajib
  form.append("appName", appName);
  form.append("packageName", packageName);

  if (url) {
    form.append("url", url);
  }

  // Field opsional
  const allowedFields = [
    "splashType",
    "splashHtml",
    "orientation",
    "versionName",
    "versionCode",
  ];

  for (const name of allowedFields) {
    if (fields[name] !== undefined && fields[name] !== "") {
      form.append(name, fields[name]);
    }
  }

  // Teruskan semua file dengan nama field dan nama file aslinya.
  for (const file of files) {
    const blob = new Blob([file.buffer], {
      type: file.mimeType,
    });

    form.append(file.fieldName, blob, file.filename);
  }

  let upstreamResponse;

  try {
    upstreamResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        // Jangan mengatur Content-Type secara manual.
        // fetch akan membuat multipart boundary secara otomatis.
      },
      body: form,
      signal: AbortSignal.timeout(240000),
    });
  } catch (error) {
    console.error("API Builder connection error:", {
      message: error.message,
      code: error.cause?.code,
      hostname: error.cause?.hostname,
      endpoint: API_URL,
    });

    const dnsCodes = [
      "ENOTFOUND",
      "EAI_AGAIN",
      "ENODATA",
    ];

    if (dnsCodes.includes(error.cause?.code)) {
      return sendJson(res, 502, {
        success: false,
        error:
          "DNS API Builder gagal ditemukan. Periksa domain rfweb2apk.rfdevv.com.",
        code: error.cause.code,
      });
    }

    if (error.name === "TimeoutError" ||
        error.name === "AbortError") {
      return sendJson(res, 504, {
        success: false,
        error:
          "API Builder tidak merespons dalam batas waktu. Coba lagi nanti.",
      });
    }

    return sendJson(res, 502, {
      success: false,
      error:
        "Tidak dapat terhubung ke API Builder. Periksa endpoint dan log Vercel.",
      detail: error.cause?.code || error.message,
    });
  }

  const responseText = await upstreamResponse.text();

  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    console.error("API Builder returned non-JSON:", {
      status: upstreamResponse.status,
      body: responseText.slice(0, 1000),
    });

    return sendJson(res, 502, {
      success: false,
      error: "API Builder mengembalikan respons yang bukan JSON.",
      upstreamStatus: upstreamResponse.status,
    });
  }

  payload = normalizeDownloadUrl(payload);

  if (!upstreamResponse.ok) {
    console.error("API Builder HTTP error:", {
      status: upstreamResponse.status,
      payload,
    });
  }

  return sendJson(
    res,
    upstreamResponse.ok ? 200 : upstreamResponse.status,
    payload
  );
}
