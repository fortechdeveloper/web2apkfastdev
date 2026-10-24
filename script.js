
"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const form = $("#buildForm");
const buildButton = $("#buildButton");
const progressCard = $("#progressCard");
const resultCard = $("#resultCard");
const toast = $("#toast");

let sourceMode = "url";
let toastTimer;

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function setSourceMode(mode) {
  sourceMode = mode;

  $$("[data-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === mode);
  });

  $("#urlField").classList.toggle("hidden", mode !== "url");
  $("#htmlField").classList.toggle("hidden", mode !== "html");

  $("#websiteUrl").required = mode === "url";
  $("#htmlFile").required = mode === "html";

  if (mode === "url") {
    $("#htmlFile").value = "";
    $("#htmlFileName").textContent = "Pilih file HTML";
  } else {
    $("#websiteUrl").value = "";
  }
}

$$("[data-source]").forEach((button) => {
  button.addEventListener("click", () => {
    setSourceMode(button.dataset.source);
  });
});

function bindFileLabel(inputId, labelId, defaultText) {
  const input = $("#" + inputId);
  const label = $("#" + labelId);

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    label.textContent = file ? file.name : defaultText;
  });
}

bindFileLabel("htmlFile", "htmlFileName", "Pilih file HTML");
bindFileLabel("zipFile", "zipFileName", "Tambahkan file ZIP");
bindFileLabel("iconFile", "iconFileName", "Upload ikon aplikasi");

function updateChoiceCards(groupName, cardSelector) {
  $$(`input[name="${groupName}"]`).forEach((input) => {
    input.addEventListener("change", () => {
      $$(cardSelector).forEach((card) => {
        const cardInput = card.querySelector("input");
        card.classList.toggle("selected", Boolean(cardInput?.checked));
      });
    });
  });
}

updateChoiceCards("splashType", ".splash-option");
updateChoiceCards("orientation", ".orientation-option");

function updateSplashFields() {
  const selected = $('input[name="splashType"]:checked')?.value || "default";

  $("#splashImageField").classList.toggle("hidden", selected !== "image");
  $("#splashHtmlField").classList.toggle("hidden", selected !== "html");
  $("#splashVideoField").classList.toggle("hidden", selected !== "video");
}

$$('input[name="splashType"]').forEach((input) => {
  input.addEventListener("change", updateSplashFields);
});

function validateFile(input, extensions, maxBytes, label) {
  const file = input.files?.[0];
  if (!file) return true;

  const extension = file.name.split(".").pop().toLowerCase();

  if (!extensions.includes(extension)) {
    showToast(`${label}: format file tidak didukung.`, true);
    input.value = "";
    input.dispatchEvent(new Event("change"));
    return false;
  }

  if (file.size > maxBytes) {
    showToast(`${label}: ukuran file terlalu besar.`, true);
    input.value = "";
    input.dispatchEvent(new Event("change"));
    return false;
  }

  return true;
}

function validateFiles() {
  // Batas awal di UI. Sesuaikan dengan limit API dan konfigurasi Vercel.
  const MB = 1024 * 1024;

  return (
    validateFile($("#htmlFile"), ["html"], 10 * MB, "HTML") &&
    validateFile($("#zipFile"), ["zip"], 40 * MB, "ZIP") &&
    validateFile($("#iconFile"), ["png"], 5 * MB, "Ikon") &&
    validateFile($("#splashFile"), ["png", "jpg", "jpeg"], 10 * MB, "Splash image") &&
    validateFile($("#splashHtmlFile"), ["html"], 5 * MB, "Splash HTML") &&
    validateFile($("#splashVideoFile"), ["mp4"], 25 * MB, "Splash video")
  );
}

function setLoading(loading) {
  buildButton.disabled = loading;
  progressCard.classList.toggle("hidden", !loading);

  if (loading) {
    resultCard.classList.add("hidden");
    $("#progressTitle").textContent = "Mengirim konfigurasi...";
    $("#progressSubtitle").textContent = "Menyiapkan permintaan build APK.";
    buildButton.querySelector(".button-content span").textContent = "Sedang memproses...";
  } else {
    buildButton.querySelector(".button-content span").textContent = "Build APK sekarang";
  }
}

