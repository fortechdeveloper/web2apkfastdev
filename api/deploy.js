export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Biar aman kalau file HTML-nya lumayan besar
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Gunakan metode POST.' });
  }

  const { projectName, htmlContent, iconBase64 } = req.body;
  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    return res.status(500).json({ success: false, error: 'Env var VERCEL_TOKEN belum diatur di Vercel.' });
  }

  if (!projectName || !htmlContent) {
    return res.status(400).json({ success: false, error: 'Nama project dan file HTML wajib diisi.' });
  }

  // 1. Format nama project (Vercel hanya izinkan huruf kecil, angka, dan strip)
  const cleanName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (cleanName.length < 3) {
    return res.status(400).json({ success: false, error: 'Nama project minimal 3 karakter dan hanya boleh huruf/angka.' });
  }

  try {
    // 2. Buat Project Baru di Vercel
    const createProjectRes = await fetch('https://api.vercel.com/v9/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: cleanName }),
    });

    const projectData = await createProjectRes.json();

    // Kalau error 409 (Conflict), artinya nama project udah dipake
    if (!createProjectRes.ok && projectData.error?.code !== 'project_already_exists') {
      throw new Error(projectData.error?.message || 'Gagal membuat project baru.');
    }

    // 3. Siapkan file yang mau di-deploy
    const files = [
      {
        file: 'index.html',
        data: htmlContent,
      },
    ];

    // Kalau ada icon, masukin ke folder public/favicon.ico dan favicon.png
    if (iconBase64) {
      const base64Data = iconBase64.split(',')[1] || iconBase64; // Hapus prefix data:image/...
      files.push({
        file: 'favicon.ico',
        data: base64Data,
        encoding: 'base64',
      });
      files.push({
        file: 'favicon.png',
        data: base64Data,
        encoding: 'base64',
      });
    }

    // 4. Proses Deployment
    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: cleanName,
        files: files,
        target: 'production',
        projectSettings: {
          framework: null, // Static HTML
          buildCommand: null,
          outputDirectory: null,
        },
      }),
    });

    const deployData = await deployRes.json();

    if (!deployRes.ok) {
      throw new Error(deployData.error?.message || 'Gagal melakukan deployment.');
    }

    // 5. Kembalikan URL live
    return res.status(200).json({
      success: true,
      url: `https://${deployData.url}`,
      projectName: cleanName,
      message: 'Website berhasil di-deploy!',
    });

  } catch (error) {
    console.error('Deploy Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan saat deploy ke Vercel.',
    });
  }
}