
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  let toastTimer = null;

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function toast(message) {
    const element = $("#toast");
    if (!element) return;

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      element.classList.remove("show");
    }, 3200);
  }

  function setSource(type) {
    const isUrl = type === "url";

    $("#sourceType").value = type;
    $("#urlField").classList.toggle("hidden", !isUrl);
    $("#htmlField").classList.toggle("hidden", isUrl);

    $("#websiteUrl").required = isUrl;
    $("#htmlFile").required = !isUrl;

    $$("[data-source]").forEach((button) => {
      button.classList.toggle("active", button.dataset.source === type);
    });
  }

  function setOrientation(value) {
    $("#orientation").value = value;

    $$("[data-orientation]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.orientation === value
      );
    });
  }

  function setSplashFields() {
    const selected = $('input[name="splashType"]:checked')?.value || "default";

    $("#splashImageField").classList.toggle("hidden", selected !== "image");
    $("#splashHtmlField").classList.toggle("hidden", selected !== "html");
    $("#splashVideoField").classList.toggle("hidden", selected !== "video");

    $("#splashImage").required = selected === "image";
    $("#splashHtml").required = selected === "html";
    $("#splashVideo").required = selected === "video";

    $$(".choice").forEach((choice) => {
      const radio = choice.querySelector('input[type="radio"]');
      choice.classList.toggle("selected", Boolean(radio?.checked));
    });
  }

  function bindFileLabel(inputSelector, labelSelector, emptyText) {
    const input = $(inputSelector);
    const label = $(labelSelector);

    if (!input || !label) return;

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      label.textContent = file ? file.name : emptyText;
    });
  }

  function setProgress(percent, title, message, status) {
    const safePercent = Math.max(0, Math.min(100, percent));

    $("#progressTitle").textContent = title;
    $("#progressMessage").textContent = message;
    $("#progressBar").style.width = `${safePercent}%`;
    $("#progressPercent").textContent = `${safePercent}%`;
    $("#progressStatus").textContent = status;
  }

  function showResult(title, message, downloadUrl) {
    const card = $("#resultCard");
    const link = $("#downloadLink");

    $("#resultTitle").textContent = title;
    $("#resultMessage").textContent = message;
    card.classList.remove("hidden");

    if (downloadUrl) {
      link.href = downloadUrl;
      link.classList.remove("hidden");
    } else {
      link.removeAttribute("href");
      link.classList.add("hidden");
    }

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    refreshIcons();
  }

  function getDownloadUrl(data) {
    if (!data || typeof data !== "object") return null;

    const candidates = [
      data.downloadUrl,
      data.download_url,
      data.apkUrl,
      data.apk_url,
      data.url
    ];

    return candidates.find(
      (value) => typeof value === "string" && value.trim()
    ) || null;
  }

  function getServerMessage(data, fallback) {
    if (typeof data === "string" && data.trim()) return data;

    if (data && typeof data === "object") {
      const candidates = [data.message, data.error, data.detail];
      const message = candidates.find(
        (value) => typeof value === "string" && value.trim()
      );

      if (message) return message;
    }

    return fallback;
  }

  // Sumber website atau file HTML.
  $$("[data-source]").forEach((button) => {
    button.addEventListener("click", () => {
      setSource(button.dataset.source);
    });
  });

  // Pilihan orientasi.
  $$("[data-orientation]").forEach((button) => {
    button.addEventListener("click", () => {
      setOrientation(button.dataset.orientation);
    });
  });

  // Pilihan splash screen.
  $$('input[name="splashType"]').forEach((radio) => {
    radio.addEventListener("change", setSplashFields);
  });

  bindFileLabel("#htmlFile", "#htmlFileName", "Belum ada file dipilih");
  bindFileLabel("#zipFile", "#zipFileName", "Asset website (jika diperlukan)");
  bindFileLabel("#iconFile", "#iconFileName", "PNG atau JPG");

  // Tools, Akses, dan Akun: tampilkan maintenance, tanpa halaman baru.
  $$(".soon-button").forEach((button) => {
    button.addEventListener("click", () => {
      toast(`Fitur ${button.dataset.soon} sedang dalam maintenance.`);
    });
  });

  // Modal bantuan.
  const helpModal = $("#helpModal");

  $("#helpBtn").addEventListener("click", () => {
    helpModal.classList.remove("hidden");
  });

  function closeHelp() {
    helpModal.classList.add("hidden");
  }

  $("#closeHelp").addEventListener("click", closeHelp);
  $("#closeHelpBottom").addEventListener("click", closeHelp);

  helpModal.addEventListener("click", (event) => {
    if (event.target === helpModal) closeHelp();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelp();
  });

  // Build APK.
  $("#buildForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $("#buildButton");
    const progress = $("#progressCard");
    const result = $("#resultCard");
    const log = $("#buildLog");

    if (!form.reportValidity()) return;

    const sourceType = $("#sourceType").value;
    const packageName = $("#packageName").value.trim();

    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) {
      toast("Package name tidak valid. Gunakan format seperti com.nama.app.");
      $("#packageName").focus();
      return;
    }

    if (sourceType === "url") {
      try {
        const parsedUrl = new URL($("#websiteUrl").value.trim());

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("URL harus memakai HTTP atau HTTPS.");
        }
      } catch {
        toast("Masukkan URL website yang valid.");
        $("#websiteUrl").focus();
        return;
      }
    }

    const versionCode = Number($("#versionCode").value);

    if (!Number.isInteger(versionCode) || versionCode < 1) {
      toast("Version code harus berupa bilangan bulat minimal 1.");
      $("#versionCode").focus();
      return;
    }

    button.disabled = true;
    progress.classList.remove("hidden");
    result.classList.add("hidden");
    $("#downloadLink").classList.add("hidden");
    log.classList.add("hidden");
    log.textContent = "";

    setProgress(10, "Menyiapkan build...", "Mengirim konfigurasi aplikasi.", "Mengirim");

    try {
      /*
       * Request tetap menggunakan /api/build.
       * FormData mengirim field dan file dari form.
       * Jangan set Content-Type secara manual karena browser
       * perlu membuat multipart boundary.
       */
      const formData = new FormData(form);

      setProgress(25, "Memproses aplikasi...", "Menunggu respons server.", "Diproses");

      const response = await fetch("/api/build", {
        method: "POST",
        body: formData
      });

      const contentType = response.headers.get("content-type") || "";
      let data;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new Error(
          getServerMessage(data, `Build gagal (HTTP ${response.status}).`)
        );
      }

      setProgress(85, "Memeriksa hasil...", "Respons server diterima.", "Hampir selesai");

      const downloadUrl = getDownloadUrl(data);
      const message = getServerMessage(
        data,
        downloadUrl
          ? "APK berhasil dibuat dan siap diunduh."
          : "Server merespons sukses, tetapi tautan APK tidak ditemukan."
      );

      setProgress(100, "Proses selesai", "Permintaan build telah selesai.", "Selesai");

      if (downloadUrl) {
        showResult("Build berhasil!", message, downloadUrl);
        toast("APK berhasil dibuat.");
      } else {
        showResult(
          "Respons server diterima",
          message,
          null
        );
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Terjadi kesalahan yang tidak diketahui.";

      setProgress(100, "Build gagal", "Periksa pesan error di bawah.", "Gagal");

      log.textContent = message;
      log.classList.remove("hidden");

      showResult("Build gagal", message, null);
      toast("Build gagal. Periksa pesan error.");
    } finally {
      button.disabled = false;
      refreshIcons();
    }
  });

  setSource("url");
  setOrientation("portrait");
  setSplashFields();
  refreshIcons();
})();
