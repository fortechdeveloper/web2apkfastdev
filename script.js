(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  let sourceType = "url";
  let orientation = "portrait";
  let toastTimeout;

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.add("hidden"), 3500);
  }

  function setSource(type) {
    sourceType = type;
    $$(".segment[data-source]").forEach((button) => {
      button.classList.toggle("active", button.dataset.source === type);
    });

    $("#urlField").classList.toggle("hidden", type !== "url");
    $("#htmlField").classList.toggle("hidden", type !== "html");
    $("#websiteUrl").required = type === "url";
    $("#htmlFile").required = type === "html";
  }

  $$(".segment[data-source]").forEach((button) => {
    button.addEventListener("click", () => setSource(button.dataset.source));
  });

  $$(".segment[data-orientation]").forEach((button) => {
    button.addEventListener("click", () => {
      orientation = button.dataset.orientation;
      $$(".segment[data-orientation]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    });
  });

  function setSplashFields() {
    const selected = $('input[name="splashType"]:checked')?.value || "default";
    $("#splashImageField").classList.toggle("hidden", selected !== "image");
    $("#splashHtmlField").classList.toggle("hidden", selected !== "html");
    $("#splashVideoField").classList.toggle("hidden", selected !== "video");
  }

  $$('input[name="splashType"]').forEach((input) => {
    input.addEventListener("change", setSplashFields);
  });

  function updateFileLabel(inputId, labelId, defaultTitle) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      label.innerHTML = "";

      const title = document.createElement("b");
      title.textContent = file ? file.name : defaultTitle;
      const sub = document.createElement("small");
      sub.textContent = file
        ? `${(file.size / 1024).toFixed(1)} KB`
        : "Belum ada file dipilih";

      label.append(title, sub);
    });
  }

  updateFileLabel("htmlFile", "htmlFileLabel", "Pilih file HTML");
  updateFileLabel("zipFile", "zipFileLabel", "Upload aset website");
  updateFileLabel("iconFile", "iconFileLabel", "Pilih ikon");

  const helpModal = $("#helpModal");
  $("#helpButton")?.addEventListener("click", () => helpModal.classList.remove("hidden"));
  $("#closeHelp")?.addEventListener("click", () => helpModal.classList.add("hidden"));
  $("#okHelp")?.addEventListener("click", () => helpModal.classList.add("hidden"));
  helpModal?.addEventListener("click", (event) => {
    if (event.target === helpModal) helpModal.classList.add("hidden");
  });

  $$(".soon-button").forEach((button) => {
    button.addEventListener("click", () => toast(`Fitur ${button.dataset.soon} belum tersedia.`));
  });

  function appendFormData(formData, key, inputId) {
    const input = document.getElementById(inputId);
    const file = input?.files?.[0];
    if (file) formData.append(key, file);
  }

  $("#buildForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const appName = $("#appName").value.trim();
    const packageName = $("#packageName").value.trim();
    const websiteUrl = $("#websiteUrl").value.trim();
    const htmlFile = $("#htmlFile").files?.[0];

    if (sourceType === "url" && !websiteUrl) {
      toast("Masukkan URL website terlebih dahulu.");
      return;
    }

    if (sourceType === "html" && !htmlFile) {
      toast("Pilih file HTML terlebih dahulu.");
      return;
    }

    const buildButton = $("#buildButton");
    const progressCard = $("#progressCard");
    const resultCard = $("#resultCard");
    const progressText = $("#progressText");
    const progressBar = $("#progressBar");
    const resultText = $("#resultText");
    const downloadLink = $("#downloadLink");

    resultCard.classList.add("hidden");
    progressCard.classList.remove("hidden");
    downloadLink.classList.add("hidden");
    progressText.textContent = "Mengirim konfigurasi ke backend...";
    progressBar.style.width = "20%";
    buildButton.disabled = true;
    buildButton.querySelector("span").textContent = "Memproses...";

    const formData = new FormData();
    formData.append("appName", appName);
    formData.append("packageName", packageName);
    formData.append("sourceType", sourceType);
    formData.append("orientation", orientation);
    formData.append("versionName", $("#versionName").value.trim());
    formData.append("versionCode", $("#versionCode").value);
    formData.append("splashType", $('input[name="splashType"]:checked')?.value || "default");

    if (sourceType === "url") formData.append("websiteUrl", websiteUrl);
    appendFormData(formData, "htmlFile", "htmlFile");
    appendFormData(formData, "zipFile", "zipFile");
    appendFormData(formData, "iconFile", "iconFile");
    appendFormData(formData, "splashImage", "splashImage");
    appendFormData(formData, "splashHtml", "splashHtml");
    appendFormData(formData, "splashVideo", "splashVideo");

    try {
      progressBar.style.width = "55%";

      const response = await fetch("/api/build", {
        method: "POST",
        body: formData
      });

      const rawText = await response.text();
      let data;

      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText || "Server mengembalikan respons kosong." };
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `Request gagal (${response.status}).`);
      }

      progressBar.style.width = "100%";
      progressText.textContent = "Backend merespons.";

      const downloadUrl =
        data.downloadUrl ||
        data.download_url ||
        data.apkUrl ||
        data.apk_url ||
        data.url;

      resultCard.classList.remove("hidden");
      resultText.textContent = data.message || "Permintaan build berhasil dikirim.";

      if (downloadUrl) {
        downloadLink.href = downloadUrl;
        downloadLink.classList.remove("hidden");
      } else if (data.success === false) {
        resultText.textContent = data.message || "Build gagal.";
      } else {
        resultText.textContent += " Jika proses build asinkron, periksa status melalui backend.";
      }

      toast("Respons backend diterima.");
    } catch (error) {
      progressCard.classList.add("hidden");
      resultCard.classList.remove("hidden");
      resultText.textContent = error.message || "Gagal menghubungi backend.";
      toast("Build gagal. Periksa konfigurasi backend API.");
    } finally {
      buildButton.disabled = false;
      buildButton.querySelector("span").textContent = "Build APK";
      refreshIcons();
    }
  });

  setSource("url");
  setSplashFields();
  refreshIcons();
})();