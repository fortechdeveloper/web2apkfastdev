
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  let toastTimer = null;
  let building = false;

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
      button.classList.toggle(
        "active",
        button.dataset.source === type
      );
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
    const selected =
      $('input[name="splashType"]:checked')?.value || "default";

    $("#splashImageField").classList.toggle(
      "hidden",
      selected !== "image"
    );

    $("#splashHtmlField").classList.toggle(
      "hidden",
      selected !== "html"
    );

    $("#splashVideoField").classList.toggle(
      "hidden",
      selected !== "video"
    );

    $("#splashImage").required = false;
    $("#splashHtml").required = selected === "html";
    $("#splashVideo").required = false;

    $$(".choice").forEach((choice) => {
      const radio = choice.querySelector('input[type="radio"]');

      choice.classList.toggle(
        "selected",
        Boolean(radio?.checked)
      );
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

    card.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    refreshIcons();
  }

  function getDownloadUrl(data) {
    if (!data || typeof data !== "object") return null;

    const candidates = [
      data.downloadUrl,
      data.download_url,
      data.apkUrl,
      data.apk_url,
      data.url,
      data.download?.url,
      data.data?.downloadUrl,
      data.data?.download_url,
      data.data?.apkUrl,
      data.data?.apk_url
    ];

    return candidates.find(
      (value) =>
        typeof value === "string" &&
        /^https?:\/\//i.test(value.trim())
    )?.trim() || null;
  }

  function getServerMessage(data, fallback) {
    if (typeof data === "string" && data.trim()) {
      return data.trim();
    }

    if (data && typeof data === "object") {
      const candidates = [
        data.error,
        data.message,
        data.detail,
        data.data?.error,
        data.data?.message
      ];

      const message = candidates.find(
        (value) =>
          typeof value === "string" && value.trim()
      );

      if (message) return message.trim();
    }

    return fallback;
  }

  function getBuildFormData(form) {
    // Ambil field standar dari form.
    const formData = new FormData(form);

    const sourceType = $("#sourceType").value;
    const websiteUrl = $("#websiteUrl").value.trim();
    const htmlInput = $("#htmlFile");
    const htmlFile = htmlInput.files?.[0];

    /*
     * Hapus kedua sumber dahulu.
     * Ini mencegah URL lama ikut terkirim saat pengguna
     * berpindah dari mode Website ke mode File HTML.
     */
    formData.delete("websiteUrl");
    formData.delete("url");
    formData.delete("htmlFile");
    formData.delete("html");
    formData.delete("sourceType");

    if (sourceType === "url") {
      formData.append("url", websiteUrl);
    } else if (sourceType === "file") {
      if (!htmlFile) {
        throw new Error("Pilih file HTML terlebih dahulu.");
      }

      // Nama field disamakan dengan format API Builder.
      formData.append("html", htmlFile, htmlFile.name);
    } else {
      throw new Error("Pilih sumber aplikasi yang valid.");
    }

    /*
     * Hanya kirim konfigurasi splash yang dipilih.
     * File splash dari pilihan sebelumnya tidak ikut terkirim.
     */
    const splashType =
      $('input[name="splashType"]:checked')?.value || "default";

    formData.delete("splashImage");
    formData.delete("splashVideo");

    if (splashType !== "html") {
      formData.delete("splashHtml");
    }

    if (splashType === "image") {
      const file = $("#splashImage").files?.[0];

      if (!file) {
        throw new Error("Pilih gambar untuk splash screen.");
      }

      formData.append("splashImage", file, file.name);
    }

    if (splashType === "video") {
      const file = $("#splashVideo").files?.[0];

      if (!file) {
        throw new Error("Pilih video untuk splash screen.");
      }

      formData.append("splashVideo", file, file.name);
    }

    if (splashType === "html") {
      const html = $("#splashHtml").value.trim();

      if (!html) {
        throw new Error("Isi kode HTML untuk splash screen.");
      }

      formData.set("splashHtml", html);
    }

    return formData;
  }

  // Pilihan sumber aplikasi.
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

  bindFileLabel(
    "#htmlFile",
    "#htmlFileName",
    "Belum ada file dipilih"
  );

  bindFileLabel(
    "#zipFile",
    "#zipFileName",
    "Asset website (jika diperlukan)"
  );

  bindFileLabel(
    "#iconFile",
    "#iconFileName",
    "PNG atau JPG"
  );

  // Tombol fitur maintenance yang memang menggunakan .soon-button.
  $$(".soon-button").forEach((button) => {
    button.addEventListener("click", () => {
      toast(
        `Fitur ${button.dataset.soon || "ini"} sedang dalam maintenance.`
      );
    });
  });

  // Modal bantuan.
  const helpModal = $("#helpModal");

  $("#helpBtn")?.addEventListener("click", () => {
    helpModal?.classList.remove("hidden");
  });

  function closeHelp() {
    helpModal?.classList.add("hidden");
  }

  $("#closeHelp")?.addEventListener("click", closeHelp);
  $("#closeHelpBottom")?.addEventListener("click", closeHelp);

  helpModal?.addEventListener("click", (event) => {
    if (event.target === helpModal) closeHelp();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelp();
  });

  // Build APK.
  $("#buildForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (building) return;

    const form = event.currentTarget;
    const button = $("#buildButton");
    const progress = $("#progressCard");
    const result = $("#resultCard");
    const log = $("#buildLog");

    if (!form.reportValidity()) return;

    const sourceType = $("#sourceType").value;
    const packageName = $("#packageName").value.trim();
    const appName = $("#appName").value.trim();
    const websiteUrl = $("#websiteUrl").value.trim();
    const htmlFile = $("#htmlFile").files?.[0];

    if (!appName) {
      toast("Nama aplikasi wajib diisi.");
      $("#appName").focus();
      return;
    }

    if (
      !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(
        packageName
      )
    ) {
      toast(
        "Package name tidak valid. Contoh: com.nama.aplikasi"
      );

      $("#packageName").focus();
      return;
    }

    if (sourceType === "url") {
      try {
        const parsedUrl = new URL(websiteUrl);

        if (
          !["http:", "https:"].includes(parsedUrl.protocol) ||
          !parsedUrl.hostname.includes(".")
        ) {
          throw new Error("URL tidak valid.");
        }
      } catch {
        toast(
          "Masukkan URL website lengkap, misalnya https://example.com."
        );

        $("#websiteUrl").focus();
        return;
      }
    } else if (sourceType === "file") {
      if (!htmlFile) {
        toast("Pilih file HTML terlebih dahulu.");
        $("#htmlFile").click();
        return;
      }

      if (!/\.(html?|HTML?)$/.test(htmlFile.name)) {
        toast("File harus berekstensi .html atau .htm.");
        return;
      }
    } else {
      toast("Pilih sumber aplikasi terlebih dahulu.");
      return;
    }

    const versionCode = Number($("#versionCode").value);

    if (!Number.isInteger(versionCode) || versionCode < 1) {
      toast("Version code minimal 1 dan harus bilangan bulat.");
      $("#versionCode").focus();
      return;
    }

    const zipFile = $("#zipFile").files?.[0];

    if (zipFile && !/\.zip$/i.test(zipFile.name)) {
      toast("File tambahan harus berupa ZIP.");
      return;
    }

    const iconFile = $("#iconFile").files?.[0];

    if (
      iconFile &&
      !/\.(png|jpe?g|webp)$/i.test(iconFile.name)
    ) {
      toast("Ikon harus berformat PNG, JPG, atau WebP.");
      return;
    }

    let formData;

    try {
      formData = getBuildFormData(form);
    } catch (error) {
      toast(error.message || "Konfigurasi aplikasi belum lengkap.");
      return;
    }

    building = true;
    button.disabled = true;
    progress.classList.remove("hidden");
    result.classList.add("hidden");
    $("#downloadLink").classList.add("hidden");
    log.classList.add("hidden");
    log.textContent = "";

    setProgress(
      10,
      "Menyiapkan build...",
      "Memvalidasi konfigurasi aplikasi.",
      "Menyiapkan"
    );

    try {
      setProgress(
        25,
        "Mengirim konfigurasi...",
        "Menghubungi server Build APK.",
        "Mengirim"
      );

      const response = await fetch("/api/build", {
        method: "POST",
        body: formData
      });

      const contentType =
        response.headers.get("content-type") || "";

      let data;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new Error(
          getServerMessage(
            data,
            `Build gagal (HTTP ${response.status}).`
          )
        );
      }

      // Beberapa API mengembalikan HTTP 200 walaupun build gagal.
      if (
        data &&
        typeof data === "object" &&
        (data.success === false || data.error)
      ) {
        throw new Error(
          getServerMessage(data, "Server melaporkan build gagal.")
        );
      }

      setProgress(
        80,
        "Memeriksa hasil build...",
        "Respons server berhasil diterima.",
        "Memeriksa"
      );

      const downloadUrl = getDownloadUrl(data);
      const message = getServerMessage(
        data,
        downloadUrl
          ? "APK berhasil dibuat dan siap diunduh."
          : "Server merespons, tetapi URL unduhan APK tidak ditemukan."
      );

      if (!downloadUrl) {
        throw new Error(message);
      }

      setProgress(
        100,
        "Build selesai!",
        "APK siap diunduh.",
        "Selesai"
      );

      showResult("Build berhasil!", message, downloadUrl);
      toast("APK berhasil dibuat.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan yang tidak diketahui.";

      setProgress(
        100,
        "Build gagal",
        "Periksa pesan error di bawah.",
        "Gagal"
      );

      log.textContent = message;
      log.classList.remove("hidden");

      showResult("Build gagal", message, null);
      toast("Build gagal. Periksa pesan error.");
    } finally {
      building = false;
      button.disabled = false;
      refreshIcons();
    }
  });

  // Inisialisasi tampilan.
  setSource("url");
  setOrientation("portrait");
  setSplashFields();
  refreshIcons();
})();