function buildFormData() {
  const data = new FormData();

  data.append("appName", $("#appName").value.trim());
  data.append("packageName", $("#packageName").value.trim());
  data.append("versionName", $("#versionName").value.trim() || "1.0");
  data.append("versionCode", $("#versionCode").value || "1");
  data.append("orientation", $('input[name="orientation"]:checked').value);
  data.append("splashType", $('input[name="splashType"]:checked').value);

  if (sourceMode === "url") {
    data.append("url", $("#websiteUrl").value.trim());
  } else {
    data.append("html", $("#htmlFile").files[0]);
  }

  const optionalFiles = [
    ["zip", "zipFile"],
    ["icon", "iconFile"],
    ["splash", "splashFile"],
    ["splashHtml", "splashHtmlFile"],
    ["splashVideo", "splashVideoFile"]
  ];

  optionalFiles.forEach(([field, inputId]) => {
    const file = $("#" + inputId).files?.[0];
    if (file) data.append(field, file);
  });

  return data;
}

function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function showBuildResult(payload) {
  const downloadUrl = payload.downloadUrl;
  if (!downloadUrl) {
    throw new Error("Build merespons sukses, tetapi URL download tidak tersedia.");
  }

  // Terima URL absolut HTTPS atau path download lokal dari backend.
  let safeUrl;
  try {
    safeUrl = new URL(downloadUrl, window.location.origin);
  } catch {
    throw new Error("URL download dari server tidak valid.");
  }

  if (
    safeUrl.protocol !== "https:" &&
    safeUrl.origin !== window.location.origin
  ) {
    throw new Error("URL download tidak aman.");
  }

  $("#downloadButton").href = safeUrl.href;
  $("#resultMessage").textContent = "Server melaporkan proses build berhasil.";

  const details = [];
  if (payload.fileName) details.push(`File: ${payload.fileName}`);
  if (payload.size != null) details.push(`Ukuran: ${formatBytes(payload.size)}`);
  if (payload.buildId) details.push(`Build ID: ${payload.buildId}`);

  $("#resultMeta").textContent = details.join(" · ");
  resultCard.classList.remove("hidden");
  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("Build selesai. APK siap diunduh.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;
  if (!validateFiles()) return;

  if (sourceMode === "url") {
    try {
      const url = new URL($("#websiteUrl").value.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error();
      }
    } catch {
      showToast("Masukkan URL website yang valid.", true);
      return;
    }
  }

  if (sourceMode === "html" && !$("#htmlFile").files[0]) {
    showToast("Pilih file HTML terlebih dahulu.", true);
    return;
  }

  const versionCode = Number($("#versionCode").value);
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2147483647) {
    showToast("Version code harus berupa bilangan bulat positif.", true);
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/build", {
      method: "POST",
      body: buildFormData()
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success !== true) {
      const message = payload.error || `Build gagal (HTTP ${response.status}).`;
      throw new Error(message);
    }

    progressCard.classList.add("hidden");
    showBuildResult(payload);
  } catch (error) {
    showToast(error.message || "Tidak dapat menghubungi server build.", true);
  } finally {
    setLoading(false);
  }
});

$$(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;

    if (tab !== "build") {
      showToast(`${tab.charAt(0).toUpperCase() + tab.slice(1)} akan tersedia pada pembaruan berikutnya.`);
      return;
    }

    $$(".nav-item").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

const helpModal = $("#helpModal");

$("#helpButton").addEventListener("click", () => {
  helpModal.classList.remove("hidden");
});

$("#closeHelp").addEventListener("click", () => helpModal.classList.add("hidden"));
$("#gotIt").addEventListener("click", () => helpModal.classList.add("hidden"));

helpModal.addEventListener("click", (event) => {
  if (event.target === helpModal) helpModal.classList.add("hidden");
});

$("#year").textContent = new Date().getFullYear();

refreshIcons();
updateSplashFields();
